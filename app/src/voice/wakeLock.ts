// Screen wake lock. (Spec §5.2 — the doctor must not touch the device.)
//
// A sleeping display suspends SpeechRecognition, which silently kills a
// hands-free session the doctor may not glance at for minutes. While a lock
// is wanted, the browser auto-releases it whenever the tab is hidden — so we
// re-acquire on visibilitychange until explicitly released.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!('wakeLock' in navigator)) return; // unsupported browser — non-fatal
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!wanted) {
      // Released while the request was in flight — don't hold a stray lock.
      lock.release().catch(() => {});
      return;
    }
    sentinel = lock;
  } catch {
    // Denied (battery saver, browser policy) — the session works regardless.
  }
}

function onVisibilityChange(): void {
  if (wanted && document.visibilityState === 'visible') void acquire();
}

export function keepScreenAwake(): void {
  if (wanted) return;
  wanted = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  void acquire();
}

export function releaseScreenWakeLock(): void {
  if (!wanted) return;
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  sentinel?.release().catch(() => {});
  sentinel = null;
}
