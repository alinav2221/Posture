// Звуки через Web Audio (без файлов — работает офлайн) и вибрация.
import { settings } from './store.js';

let ctx = null;

export function unlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    // Беззвучный «пинок», чтобы Android разрешил звук после жеста.
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch { /* нет аудио — не страшно */ }
}

function tone(freq, dur, { type = 'sine', gain = 0.35, at = 0 } = {}) {
  if (!ctx || !settings.get().sound) return;
  try {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch { /* ignore */ }
}

function vib(pattern) {
  if (!settings.get().vibrate) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* ignore */ }
}

export const sounds = {
  tick() { tone(880, 0.1, { type: 'square', gain: 0.18 }); vib(50); },
  work() { tone(660, 0.1, { type: 'square', gain: 0.25 }); tone(1046, 0.35, { at: 0.11, gain: 0.3 }); vib([90, 50, 180]); },
  rest() { tone(523, 0.4, { type: 'triangle', gain: 0.3 }); vib(140); },
  finish() {
    tone(659, 0.15, { at: 0 });
    tone(784, 0.15, { at: 0.16 });
    tone(1046, 0.15, { at: 0.32 });
    tone(1318, 0.6, { at: 0.48, gain: 0.4 });
    vib([120, 60, 120, 60, 400]);
  },
  test() { tone(880, 0.15); vib(80); },
};
