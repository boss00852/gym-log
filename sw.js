// Service worker: แคช app shell (ไฟล์สถิตของโดเมนเราเท่านั้น)
// - ออนไลน์: ดึงของใหม่ทุกครั้งแบบ revalidate (cache: 'no-cache' → ถามเซิร์ฟเวอร์ด้วย ETag ถ้าไม่เปลี่ยนจะได้ 304 เร็วมาก)
//   จึงไม่ติดแคชของ GitHub Pages (max-age=600) และอัปเดตแอปถึงมือถือในการเปิดครั้งถัดไป ไม่ต้องรอ 10 นาที/เปิด 2 รอบ
// - ออฟไลน์หรือเน็ตช้าเกิน 3 วินาที: ใช้ของในแคช (เปิดแอปได้เสมอ)
// - ห้ามแคช API: ทุกคำขอข้ามโดเมน (script.google.com ฯลฯ) และทุกคำขอที่ไม่ใช่ GET ไม่ผ่าน SW เลย
const CACHE = 'gymlog-shell-v4'; // เพิ่มเลขเวอร์ชันเมื่อต้องการบังคับล้างแคชเก่า
const NET_TIMEOUT_MS = 3000;
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest',
  'css/app.css',
  'js/main.js', 'js/app.js', 'js/api.js', 'js/queue.js', 'js/store.js', 'js/util.js', 'js/date.js',
  'js/stats.js', 'js/timer.js', 'js/gyms.js', 'js/home.js', 'js/session.js', 'js/sheets.js', 'js/settings.js', 'js/gsi.js', 'js/viewport.js', 'js/version.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = ข้ามแคช HTTP ของเบราว์เซอร์ ได้ไฟล์ล่าสุดจริง ๆ ตอนติดตั้งเวอร์ชันใหม่
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function handle(e) {
  const req = e.request;
  const cache = await caches.open(CACHE);
  const net = fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
  net.catch(() => {}); // กัน unhandled rejection ตอนใช้แคชแทน
  let timer;
  const timeout = new Promise((r) => { timer = setTimeout(() => r(null), NET_TIMEOUT_MS); });
  try {
    const res = await Promise.race([net.catch(() => null), timeout]);
    if (res) return res;
  } finally {
    clearTimeout(timer);
  }
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) {
    e.waitUntil(net.catch(() => {})); // เน็ตช้า: ใช้แคชไปก่อน แต่ปล่อยให้ดึงของใหม่เก็บไว้ต่อ
    return hit;
  }
  const res = await net.catch(() => null);
  return res || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API / ฟอนต์ / POST: ไม่แตะ
  e.respondWith(handle(e));
});
