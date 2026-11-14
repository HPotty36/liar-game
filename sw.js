// 오프라인에서도 열리게 하는 서비스 워커.
// 앱 파일은 캐시에서 바로 보여 주고 뒤에서 새 버전을 받아 둔다(다음에 열 때 적용).
// 글꼴(CDN)은 한 번 받은 뒤 캐시에서 쓴다.
const CACHE = 'liar-game-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && url.hostname !== 'cdn.jsdelivr.net') return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === 'navigate' ? './' : req;
      const hit = await cache.match(key);
      const fresh = fetch(req)
        .then((res) => { if (res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => null);
      if (hit) {
        if (sameOrigin) e.waitUntil(fresh);
        return hit;
      }
      return (await fresh) || new Response('오프라인입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
