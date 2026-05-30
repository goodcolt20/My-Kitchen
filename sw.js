const CACHE_VERSION = 'v4';
const CACHE_NAME = `my-kitchen-${CACHE_VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/db.js',
  '/js/api.js',
  '/js/categories.js',
  '/js/barcode.js',
  '/js/history.js',
  '/js/insights.js',
  '/js/shopping.js',
  '/js/shoppingui.js',
  '/js/inventory.js',
  '/js/scanner.js',
  '/js/recommendations.js',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Network-only for Claude API calls
  if (e.request.url.includes('api.anthropic.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
