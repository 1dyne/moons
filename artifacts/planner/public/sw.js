// Installable app shell. Network first; the planner needs the hub to save, so nothing is cached offline yet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
