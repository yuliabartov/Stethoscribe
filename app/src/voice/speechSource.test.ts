// Tests for the continuous-session manager. iOS Safari ends recognition
// sessions constantly, and the recovery logic is the difference between a
// hands-free exam and a silently dead mic — so it's pinned down here with a
// fake recognizer and fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSpeechSource, isIOSDevice, isIOSStandalone, type SpeechHandlers } from './speechSource';

class FakeRec {
  static instances: FakeRec[] = [];
  static failNextStarts = 0;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  constructor() {
    FakeRec.instances.push(this);
  }
  start(): void {
    if (FakeRec.failNextStarts > 0) {
      FakeRec.failNextStarts--;
      throw new Error('InvalidStateError');
    }
    this.started = true;
  }
  stop(): void {
    this.onend?.();
  }
  abort(): void {
    // recycle() detaches handlers before aborting, so nothing fires here.
  }
}

function fireFinal(rec: FakeRec, text: string): void {
  rec.onresult?.({
    resultIndex: 0,
    results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
  });
}

function makeHandlers() {
  return {
    transcripts: [] as string[],
    errors: [] as string[],
    ended: 0,
    handlers: undefined as unknown as SpeechHandlers,
  };
}

describe('WebSpeechSource session management', () => {
  let h: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeRec.instances = [];
    FakeRec.failNextStarts = 0;
    (globalThis as Record<string, unknown>).window = { SpeechRecognition: FakeRec };
    h = makeHandlers();
    h.handlers = {
      onTranscript: (finalText) => h.transcripts.push(finalText),
      onError: (code) => h.errors.push(code),
      onEnd: () => h.ended++,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).window;
  });

  it('starts a continuous interim session', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    expect(FakeRec.instances).toHaveLength(1);
    const rec = FakeRec.instances[0];
    expect(rec.started).toBe(true);
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.lang).toBe('he-IL');
    src.stop();
  });

  it('reaches rec.start() synchronously within start() — no await before it', () => {
    // The iOS frozen-exam bug was rec.start() being reached AFTER an await,
    // outside the tap gesture, yielding a session that never fires results.
    // start() itself must arm the recognizer in the same synchronous tick;
    // callers must likewise not await anything before calling it on iOS.
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    // No microtask/timer has run yet — the recognizer is already started.
    expect(FakeRec.instances[0].started).toBe(true);
    src.stop();
  });

  it('spawns a FRESH instance after a session ends, preserving the transcript', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    const first = FakeRec.instances[0];
    fireFinal(first, 'heart rate 78');
    // long-lived session ends (iOS does this every ~30-60s)
    vi.advanceTimersByTime(30_000);
    first.onend?.();
    vi.advanceTimersByTime(2_000);
    expect(FakeRec.instances).toHaveLength(2);
    const second = FakeRec.instances[1];
    expect(second).not.toBe(first);
    expect(second.started).toBe(true);
    // transcript accumulates across instances
    fireFinal(second, 'lungs clear');
    expect(h.transcripts.at(-1)).toBe('heart rate 78 lungs clear');
    expect(h.errors).toHaveLength(0);
    src.stop();
  });

  it('retries when start() throws instead of dying silently', () => {
    const src = new WebSpeechSource('he-IL');
    FakeRec.failNextStarts = 2; // initial + first retry throw, then recover
    src.start(h.handlers);
    vi.advanceTimersByTime(5_000);
    const last = FakeRec.instances.at(-1)!;
    expect(last.started).toBe(true);
    expect(h.errors).toHaveLength(0);
    src.stop();
  });

  it('surfaces restart-failed when recovery is exhausted', () => {
    const src = new WebSpeechSource('he-IL');
    FakeRec.failNextStarts = 100; // never recovers
    src.start(h.handlers);
    vi.advanceTimersByTime(60_000);
    expect(h.errors).toContain('restart-failed');
    src.stop();
  });

  it('does not burn the retry budget on normal long-lived session rotations', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    // 20 healthy rotations: each session lives 30s then ends — must keep
    // restarting forever with no surfaced error.
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(30_000);
      FakeRec.instances.at(-1)!.onend?.();
      vi.advanceTimersByTime(3_000);
    }
    expect(FakeRec.instances.length).toBeGreaterThanOrEqual(21);
    expect(FakeRec.instances.at(-1)!.started).toBe(true);
    expect(h.errors).toHaveLength(0);
    src.stop();
  });

  it('recycles a zombie session once, then surfaces restart-failed instead of spinning silently', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    expect(FakeRec.instances).toHaveLength(1);
    // Born-dead session (e.g. started outside a user gesture on iOS):
    // started, but never fires a single event.
    vi.advanceTimersByTime(21_000); // first strike → quiet recycle
    expect(FakeRec.instances).toHaveLength(2);
    expect(FakeRec.instances.at(-1)!.started).toBe(true);
    expect(h.errors).toHaveLength(0);
    vi.advanceTimersByTime(21_000); // second strike → give up loudly
    expect(h.errors).toContain('restart-failed');
    const spawned = FakeRec.instances.length;
    vi.advanceTimersByTime(120_000); // watchdog fully stopped — no respawns
    expect(FakeRec.instances.length).toBe(spawned);
    src.stop();
  });

  it('honors a tighter zombie budget (standalone home-screen attempts)', () => {
    const src = new WebSpeechSource('he-IL', { zombieStrikes: 1 });
    src.start(h.handlers);
    vi.advanceTimersByTime(21_000); // first strike → immediate loud failure
    expect(h.errors).toContain('restart-failed');
    expect(FakeRec.instances).toHaveLength(1); // no quiet recycle first
    src.stop();
  });

  it('a single zombie recycle recovers quietly when the fresh session works', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    vi.advanceTimersByTime(21_000); // strike 1 → recycle
    const fresh = FakeRec.instances.at(-1)!;
    fireFinal(fresh, 'heart rate 78'); // recovered — strike counter resets
    // Without the reset, the next silent stretch would be strike 2 and fail;
    // with it, it's strike 1 again → just another quiet recycle.
    vi.advanceTimersByTime(25_000);
    expect(h.errors).toHaveLength(0);
    expect(h.transcripts.at(-1)).toBe('heart rate 78');
    src.stop();
  });

  it('stop() ends cleanly without a restart and fires onEnd', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    src.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeRec.instances).toHaveLength(1);
    expect(h.ended).toBe(1);
    expect(h.errors).toHaveLength(0);
  });

  it('stops the restart loop on fatal errors', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    const rec = FakeRec.instances[0];
    rec.onerror?.({ error: 'not-allowed' });
    rec.onend?.();
    vi.advanceTimersByTime(60_000);
    expect(h.errors).toEqual(['not-allowed']);
    expect(FakeRec.instances).toHaveLength(1); // no zombie respawns
    src.stop();
  });

  it('ignores transient no-speech noise', () => {
    const src = new WebSpeechSource('he-IL');
    src.start(h.handlers);
    FakeRec.instances[0].onerror?.({ error: 'no-speech' });
    expect(h.errors).toHaveLength(0);
    src.stop();
  });
});

// These predicates gate the whole iOS branch: startVoice/startDictation skip
// getUserMedia priming when isIOSDevice() is true (so recognition starts
// synchronously in the tap — the frozen-exam fix), and the standalone
// home-screen path keys off isIOSStandalone(). If detection regresses, the
// iOS fix silently regresses with it — so pin the UAs down.
describe('iOS platform detection', () => {
  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ipod: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  };

  function setPlatform(ua: string, maxTouchPoints = 0, opts?: { standalone?: boolean; displayModeStandalone?: boolean }) {
    vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints, standalone: opts?.standalone });
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({ matches: q.includes('standalone') ? !!opts?.displayModeStandalone : false }),
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('detects iPhone / iPod as iOS', () => {
    setPlatform(UA.iphone);
    expect(isIOSDevice()).toBe(true);
    setPlatform(UA.ipod);
    expect(isIOSDevice()).toBe(true);
  });

  it('detects an iPad even when iPadOS 13+ masquerades as Mac (touch points)', () => {
    setPlatform(UA.ipad, 5); // classic iPad UA
    expect(isIOSDevice()).toBe(true);
    setPlatform(UA.macDesktop, 5); // desktop-Safari UA but touch = iPad
    expect(isIOSDevice()).toBe(true);
  });

  it('does NOT flag Android, a real desktop Mac, or Windows as iOS', () => {
    setPlatform(UA.android, 5);
    expect(isIOSDevice()).toBe(false);
    setPlatform(UA.macDesktop, 0); // no touch → genuine desktop Mac
    expect(isIOSDevice()).toBe(false);
    setPlatform(UA.windows, 0);
    expect(isIOSDevice()).toBe(false);
  });

  it('detects the iOS home-screen app via navigator.standalone', () => {
    setPlatform(UA.iphone, 0, { standalone: true });
    expect(isIOSStandalone()).toBe(true);
  });

  it('detects the iOS home-screen app via display-mode: standalone', () => {
    setPlatform(UA.iphone, 0, { displayModeStandalone: true });
    expect(isIOSStandalone()).toBe(true);
  });

  it('is not standalone in iOS Safari (a browser tab)', () => {
    setPlatform(UA.iphone, 0, { standalone: false, displayModeStandalone: false });
    expect(isIOSStandalone()).toBe(false);
  });

  it('is never standalone on non-iOS, even in a PWA window', () => {
    // display-mode:standalone is true, but the platform isn't iOS → false,
    // so Android/desktop PWAs keep normal voice behavior.
    setPlatform(UA.android, 5, { displayModeStandalone: true });
    expect(isIOSStandalone()).toBe(false);
  });
});
