/*
  Lightweight service worker for offline caching and faster repeat loads.
  - Network-first for navigations (HTML)
  - Stale-while-revalidate for JS/CSS and CDN assets
*/

const CACHE_VERSION = 'v1';
const STATIC_CACHE_NAME = `static-${CACHE_VERSION}`;

const CDN_HOSTS = [
  'unpkg.com',
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      // Only cache minimal shell to avoid opaque cross-origin failures during install
      return cache.addAll(['/']);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('static-') && key !== STATIC_CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Network-first for HTML navigations to always show latest content
  const isHTMLNavigation = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');
  if (isHTMLNavigation) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Stale-while-revalidate for JS, CSS, and CDN assets
  const isStaticAsset =
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    request.destination === 'worker' ||
    CDN_HOSTS.includes(url.hostname);

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  try {
    const response = await fetch(request);
    // Clone and store a copy for offline
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // As a last resort, try the root
    const fallback = await cache.match('/');
    if (fallback) return fallback;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedPromise = cache.match(request);
  const networkPromise = fetch(request)
    .then((networkResponse) => {
      // Only cache successful (or opaque) responses
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => undefined);

  const cached = await cachedPromise;
  return cached || networkPromise || fetch(request);
}
