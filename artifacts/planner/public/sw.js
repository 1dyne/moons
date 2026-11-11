// Installable app shell. Pages and code are cached so the planner opens without a connection;
// reads fall back to the last copy, and writes made offline wait in the page's queue (src/offline.ts).
const CACHE = 'lit-v3';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const networkFirst = async (request, fallbackKey) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackKey ?? request, res.clone());
    return res;
  } catch {
    return (await cache.match(fallbackKey ?? request)) ?? Response.error();
  }
};
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, '/')); return; }
  if (url.pathname.startsWith('/assets/')) {
    // Hashed file names never change: cache first.
    event.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) ?? fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })));
    return;
  }
  if (/^\/api\/life\/v1\/(items|spec|settings)(\?|$)/.test(url.pathname + url.search.slice(0, 1))) event.respondWith(networkFirst(req));
});
