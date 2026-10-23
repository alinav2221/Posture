// Слой данных поверх db.js: видео, упражнения, тренировки, настройки.
import * as db from './db.js';

export const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const byDateDesc = (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

/* ---------- object URLs (кэш, чтобы не плодить утечки) ---------- */
const urlCache = new Map();
function cachedURL(key, blob) {
  if (!blob) return null;
  let url = urlCache.get(key);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(key, url);
  }
  return url;
}
function dropURL(key) {
  const url = urlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}
export const videoURL = (video) => cachedURL('v:' + video.id, video.blob);
export const thumbURL = (video) => cachedURL('t:' + video.id, video.thumb);

/* ---------- видео ---------- */
function stripExt(name) {
  return (name || 'Видео').replace(/\.[a-z0-9]{2,5}$/i, '');
}

// Длительность и кадр для превью. Любая ошибка -> thumb = null, duration = 0.
export function probeVideo(blob, { timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(res);
    };
    const timer = setTimeout(() => finish({ duration: v.duration || 0, thumb: null }), timeout);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('error', () => finish({ duration: 0, thumb: null }));
    v.addEventListener('loadedmetadata', () => {
      const duration = isFinite(v.duration) ? v.duration : 0;
      const t = Math.min(1, duration / 2);
      v.addEventListener('seeked', () => {
        try {
          const w = 320;
          const scale = w / (v.videoWidth || w);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = Math.round((v.videoHeight || w) * scale);
          canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((thumb) => finish({ duration, thumb }), 'image/jpeg', 0.72);
        } catch {
          finish({ duration, thumb: null });
        }
      }, { once: true });
      v.currentTime = t;
    });
    v.src = url;
  });
}

export const videos = {
  all: async () => (await db.getAll('videos')).sort(byNewest),
  get: (id) => db.get('videos', id),
  async add(file) {
    const { duration, thumb } = await probeVideo(file);
    const video = {
      id: uid(),
      name: stripExt(file.name),
      type: file.type || 'video/mp4',
      size: file.size,
      duration,
      thumb,
      blob: file,
      createdAt: Date.now(),
    };
    await db.put('videos', video);
    return video;
  },
  async rename(id, name) {
    const v = await db.get('videos', id);
    if (!v) return;
    v.name = name;
    await db.put('videos', v);
  },
  async remove(id) {
    await db.del('videos', id);
    dropURL('v:' + id);
    dropURL('t:' + id);
    // Отвязываем упражнения от удалённого видео.
    const exs = await db.getAll('exercises');
    for (const ex of exs) {
      if (ex.videoId === id) {
        ex.videoId = null;
        ex.start = 0;
        ex.end = null;
        await db.put('exercises', ex);
      }
    }
  },
};

/* ---------- упражнения ---------- */
export function newExercise(partial = {}) {
  return {
    id: uid(),
    name: '',
    videoId: null,
    start: 0,
    end: null, // null = до конца видео
    mode: 'interval', // 'interval' | 'sets'
    interval: { work: 40, rest: 15, rounds: 3 },
    sets: { sets: 3, reps: 12, rest: 60 },
    note: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

export const exercises = {
  all: async () => (await db.getAll('exercises')).sort(byDateDesc),
  get: (id) => db.get('exercises', id),
  async save(ex) {
    ex.updatedAt = Date.now();
    await db.put('exercises', ex);
    return ex;
  },
  async remove(id) {
    await db.del('exercises', id);
    const ws = await db.getAll('workouts');
    for (const w of ws) {
      if (w.items.includes(id)) {
        w.items = w.items.filter((x) => x !== id);
        await db.put('workouts', w);
      }
    }
  },
};

/* ---------- тренировки ---------- */
export function newWorkout(partial = {}) {
  return {
    id: uid(),
    name: '',
    items: [], // id упражнений по порядку
    restBetween: 20,
    lastDoneAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

export const workouts = {
  all: async () => (await db.getAll('workouts')).sort(byDateDesc),
  get: (id) => db.get('workouts', id),
  async save(w) {
    w.updatedAt = Date.now();
    await db.put('workouts', w);
    return w;
  },
  async markDone(id) {
    const w = await db.get('workouts', id);
    if (!w) return;
    w.lastDoneAt = Date.now();
    await db.put('workouts', w);
  },
  remove: (id) => db.del('workouts', id),
};

/* ---------- настройки (localStorage) ---------- */
const SETTINGS_KEY = 'trenka.settings';
const DEFAULTS = { sound: true, vibrate: true, prepare: 5, muteVideo: true };
let cached = null;
export const settings = {
  get() {
    if (cached) return cached;
    try {
      cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
      cached = { ...DEFAULTS };
    }
    return cached;
  },
  set(patch) {
    cached = { ...this.get(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cached)); } catch { /* приватный режим */ }
    return cached;
  },
};

/* ---------- хранилище: объём и постоянство ---------- */
export async function storageInfo() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage, quota, persisted };
  } catch {
    return null;
  }
}
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}
