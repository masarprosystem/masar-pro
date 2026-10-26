// Masar Pro service worker: بيخلي السيستم يتسطب كتطبيق، ويفتح صفحة "مفيش نت" بدل صفحة فاضية.
// مبيخزنش بيانات المناديب ولا طلبات Supabase خالص.
const CACHE = 'masar-shell-v1';
const SHELL = ['/', '/brand/masar-logo.png', '/brand/pwa-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // الصفحات: من النت دايماً، ولو مفيش نت نفتح آخر نسخة من التطبيق
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/')),
    );
    return;
  }
  // ملفات البناء (أسماؤها فيها hash): من الكاش لو موجودة
  if (new URL(req.url).pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
