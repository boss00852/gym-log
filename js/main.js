import { createApp } from './app.js';
import { createApi } from './api.js';
import { createStorage } from './store.js';

let ls = null;
try { ls = window.localStorage; } catch (e) {}
const storage = createStorage(ls);
const cfg = window.GYMLOG_CONFIG || {};
const api = createApi({ storage, fetchFn: (...a) => window.fetch(...a), defaultUrl: cfg.apiUrl || '' });
const app = createApp({ win: window, api, storage, opts: { googleClientId: cfg.googleClientId || '' } });
window.__gl = app;
app.start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller; // ครั้งแรกสุดที่ติดตั้งไม่ต้องรีโหลด
  let reloading = false;
  // มี service worker เวอร์ชันใหม่เข้ามาคุมหน้า = ไฟล์ใหม่พร้อมแล้ว → รีโหลดเองเมื่ออยู่หน้าแรก/ตั้งค่า (ไม่รีโหลดกลางการจด)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (app.view === 'home' || app.view === 'settings') { reloading = true; location.reload(); }
    else app.pendingReload = true; // รอจนกลับหน้าแรก
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      // แอปที่เปิดค้างไว้ในพื้นหลัง: กลับมาใช้เมื่อไรก็ตรวจหาเวอร์ชันใหม่ทันที
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
