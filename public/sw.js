const CACHE_NAME = 'iflow-iptv-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Let network handle media streams and proxies directly
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
