// ตรวจเบราว์เซอร์จริงเบื้องต้น: ไม่มี console error, service worker ลงทะเบียน, ไฟล์สถิตถูกแคช, API ไม่ถูกแคช
import { chromium } from 'playwright';
import { serve } from '../tests/serve.mjs';
const srv = await serve(4174);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:4174/index.html');
await p.waitForSelector('#s-url'); // ยังไม่ตั้งค่า → หน้าตั้งค่า
await p.evaluate(() => navigator.serviceWorker.ready);
await p.waitForTimeout(500);
const info = await p.evaluate(async () => {
  const keys = await caches.keys();
  const c = await caches.open(keys[0]);
  const urls = (await c.keys()).map((r) => new URL(r.url).pathname);
  const m = await (await fetch('manifest.webmanifest')).json();
  return { keys, n: urls.length, hasIndex: urls.includes('/index.html'), hasJs: urls.includes('/js/app.js'), anyApi: urls.some((u) => u.includes('macros')), manifest: m.name, ctrl: !!navigator.serviceWorker.controller };
});
console.log(JSON.stringify(info), 'errors:', errs.filter((e) => !/fonts\.g|ERR_|Failed to load resource/.test(e)));
// ออฟไลน์: โหลดซ้ำได้จากแคช
await p.reload();
await ctx.setOffline(true);
await p.reload();
console.log('offline reload ok:', await p.locator('#s-url').count() === 1);
await b.close(); srv.close();
