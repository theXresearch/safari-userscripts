// 영상보기 페이지를 인터넷 없이도 열 수 있게 저장해 둠 (영상 파일은 페이지의 저장 공간에 따로 있음)
const CACHE = 'kw-videos-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// 페이지는 인터넷이 되면 새 것, 안 되면 저장해 둔 것
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !new URL(e.request.url).pathname.match(/\/videos\/(index\.html)?$/)) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
