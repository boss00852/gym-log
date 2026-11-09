// พิสูจน์ในเบราว์เซอร์จริงว่าเวอร์ชันใหม่ถึงเครื่องเร็ว: เปิดแอปเวอร์ชันเก่า (ให้ service worker แคช) → เปลี่ยนไฟล์บนเซิร์ฟเวอร์ →
// เปิดซ้ำ ต้องได้ของใหม่ภายใน 1 รอบ (และรีโหลดเองเมื่อ service worker ใหม่เข้าคุม)
// ใช้สำเนาโปรเจกต์ใน temp เท่านั้น ไม่แตะไฟล์จริง:  node tools/update-check.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gymlog-upd-'));
for (const f of ['index.html', 'config.js', 'manifest.webmanifest', 'sw.js']) fs.copyFileSync(path.join(src, f), path.join(tmp, f));
for (const d of ['css', 'js', 'icons']) fs.cpSync(path.join(src, d), path.join(tmp, d), { recursive: true });
process.env.GYM_ROOT = tmp;
const { serve } = await import('./../tests/serve.mjs');

// เซิร์ฟเวอร์จำลอง GitHub Pages: ใส่ Cache-Control: max-age=600 เหมือนของจริง (ตัวที่ทำให้เวอร์ชันเก่าค้าง)
import http from 'node:http';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(tmp, p);
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    const etag = '"' + buf.length + '-' + fs.statSync(f).mtimeMs + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag, 'cache-control': 'max-age=600' }).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600', etag });
    res.end(buf);
  });
});
await new Promise((ok) => srv.listen(4175, ok));
(await serve(4176)).close(); // โหลดโมดูลตามที่ import ไว้ (ไม่ใช้งานจริง)

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const url = 'http://localhost:4175/index.html';
const marker = () => page.evaluate(() => window.__gl && window.__gl.doc.getElementById('s-vtext') ? 1 : 0);

await page.goto(url);
await page.waitForSelector('#s-url, .cta');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // ให้ SW คุมหน้า + แคชไฟล์
await page.waitForTimeout(500);
const ver1 = await page.evaluate(async () => (await import('./js/version.js')).APP_VERSION);

// "ปล่อยเวอร์ชันใหม่": เปลี่ยน version.js + sw.js (เปลี่ยนเลขแคช) บนเซิร์ฟเวอร์
const vf = path.join(tmp, 'js/version.js');
fs.writeFileSync(vf, fs.readFileSync(vf, 'utf8').replace(/APP_VERSION = '[^']+'/, "APP_VERSION = 'NEW-RELEASE'"));
const sf = path.join(tmp, 'sw.js');
fs.writeFileSync(sf, fs.readFileSync(sf, 'utf8').replace(/gymlog-shell-v\d+/, 'gymlog-shell-v999'));

// เปิดแอปอีกครั้ง (1 รอบ) — SW ใหม่ติดตั้ง/เข้าคุมแล้วหน้ารีโหลดเอง
await page.goto(url);
await page.waitForTimeout(2500);
const ver2 = await page.evaluate(async () => (await import('./js/version.js')).APP_VERSION);
const caches_ = await page.evaluate(() => caches.keys());
console.log(JSON.stringify({ before: ver1, afterOneOpen: ver2, cacheKeys: caches_ }));
await b.close();
srv.close();
if (ver2 !== 'NEW-RELEASE') { console.error('FAIL: เปิด 1 รอบแล้วยังได้เวอร์ชันเก่า'); process.exit(1); }
console.log('PASS: เวอร์ชันใหม่ถึงภายในการเปิดรอบเดียว');
