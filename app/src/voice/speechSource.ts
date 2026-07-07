// Speech source abstraction. (Spec §9, §14)
//
// Today: the browser Web Speech API, used only on phones (the spec rejects it
// for the desktop/web exam flow). Tomorrow: a native iOS/Android engine plugged
// in behind this same shape — the capture engine downstream never changes.

export interface SpeechHandlers {
  /** finalText = full accumulated finalized transcript; interim = in-progress
   * words. altFinals (optional) = full-transcript variants where only the most
   * recent finalized utterance is swapped for the recognizer's lower-ranked
   * hypotheses — used downstream to disambiguate Number/List captures. */
  onTranscript: (finalText: string, interim: string, altFinals?: string[]) => void;
  onError: (code: string) => void;
  onEnd: () => void;
}

// Minimal typings for the (non-standard) Web Speech API.
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
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

/** Android phone/tablet detection — used to pick the smoother same-instance
 * restart strategy (see SpeechSourceOptions.restartMode). */
export function isAndroidDevice(): boolean {
  return /android/i.test(navigator.userAgent || '');
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
// Android same-instance restarts reuse the warmed-up recognizer, so the gap only
// needs to be long enough to clear the just-ended session — not the full
// fresh-instance delay.
const SAME_RESTART_DELAY_MS = 30;
// Lower-ranked hypotheses to request per result — the 2nd/3rd are fed into
// Number/List disambiguation downstream (see processTranscriptMulti).
const MAX_ALTERNATIVES = 3;
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
  /** How to restart after a session ends normally. 'fresh' spawns a new
   * recognizer instance each time — required on iOS, where restarting the same
   * instance dies silently. 'same' re-arms the warmed-up instance with a tiny
   * gap — right for Android, where the fresh-instance + 250ms delay drops the
   * first words the doctor says after every pause. Default 'fresh'. */
  restartMode?: 'fresh' | 'same';
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
  private restartMode: 'fresh' | 'same';
  private sessionStartedAt = 0;
  private lastEventAt = 0;

  constructor(lang: string, opts?: SpeechSourceOptions) {
    this.lang = lang;
    this.zombieStrikeLimit = opts?.zombieStrikes ?? MAX_ZOMBIE_RECYCLES;
    this.restartMode = opts?.restartMode ?? 'fresh';
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

  /** Android normal-restart path: re-arm the SAME (warmed-up) recognizer after a
   * tiny delay instead of spawning a fresh instance. Falls back to a fresh
   * instance if the browser refuses to restart the just-ended session. */
  private restartSame(rec: SpeechRec): void {
    if (!this.active) return;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      // Superseded while we waited (e.g. the watchdog recycled to a fresh one).
      if (!this.active || this.rec !== rec) return;
      this.sessionStartedAt = Date.now();
      this.lastEventAt = Date.now(); // don't let the watchdog count the restart gap as stale
      try {
        rec.start();
      } catch {
        // Raced the ended session's teardown — spawn a fresh instance instead.
        this.recycle();
      }
    }, SAME_RESTART_DELAY_MS);
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
    rec.maxAlternatives = MAX_ALTERNATIVES;

    rec.onresult = (e) => {
      this.lastEventAt = Date.now();
      this.restartAttempts = 0; // producing results ⇒ the session is healthy
      this.zombieRecycles = 0;
      let interim = '';
      let sawFinal = false;
      let lastSegAlts: string[] = [];
      let lastSegPrefix = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) {
          // Snapshot this utterance's alternatives + the transcript BEFORE it, so
          // we can offer full-transcript variants that differ only in this last
          // utterance. A burst of finals keeps only the newest (the older ones
          // are already folded into finalText and are less useful to revisit).
          lastSegPrefix = this.finalText;
          lastSegAlts = [];
          const n = Math.min(r.length || 1, MAX_ALTERNATIVES);
          for (let k = 0; k < n; k++) {
            const alt = r[k]?.transcript?.trim();
            if (alt) lastSegAlts.push(alt);
          }
          this.finalText += (this.finalText ? ' ' : '') + text;
          sawFinal = true;
        } else {
          interim += text + ' ';
        }
      }
      // Offer the lower-ranked hypotheses (skip index 0 — that's the primary
      // already in finalText) as full-transcript variants.
      let altFinals: string[] | undefined;
      if (sawFinal && lastSegAlts.length > 1) {
        altFinals = lastSegAlts.slice(1).map((a) => (lastSegPrefix ? lastSegPrefix + ' ' + a : a));
      }
      handlers.onTranscript(this.finalText, interim.trim(), altFinals);
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
      const wasCurrent = this.rec === rec;
      if (!this.active) {
        if (wasCurrent) this.rec = null;
        handlers.onEnd();
        return;
      }
      // A session that lived a while ended normally (silence / engine
      // rotation) — that shouldn't eat into the retry budget. Only instant
      // deaths count, so a start-fail loop still exhausts and surfaces.
      const livedLongEnough = Date.now() - this.sessionStartedAt >= QUICK_DEATH_MS;
      if (livedLongEnough) this.restartAttempts = 0;
      // Android: re-arm the SAME warmed-up recognizer (tiny gap) rather than
      // spawning a fresh instance after 250ms — the fresh-instance dance exists
      // only because iOS same-instance restarts die silently, and on Android it
      // drops the first words after every pause. A quick death still falls
      // through to the fresh-instance path so a real failure loop surfaces.
      if (this.restartMode === 'same' && wasCurrent && livedLongEnough) {
        this.restartSame(rec);
        return;
      }
      if (wasCurrent) this.rec = null;
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
