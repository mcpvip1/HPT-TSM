/**
 * @license
 * Temperature Test Report Pro - Service Worker
 * Enables offline loading and asset caching
 */

const CACHE_NAME = 'hpt-report-cache-v1';

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/style.css?v=20260919',
  'assets/images/logo.png',
  'assets/js/config.js?v=20260919',
  'assets/js/i18n.js?v=20260919',
  'assets/js/utils.js?v=20260919',
  'assets/js/parser.js?v=20260919',
  'assets/js/chart.js?v=20260919',
  'assets/js/dashboard.js?v=20260919',
  'assets/js/upload-dialog.js?v=20260919',
  'assets/js/exporter.js?v=20260919',
  'assets/js/main.js?v=20260919',
  'assets/js/queue.js?v=20260919',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Precache essentials, ignore individual non-fatal CDN fetch failures
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch((err) => {
              console.warn('[SW] Could not precache:', url, err);
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
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
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET and chrome-extension / firebase websocket requests
  if (request.method !== 'GET') return;
  if (url.origin.includes('firestore.googleapis.com') || url.origin.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  // Navigation requests: Network first, fall back to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('index.html') || caches.match('./');
        })
    );
    return;
  }

  // Static assets & CDN libraries: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
