const CACHE_VERSION = 'v1';
const CACHE_NAME = `pwa-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-cache-${CACHE_VERSION}`;

// Update this list with all shell resources you want cached on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  'icon-256.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Helper: limit runtime cache size
async function limitCacheSize(cacheName, maxItems = 50) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    await limitCacheSize(cacheName, maxItems);
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests
  if (request.method !== 'GET') return;

  // Navigation requests (HTML pages) => network-first, fallback to cache -> offline
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Put a copy in the runtime cache
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('offline.html'))
    );
    return;
  }

  // Static assets (images, CSS, JS) => cache-first
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => {
          cache.put(request, copy);
          limitCacheSize(RUNTIME_CACHE, 60);
        });
        return response;
      }).catch(() => {
        // Optionally return a fallback image for images
        if (request.destination === 'image') return caches.match('icon-512.png');
      }))
    );
    return;
  }

  // Default: try network then cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
