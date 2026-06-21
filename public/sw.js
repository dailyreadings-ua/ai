const CACHE_NAME = 'readings-pwa-v1';
const ASSETS = [
  '/ai/',
  '/ai/index.html',
  '/ai/manifest.json',
  '/ai/icon.svg',
  '/ai/icon-192.png',
  '/ai/icon-512.png',
  '/ai/fund1.json',
  '/ai/fund2.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Pre-caching assets failed:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and exclude development websocket or reload endpoints
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/socket.io') ||
    event.request.url.includes('hot-update') ||
    event.request.url.includes('/@vite/') ||
    event.request.url.includes('/@id/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background to update cache (stale-while-revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {/* Ignore network failures */});

        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback if offline
          if (event.request.mode === 'navigate') {
            return caches.match('/ai/index.html') || caches.match('/ai/');
          }
        });
    })
  );
});
