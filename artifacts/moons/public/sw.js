// MOONS service worker: makes the app installable and shows a short notice when offline.
// Nothing is cached, so an installed app always opens the latest deploy and your synced data.
const OFFLINE = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MOONS</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#303b33;text-align:center">
<div><p style="font-size:18px;font-weight:600">지금은 연결이 끊겨 있어요</p><p style="color:#78796e">인터넷이 돌아오면 다시 열어 주세요. 써 둔 기록은 서버에 그대로 있어요.</p>
<button onclick="location.reload()" style="margin-top:8px;padding:10px 18px;border-radius:99px;border:0;background:#303b33;color:#fff;font-size:15px">다시 시도</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, {headers: {'Content-Type': 'text/html; charset=utf-8'}})));
});
