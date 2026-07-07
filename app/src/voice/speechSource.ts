// Speech source abstraction. (Spec §9, §14)
//
// Today: the browser Web Speech API, used only on phones (the spec rejects it
// for the desktop/web exam flow). Tomorrow: a native iOS/Android engine plugged
// in behind this same shape — the capture engine downstream never changes.

export interface SpeechHandlers {
  /** finalText = full accumulated finalized transcript; interim = in-progress words. */
  onTranscript: (finalText: string, interim: string) => void;
  onError: (code: string) => void;
  onEnd: () => void;
}

// Minimal typings for the (non-standard) Web Speech API.
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
interface SREvent {
  resultIndex: number;
  results: SRResultList;
}
interface SRErrorEvent {
  error: string;
}
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SRCtor = new () => SpeechRec;

function getSRCtor(): SRCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function isSpeechSupported(): boolean {
  return !!getSRCtor();
}

/** Phone (iOS/Android) detection — voice is phone-only by product decision. */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent || '';
  if (/android|iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS reports as "Mac" but exposes touch points.
  return /Mac/.test(ua) && navigator.maxTouchPoints > 1;
}

/** iPhone/iPad detection (iPadOS 13+ reports as Mac but exposes touch). */
export function isIOSDevice(): boolean {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Mac/.test(ua) && navigator.maxTouchPoints > 1;
}

/** iOS home-screen web app ("Add to Home Screen"). On iOS, SpeechRecognition
 * only works in Safari proper — in standalone mode the constructor exists but
 * sessions yield nothing (the spec explicitly rejects PWA mode for the exam,
 * §14). Detect it so the app says so instead of appearing to listen. */
export function isIOSStandalone(): boolean {
  if (!isIOSDevice()) return false;
  const nav = navigator as { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

// Pre-request microphone access. Call this early (e.g. after sign-in) so the
// exam can start without an extra prompt, and again from any code path that's
// about to open a live mic stream — the first check is silent (Permissions
// API), only a real 'prompt' state falls through to getUserMedia.
//
// Persistence is a browser policy: Chrome/Firefox persist per-origin grants
// across reloads by default; iOS Safari may not. Nothing we do from JS forces
// the browser to remember — a "granted" hint in localStorage would only
// mislead our code into skipping getUserMedia while the browser silently
// re-prompts SpeechRecognition later. So we deliberately DON'T cache grants
// beyond the in-memory session flag.
let micGranted = false;

export async function ensureMicPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (micGranted) return 'granted';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';

  // Silent check first — if the browser already has the grant persisted, this
  // returns 'granted' without opening the mic stream (which would briefly
  // flash the recording indicator on iOS).
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') { micGranted = true; return 'granted'; }
    if (status.state === 'denied') return 'denied';
    // 'prompt' → fall through and actually request
  } catch { /* Permissions API may not support 'microphone' (Safari <16) */ }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    micGranted = true;
    return 'granted';
  } catch {
    return 'denied';
  }
}

// Continuous-session management (spec §16 "continuous-session handling").
//
// iOS Safari ends recognition sessions every ~30-60s and after silences.
// Restarting the SAME recognizer instance synchronously from its own onend —
// what this class used to do — intermittently throws on Safari, or "succeeds"
// into a dead session that never fires onresult again. The old code swallowed
// that (`catch { ignore }`), so listening died silently mid-exam: frozen
// "hearing…" text, fields no longer filling, "Live" still blinking. So now:
//
//  - every (re)start uses a FRESH SpeechRecognition instance,
//  - restarts are deferred a beat and retried with backoff, not fired
//    synchronously inside onend,
//  - sessions that die instantly after starting count against a retry
//    budget; when it's exhausted we surface 'restart-failed' instead of
//    pretending to listen,
//  - a watchdog recycles a "zombie" session that has produced no events at
//    all for too long (a healthy one fires results / no-speech / end within
//    seconds; recycling during real silence is harmless — the accumulated
//    transcript lives on this object, not on the instance).
const RESTART_DELAY_MS = 250;
const MAX_RESTART_ATTEMPTS = 8;
const QUICK_DEATH_MS = 1_000;
const WATCHDOG_INTERVAL_MS = 5_000;
const STALE_SESSION_MS = 15_000;
// Consecutive zombie recycles (sessions that produced no events at all)
// before giving up — a session CAN be born dead on iOS (e.g. started outside
// a user gesture), and endlessly recycling it just hides the failure.
const MAX_ZOMBIE_RECYCLES = 2;

export interface SpeechSourceOptions {
  /** Consecutive zombie recycles before giving up (default 2). iOS
   * home-screen (standalone) attempts pass 1, so if recognition is
   * platform-restricted there the doctor learns in ~20s, not ~40s. */
  zombieStrikes?: number;
}

export class WebSpeechSource {
  private rec: SpeechRec | null = null;
  private finalText = '';
  private active = false;
  private lang: string;
  private handlers: SpeechHandlers | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private restartAttempts = 0;
  private zombieRecycles = 0;
  private zombieStrikeLimit: number;
  private sessionStartedAt = 0;
  private lastEventAt = 0;

  constructor(lang: string, opts?: SpeechSourceOptions) {
    this.lang = lang;
    this.zombieStrikeLimit = opts?.zombieStrikes ?? MAX_ZOMBIE_RECYCLES;
  }

  start(handlers: SpeechHandlers): void {
    if (!getSRCtor()) {
      handlers.onError('unsupported');
      return;
    }
    this.handlers = handlers;
    this.finalText = '';
    this.active = true;
    this.restartAttempts = 0;
    this.zombieRecycles = 0;
    this.lastEventAt = Date.now();
    this.spawn();
    this.watchdog = setInterval(() => {
      if (!this.active) return;
      if (Date.now() - this.lastEventAt > STALE_SESSION_MS) {
        // No events at all for this long = zombie session. Recycle once or
        // twice, then SURFACE the failure — never spin silently forever.
        this.zombieRecycles++;
        if (this.zombieRecycles >= this.zombieStrikeLimit) {
          this.fail();
          return;
        }
        this.lastEventAt = Date.now();
        this.recycle();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  /** Recovery is over: tear everything down and tell the caller — a dead mic
   * must be visible, not a frozen-looking exam. */
  private fail(): void {
    this.active = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    if (this.rec) {
      this.rec.onresult = null;
      this.rec.onerror = null;
      this.rec.onend = null;
      try {
        this.rec.abort();
      } catch {
        /* already gone */
      }
      this.rec = null;
    }
    this.handlers?.onError('restart-failed');
  }

  /** Tear down the current instance without firing its handlers, then start a
   * fresh one. Used by the restart path and the zombie watchdog. */
  private recycle(): void {
    if (this.rec) {
      this.rec.onresult = null;
      this.rec.onerror = null;
      this.rec.onend = null;
      try {
        this.rec.abort();
      } catch {
        /* already gone */
      }
      this.rec = null;
    }
    this.spawn();
  }

  private scheduleRestart(): void {
    if (!this.active || this.restartTimer) return;
    this.restartAttempts++;
    if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
      this.fail();
      return;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.active) this.recycle();
    }, RESTART_DELAY_MS * this.restartAttempts);
  }

  private spawn(): void {
    const Ctor = getSRCtor();
    const handlers = this.handlers;
    if (!Ctor || !handlers || !this.active) return;

    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      this.lastEventAt = Date.now();
      this.restartAttempts = 0; // producing results ⇒ the session is healthy
      this.zombieRecycles = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) this.finalText += (this.finalText ? ' ' : '') + text;
        else interim += text + ' ';
      }
      handlers.onTranscript(this.finalText, interim.trim());
    };

    rec.onerror = (e) => {
      this.lastEventAt = Date.now();
      this.zombieRecycles = 0; // any real event means the session isn't a zombie
      // These are normal in continuous use (silence, our own stop) — don't surface.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      // Fatal errors (Hebrew not supported by this browser, permission denied,
      // no mic, no connectivity — Chrome's engine round-trips to Google's
      // servers, so a dropped connection surfaces here) — stop the auto-restart
      // loop instead of spinning on them.
      if (
        e.error === 'not-allowed' ||
        e.error === 'service-not-allowed' ||
        e.error === 'language-not-supported' ||
        e.error === 'audio-capture' ||
        e.error === 'network'
      ) {
        this.active = false;
      }
      handlers.onError(e.error);
    };

    rec.onend = () => {
      this.lastEventAt = Date.now();
      this.zombieRecycles = 0; // any real event means the session isn't a zombie
      if (this.rec === rec) this.rec = null;
      if (!this.active) {
        handlers.onEnd();
        return;
      }
      // A session that lived a while ended normally (silence / engine
      // rotation) — that shouldn't eat into the retry budget. Only instant
      // deaths count, so a start-fail loop still exhausts and surfaces.
      if (Date.now() - this.sessionStartedAt >= QUICK_DEATH_MS) this.restartAttempts = 0;
      this.scheduleRestart();
    };

    this.rec = rec;
    this.sessionStartedAt = Date.now();
    try {
      rec.start();
    } catch {
      // Start can race the previous session's teardown — retry, don't die.
      this.rec = null;
      this.scheduleRestart();
    }
  }

  stop(): void {
    this.active = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
  }

  get finalTranscript(): string {
    return this.finalText;
  }
}
