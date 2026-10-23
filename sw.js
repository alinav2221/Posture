// Service worker: кладём оболочку приложения в кэш, чтобы всё открывалось без интернета.
// При любом изменении файлов повышай версию CACHE — иначе телефон останется на старой копии.
const CACHE = 'posture-v0.1.1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/version.js',
  './js/db.js',
  './js/store.js',
  './js/timer.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/ui.js',
  './js/views/home.js',
  './js/views/workoutEdit.js',
  './js/views/exercises.js',
  './js/views/exerciseEdit.js',
  './js/views/videos.js',
  './js/views/player.js',
  './js/views/settings.js',
  './fonts/unbounded-cyrillic.woff2',
  './fonts/unbounded-latin.woff2',
  './fonts/onest-cyrillic.woff2',
  './fonts/onest-latin.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .catch((err) => { console.error('[sw] не удалось закэшировать файлы:', err); throw err; }),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && url.pathname.match(/\.(js|css|woff2|png|svg|webmanifest|html)$/)) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    } catch (err) {
      return new Response('Офлайн', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
