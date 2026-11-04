// เทียบหน้าจอจริงกับดีไซน์ handoff/screens/*.html ที่ 390x844 → tests/shots/NN-*.png (ซ้าย = ดีไซน์, ขวา = แอปจริง)
// รัน: node tools/shots.mjs   (ใช้ชีตจำลองเท่านั้น ไม่แตะชีตจริง)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEnv } from '../tests/server/mock.js';
import { serve } from '../tests/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tests/shots');
fs.mkdirSync(outDir, { recursive: true });
const API = 'https://script.google.com/macros/s/TEST/exec';
const TOKEN = 'shot-token';

/* ---------- ข้อมูลจำลองให้ตรงกับดีไซน์ ---------- */
function makeEnv() {
  const env = createEnv({ token: TOKEN });
  env.addSheet('REF', [
    ['Inclined bench press', 'ดันบาร์หรือดัมเบลบนม้านั่งเอียง เน้นอกส่วนบน ไหล่หน้า และไตรเซ็ป', 'strength'],
    ['Seated cable row with close-grip neutral handle', 'นั่งดึงสายเคเบิลเข้าหาลำตัว เน้นหลังส่วนกลางและสะบัก', 'strength'],
    ['Lateral raise', 'ยกแขนออกด้านข้าง เน้นไหล่ด้านข้าง ทำให้ไหล่ดูกว้างขึ้น', 'strength'],
    ['Pec deck fly', 'เครื่องหุบอก', 'strength'],
    ['Cable pec fly', 'สายเคเบิลหุบอก', 'strength'],
    ['Treadmill', 'เดินหรือวิ่งบนสายพาน คาร์ดิโอพื้นฐาน ปรับความเร็วและความชันได้', 'cardio']
  ]);
  const S = (id, date, time, gym, items) => items.forEach((it) => env.call('saveExercise', [{ id, date, time, gym }, it]));
  const st = (name, reps, ws) => ({ name, kind: 'strength', sets: reps.map((r, i) => ({ r, w: ws[i] })) });
  S('h3', '2026-11-03', '17:17', 'ยิมหลัก', [
    st('Machine inclined chest press (plate loaded)', [13, 12, 8, 8], [38, 38, 38, 36]),
    st('Lateral raise', [16, 13, 9, 8], [10, 10, 10, 10]),
    st('Tricep pushdown', [12, 12, 8, 9], [34, 34, 34, 34]),
    st('Seated cable row with close-grip neutral handle', [12, 12, 10, 9], [45, 45, 45, 40]),
    st('Dumbbell shoulder press', [12, 10, 9], [14, 14, 14]),
    { name: 'Treadmill', kind: 'cardio', min: 30, hr: 130 }
  ]);
  S('h2', '2026-10-30', '18:05', 'ยิมหลัก', [
    st('Lat pull down', [12, 10, 10, 8], [45, 45, 45, 40]),
    st('Low row', [12, 12, 10, 9], [38, 38, 38, 38]),
    st('Dumbbell curl', [12, 10, 9], [10, 10, 10])
  ]);
  S('h1', '2026-10-27', '17:40', 'ยิม B', [
    st('Leg press', [15, 12, 12, 10], [80, 90, 90, 90]),
    st('Leg extension', [15, 12, 12], [35, 35, 35]),
    st('Lying leg curl', [15, 12, 12], [30, 30, 30])
  ]);
  // ครั้งก่อนของท่าต่าง ๆ (ใช้แสดง "ฝึกล่าสุด")
  S('p1', '2026-10-23', '17:00', 'ยิมหลัก', [
    st('Inclined bench press', [13, 12, 8, 8], [38, 38, 38, 38]),
    st('Lateral raise', [16, 13, 9, 8], [10, 10, 10, 10])
  ]);
  S('p2', '2026-10-30', '09:00', 'ยิมหลัก', [st('Seated cable row with close-grip neutral handle', [12, 12, 10, 9], [45, 45, 45, 40])]);
  return env;
}

const srv = await serve(4173);
const browser = await chromium.launch();

async function newPage({ rest, offline } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Bangkok', locale: 'th-TH' });
  const page = await ctx.newPage();
  const env = makeEnv();
  await page.route('https://script.google.com/**', async (route) => {
    const body = route.request().postData();
    const req = JSON.parse(body);
    if (offline && ['saveExercise', 'addExercise', 'saveMeta', 'deleteExercise'].includes(req.action)) return route.abort();
    const out = JSON.parse(env.ctx.doPost({ postData: { contents: body } }).getContent());
    if (req.action === 'bootstrap' && out.ok) {
      out.data.total = 142; // ให้ตรงข้อความในดีไซน์
      out.data.gyms = [{ name: 'ยิมหลัก', n: 46 }, { name: 'ยิม B', n: 12 }];
      out.data.exercises.forEach((e) => { if (e.name === 'Pec deck fly') e.n = 9; if (e.name === 'Cable pec fly') e.n = 3; });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });
  await page.addInitScript(({ API, TOKEN, rest }) => {
    localStorage.setItem('gl_api_url', API);
    localStorage.setItem('gl_token', JSON.stringify(TOKEN));
    localStorage.setItem('gl_api_url', JSON.stringify(API));
    if (rest) localStorage.setItem('gl_rest', String(Date.now() - rest));
  }, { API, TOKEN, rest });
  await page.goto('http://localhost:4173/index.html');
  await page.waitForSelector('.cta');
  await page.waitForFunction(() => window.__gl.data.exercises.length > 0);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// เริ่มเซสชันใหม่ ตามดีไซน์: 03-11-2569 17:17 ยิมหลัก
async function openSession(page, names) {
  await page.evaluate(async (names) => {
    const a = window.__gl;
    a.startNew();
    a.cur.date = '2026-11-03'; a.cur.time = '17:17'; a.cur.gym = 'ยิมหลัก';
    a.refreshChips();
    for (const [n, k] of names) a.addItem(n, k || 'strength');
    await new Promise((r) => setTimeout(r, 400)); // รอ "ฝึกล่าสุด" จากเซิร์ฟเวอร์จำลอง
  }, names);
}

const fill = (page, card, rs, ws) => page.evaluate(({ card, rs, ws }) => {
  const c = document.querySelectorAll('.ex')[card];
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  rs.forEach((v, i) => v !== '' && set(c.querySelector(`[data-r="${i}"]`), String(v)));
  ws.forEach((v, i) => v !== '' && set(c.querySelector(`[data-w="${i}"]`), String(v)));
}, { card, rs, ws });

const INCL = [['Inclined bench press'], ['Seated cable row with close-grip neutral handle'], ['Lateral raise']];

const screens = {
  '01-home': async () => {
    const p = await newPage();
    await p.waitForSelector('.sc');
    return p;
  },
  '02-session': async () => {
    const p = await newPage();
    await openSession(p, INCL);
    await fill(p, 0, [13, 12, 8, ''], [38, 38, 38, 36]);
    await p.evaluate(() => { document.querySelector('[data-r="2"]').focus(); window.scrollTo(0, 462); });
    return p;
  },
  '03-keypad': async () => {
    const p = await newPage({ rest: 138000 });
    await openSession(p, [['Inclined bench press']]);
    await fill(p, 0, [13, 12, 9, ''], [38, 38, 38, '']);
    await p.evaluate(() => { document.querySelector('[data-r="2"]').focus(); document.documentElement.style.setProperty('--kb', '244px'); });
    return p;
  },
  '04-session-edit-meta': async () => {
    const p = await newPage();
    await openSession(p, [['Inclined bench press']]);
    await fill(p, 0, [13, 12, 8, 8], [38, 38, 38, 38]);
    await p.click('[data-chip="date"]');
    return p;
  },
  '05-gym-picker': async () => {
    const p = await newPage();
    await openSession(p, [['Inclined bench press']]);
    await p.click('[data-chip="gym"]');
    await p.click('#f-gym');
    await p.fill('#gymq', 'ยิม C');
    return p;
  },
  '06-add-type': async () => {
    const p = await newPage();
    await openSession(p, [['Inclined bench press']]);
    await fill(p, 0, [13, 12, 8, 8], [38, 38, 38, 38]);
    await p.click('#addbtn');
    return p;
  },
  '07-add-pick': async () => {
    const p = await newPage();
    await openSession(p, []);
    await p.click('#addbtn');
    await p.click('.ty[data-kind="strength"]');
    await p.fill('#exq', 'pec');
    return p;
  },
  '08-cardio': async () => {
    const p = await newPage({ offline: true });
    await openSession(p, [['Treadmill', 'cardio']]);
    await p.fill('[data-f="min"]', '30');
    await p.fill('[data-f="hr"]', '130');
    await p.fill('.note', 'เดินเอียง 8% ความเร็ว 5.5');
    await p.evaluate(() => document.querySelector('[data-f="min"]').focus());
    await p.waitForSelector('[data-badge].st-offline');
    return p;
  }
};

const only = process.argv[2];
for (const [name, build] of Object.entries(screens)) {
  if (only && !name.startsWith(only)) continue;
  const page = await build();
  await page.waitForTimeout(1400); // รอแอนิเมชันไฮไลต์การ์ดจบ
  await page.screenshot({ path: path.join(outDir, name + '.app.png') });
  const dctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const d = await dctx.newPage();
  await d.goto(pathToFileURL(path.join(root, 'handoff/screens', name + '.html')).href);
  await d.evaluate(() => document.fonts.ready);
  await d.screenshot({ path: path.join(outDir, name + '.design.png') });
  // รวมซ้าย-ขวา
  const both = await dctx.newPage();
  const b64 = (f) => fs.readFileSync(path.join(outDir, f)).toString('base64');
  await both.setViewport?.({ width: 800, height: 844 });
  await both.setViewportSize({ width: 800, height: 844 });
  await both.setContent(`<body style="margin:0;background:#444;display:flex;gap:20px"><img width=390 src="data:image/png;base64,${b64(name + '.design.png')}"><img width=390 src="data:image/png;base64,${b64(name + '.app.png')}"></body>`);
  await both.screenshot({ path: path.join(outDir, name + '.png') });
  await page.context().close();
  await dctx.close();
  console.log('shot', name);
}
await browser.close();
srv.close();
