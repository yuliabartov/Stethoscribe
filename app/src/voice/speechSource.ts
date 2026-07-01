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

export class WebSpeechSource {
  private rec: SpeechRec | null = null;
  private finalText = '';
  private active = false;
  private lang: string;

  constructor(lang: string) {
    this.lang = lang;
  }

  start(handlers: SpeechHandlers): void {
    const Ctor = getSRCtor();
    if (!Ctor) {
      handlers.onError('unsupported');
      return;
    }
    this.finalText = '';
    this.active = true;

    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
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
      // These are normal in continuous use (silence, our own stop) — don't surface.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      // Fatal errors (Hebrew not supported by this browser, permission denied,
      // no mic) — stop the auto-restart loop instead of spinning on them.
      if (
        e.error === 'not-allowed' ||
        e.error === 'service-not-allowed' ||
        e.error === 'language-not-supported' ||
        e.error === 'audio-capture'
      ) {
        this.active = false;
      }
      handlers.onError(e.error);
    };

    // iOS/Safari ends sessions frequently; restart while still active to keep
    // the exam hands-free. (Spec §16, continuous-session handling.)
    rec.onend = () => {
      if (this.active) {
        try {
          rec.start();
        } catch {
          /* a restart can race; ignore */
        }
      } else {
        handlers.onEnd();
      }
    };

    this.rec = rec;
    try {
      rec.start();
    } catch {
      handlers.onError('start-failed');
    }
  }

  stop(): void {
    this.active = false;
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
