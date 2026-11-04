// Service worker: แคช app shell (ไฟล์สถิตของโดเมนเราเท่านั้น)
// - ไฟล์สถิต: cache-first (เปิดเร็ว/ออฟไลน์ได้) แล้วอัปเดตเบื้องหลังเพื่อให้ได้เวอร์ชันใหม่ในการเปิดครั้งถัดไป
// - ห้ามแคช API: ทุกคำขอข้ามโดเมน (script.google.com ฯลฯ) และทุกคำขอที่ไม่ใช่ GET ไม่ผ่าน SW เลย
const CACHE = 'gymlog-shell-v2'; // เพิ่มเลขเวอร์ชันเมื่อต้องการบังคับล้างแคชเก่า
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest',
  'css/app.css',
  'js/main.js', 'js/app.js', 'js/api.js', 'js/queue.js', 'js/store.js', 'js/util.js', 'js/date.js',
  'js/stats.js', 'js/timer.js', 'js/gyms.js', 'js/home.js', 'js/session.js', 'js/sheets.js', 'js/settings.js', 'js/gsi.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API / ฟอนต์ / POST: ไม่แตะ
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        e.waitUntil(net);
        return hit;
      }
      const res = await net;
      return res || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    })
  );
});
