// Forge Studio — service worker
// Caches the app shell + the CDN libraries (three.js, loaders, exporters, fflate) the first time
// they're fetched, then serves everything from cache on later launches — including with no
// internet connection at all. Bump CACHE_NAME any time index.html changes so old caches are
// dropped and the new version gets fetched fresh once.
const CACHE_NAME = 'forge-studio-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/fflate@0.7.4/umd/index.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/modifiers/SimplifyModifier.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // App shell must succeed; CDN libs are cached best-effort (a flaky one shouldn't block install —
      // they'll just get cached the first time they're actually fetched successfully instead).
      return cache.addAll(APP_SHELL).then(() =>
        Promise.allSettled(CDN_LIBS.map((url) => cache.add(new Request(url, { mode: 'cors' }))))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache successful, cacheable responses (opaque cross-origin CDN responses are fine too).
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Offline and not cached yet (e.g. first-ever launch without internet) — nothing more we can do
        // for a CDN script, but for navigations at least fall back to the shell if it's cached.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline and not cached yet' });
      });
    })
  );
});
