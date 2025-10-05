/* Simple PWA service worker for HolisticWell */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/favicon.svg',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
  '/site.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return; // pass through non-GET
  }

  // Navigation requests: network-first, fallback to cached index or offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(STATIC_CACHE);
          const cachedIndex = await cache.match('/index.html');
          return cachedIndex || cache.match(OFFLINE_URL);
        })
    );
    return;
  }

  const url = new URL(request.url);

  // Same-origin: cache-first for static assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, networkResponse.clone()))
                .catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Cross-origin: network-first with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
