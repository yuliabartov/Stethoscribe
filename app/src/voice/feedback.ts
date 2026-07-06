// Non-visual confirmation for hands-free capture. (Spec §5.2 — the doctor
// doesn't look at the screen, so success/failure must be audible/tactile.)
//
// Earcons are synthesized with WebAudio — no audio assets, nothing fetched.
// Browsers only allow an AudioContext to produce sound after a user gesture,
// so primeAudioFeedback() is called from the Start Exam / dictation taps.
//
// iOS EXCEPTION: WebAudio and SpeechRecognition share one AVAudioSession on
// iOS Safari. Instantiating an AudioContext (or scheduling a tone) forces
// the session into a category that silently drops SpeechRecognition results,
// which was stalling the live "hearing…" text and stopping fields from
// filling during an exam. On iOS we skip WebAudio entirely — no capture
// earcon, but the exam works. (iOS Safari has no vibration API either, so
// feedback on iPhone is currently visual-only until we have a native shell.)
import { isIOSDevice } from './speechSource';

const AUDIO_DISABLED = isIOSDevice();

let ctx: AudioContext | null = null;

export function primeAudioFeedback(): void {
  if (AUDIO_DISABLED) return;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // No WebAudio — the vibration fallback below may still work.
  }
}

function tone(freq: number, at: number, dur: number, type: OscillatorType, peak: number): void {
  if (AUDIO_DISABLED || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Fast attack/decay envelope so the blip starts and ends without clicks.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function vibrate(pattern: number | number[]): void {
  // iOS Safari has no vibration API; Android Chrome does.
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

let lastCaptureAt = 0;

/** Short rising two-tone blip + tick vibration: a finding was captured. */
export function playCaptureFeedback(): void {
  const now = Date.now();
  if (now - lastCaptureAt < 350) return; // several fields in one phrase → one blip
  lastCaptureAt = now;
  tone(880, 0, 0.1, 'sine', 0.12);
  tone(1318.5, 0.08, 0.14, 'sine', 0.12);
  vibrate(30);
}

/** Low double buzz + long vibration: voice capture failed and stopped. */
export function playFailureFeedback(): void {
  tone(196, 0, 0.2, 'square', 0.08);
  tone(147, 0.24, 0.3, 'square', 0.08);
  vibrate([120, 60, 180]);
}

/** Mic errors that end/prevent listening (vs. transient no-speech noise). */
export const FATAL_MIC_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'language-not-supported',
  'audio-capture',
  'network',
  'start-failed',
  'restart-failed',
  'standalone',
  'unsupported',
]);
