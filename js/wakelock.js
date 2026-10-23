// Не даём экрану гаснуть во время тренировки (Screen Wake Lock API).
let lock = null;
let wanted = false;

export async function acquire() {
  wanted = true;
  if (lock) return;
  try {
    if (!('wakeLock' in navigator)) return;
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { lock = null; }
}

export async function release() {
  wanted = false;
  try { if (lock) await lock.release(); } catch { /* ignore */ }
  lock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted && !lock) acquire();
});
