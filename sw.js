/* HolisticWell service worker - cache app shell and CDN assets */
const CACHE_PREFIX = 'holisticwell-cache-';
const CACHE_VERSION = 'v1';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL = ['/', '/index.html'];
const CDN_HOSTS = new Set(['unpkg.com', 'cdnjs.cloudflare.com', 'cdn.tailwindcss.com']);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Network-first for navigations (HTML) so content updates quickly
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('/index.html')) || Response.error();
        })
    );
    return;
  }

  // Stale-while-revalidate for CDN assets (scripts, styles, fonts)
  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((response) => {
          // Cache opaque or successful responses
          if (response && (response.status === 200 || response.type === 'opaque')) {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Default: try cache, then network
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
