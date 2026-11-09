// jsdom + เซิร์ฟเวอร์จำลอง (Code.gs จริงบน mock SpreadsheetApp) ต่อกันผ่าน fetch จำลอง → ทดสอบแบบ end-to-end ไม่แตะชีตจริง
import { JSDOM } from 'jsdom';
import { createEnv } from '../server/mock.js';
import { createApp } from '../../js/app.js';
import { createApi } from '../../js/api.js';
import { createStorage } from '../../js/store.js';

export const TOKEN = 'secret-token';

export function seedServer(env, n = 0) {
  env.addSheet('Exercises', [
    ['Exercise', 'Description', 'Kind', 'Rest'],
    ['Bench press', 'ท่าอกพื้นฐาน', 'strength', ''],
    ['Lateral raise', 'ยกแขนออกด้านข้าง', 'strength', ''],
    ['Cable fly', 'หุบสายเคเบิล', 'strength', '90 วินาที'],
    ['Treadmill', 'เดินวิ่งบนสายพาน', 'cardio', '']
  ]);
  for (let i = 1; i <= n; i++) {
    const d = `2026-10-${String(i).padStart(2, '0')}`;
    env.call('saveExercise', [{ id: 's' + i, date: d, time: '10:00', gym: i % 3 ? 'ยิมหลัก' : 'ยิม B' }, { name: 'Bench press', kind: 'strength', sets: [{ r: 10 + (i % 3), w: 40 }] }]);
  }
}

const open = [];
let seq = 0; // origin ไม่ซ้ำต่อเทสต์ — jsdom ใช้ localStorage ร่วมกันต่อ origin
// ปิด jsdom window ทุกอันหลังจบเทสต์ (ไม่งั้น setInterval ของจับเวลาทำให้ process ไม่จบ)
export function closeAll() {
  while (open.length) open.pop().close();
}

export async function waitFor(fn, ms = 1500) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout: ' + fn.toString());
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const CLIENT_ID = '1234-test.apps.googleusercontent.com';
export const JWT = 'aaaa.bbbb.cccc';

export function setup({ token = TOKEN, serverToken = TOKEN, seed = 0, preset = {}, noConfig = false, nowRef, google = false } = {}) {
  const env = createEnv({ token: serverToken });
  seedServer(env, seed);
  if (google) {
    env.props.GOOGLE_CLIENT_ID = CLIENT_ID;
    env.idTokens[JWT] = { aud: CLIENT_ID, iss: 'https://accounts.google.com', email: 'owner@example.test', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3000) };
    env.owner.email = 'owner@example.test';
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: `https://gym${++seq}.test/`, pretendToBeVisual: true });
  const win = dom.window;
  open.push(win);
  win.scrollTo = () => {};
  win.scrollBy = () => {};
  if (google) win.google = { accounts: { id: { initialize(c) { this.cfg = c; }, renderButton(el) { el.setAttribute('data-rendered', '1'); } } } }; // Google Identity Services จำลอง
  const net = { offline: false, dropResponse: 0, calls: [], lastInit: null };
  const fetchFn = async (url, init) => {
    net.lastInit = { url, init };
    net.calls.push(JSON.parse(init.body));
    if (net.offline) throw new TypeError('Failed to fetch');
    const out = env.ctx.doPost({ postData: { contents: init.body, type: 'text/plain' } });
    if (net.dropResponse > 0) { // เซิร์ฟเวอร์ทำงานแล้ว แต่ response ไม่ถึง client
      net.dropResponse--;
      throw new TypeError('Failed to fetch');
    }
    return { ok: true, json: async () => JSON.parse(out.getContent()) };
  };
  const storage = createStorage(win.localStorage);
  if (!noConfig) {
    storage.set('gl_api_url', 'https://script.google.com/macros/s/TEST/exec');
    storage.set('gl_token', token);
  }
  Object.entries(preset).forEach(([k, v]) => storage.set(k, v));
  const api = createApi({ storage, fetchFn });
  const app = createApp({ win, api, storage, opts: { debounceMs: 15, retryMs: 40, now: nowRef ? () => nowRef.t : undefined, googleClientId: google ? CLIENT_ID : '' } });
  const $ = (sel, root = win.document) => root.querySelector(sel);
  const $$ = (sel, root = win.document) => [...root.querySelectorAll(sel)];
  const type = (el, value) => {
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  };
  const change = (el, value) => {
    el.value = value;
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  };
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const text = () => win.document.body.textContent.replace(/\s+/g, ' ');
  const logRows = () => (env.sheets.Log ? env.sheets.Log.grid.slice(1) : []);
  return { env, win, app, net, storage, api, $, $$, type, change, click, text, logRows, doc: win.document };
}

// เปิดแอปแล้วรอให้รายการท่าจาก bootstrap มาถึง (ผู้ใช้จริงเปิดแผ่นเพิ่มท่าหลังโหลดเสร็จ)
export async function boot(t) {
  t.app.start();
  await waitFor(() => t.app.data.exercises.length > 0);
}

// เปิดเซสชันใหม่ + เพิ่มท่าผ่าน UI
export async function addExerciseUI(t, name, kind = 'strength') {
  t.click(t.$('#addbtn'));
  t.click(t.$(`.ty[data-kind="${kind}"]`));
  const opt = t.$(`.opt[data-ex="${name}"]`);
  if (opt) t.click(opt);
  else {
    t.type(t.$('#exq'), name);
    t.click(t.$('#newex'));
  }
}
