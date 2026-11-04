import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './mock.js';

const CLIENT = '1234567890-abc.apps.googleusercontent.com';
const JWT = 'aaaa.bbbb.cccc'; // รูปแบบ JWT ที่ผ่านการตรวจโครงสร้าง (เนื้อหาจริงตรวจโดย tokeninfo จำลอง)
const good = (o = {}) => ({ aud: CLIENT, iss: 'https://accounts.google.com', email: 'owner@example.test', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3000), ...o });

function setup(opts = {}) {
  const env = createEnv({ token: opts.legacy === false ? null : 'legacy-token-abcdefghijklmnopqrstuvwxyz' });
  env.props.GOOGLE_CLIENT_ID = CLIENT;
  env.idTokens[JWT] = good();
  return env;
}
const login = (env, idt = JWT) => env.raw({ action: 'login', args: [idt] });
const withSession = (env, session, action = 'bootstrap', args = []) => env.raw({ token: session, action, args });

test('login สำเร็จ: ได้ session token ใช้เรียก API ได้ (ไม่ต้องมี API_TOKEN)', () => {
  const env = setup({ legacy: false });
  const r = login(env);
  assert.equal(r.ok, true);
  assert.match(r.data.session, /^[0-9a-f]{64}$/);
  assert.equal(r.data.email, 'owner@example.test');
  assert.ok(r.data.expires > Date.now() + 179 * 86400000);
  const b = withSession(env, r.data.session);
  assert.equal(b.ok, true);
  assert.equal(b.data.total, 0);
});

test('session เก็บเฉพาะแฮช ไม่เก็บ token จริงใน Script Property', () => {
  const env = setup();
  const r = login(env);
  assert.ok(!env.props.SESSIONS.includes(r.data.session));
  assert.match(env.props.SESSIONS, /"[0-9a-f]{64}":\{"exp":\d+,"created":\d+\}/);
});

test('login ต้องผ่านทุกเงื่อนไข: aud / iss / อีเมลยืนยัน / หมดอายุ / อีเมลที่อนุญาต / ไม่รู้จัก token', () => {
  const env = setup();
  const bad = [
    { aud: 'other-client' },
    { iss: 'https://evil.example' },
    { email_verified: 'false' },
    { exp: String(Math.floor(Date.now() / 1000) - 10) },
    { email: 'someone.else@gmail.com' },
    { email: '' }
  ];
  bad.forEach((o, i) => {
    env.cache['login-tries'] = '0';
    env.idTokens[JWT] = good(o);
    assert.deepEqual(login(env), { ok: false, error: 'unauthorized' }, JSON.stringify(o));
  });
  env.cache['login-tries'] = '0';
  assert.deepEqual(login(env, 'xxxx.yyyy.zzzz'), { ok: false, error: 'unauthorized' }); // tokeninfo ตอบ 400
  assert.deepEqual(login(env, 'ไม่ใช่ jwt'), { ok: false, error: 'unauthorized' });
  assert.equal(env.props.SESSIONS, undefined, 'ไม่มี session ถูกสร้าง');
});

test('ALLOWED_EMAIL กำหนดเองได้ และเทียบแบบไม่สนตัวพิมพ์', () => {
  const env = setup();
  env.props.ALLOWED_EMAIL = 'Other.Person@Gmail.com';
  env.idTokens[JWT] = good({ email: 'other.person@gmail.com' });
  assert.equal(login(env).ok, true);
  env.cache['login-tries'] = '0';
  env.idTokens[JWT] = good(); // boss ไม่ได้อยู่ในรายการที่อนุญาตแล้ว
  assert.equal(login(env).ok, false);
});

test('ยังไม่ตั้ง GOOGLE_CLIENT_ID = not-configured และไม่ยิง tokeninfo', () => {
  const env = setup();
  delete env.props.GOOGLE_CLIENT_ID;
  assert.deepEqual(login(env), { ok: false, error: 'not-configured' });
  assert.equal(env.fetched.length, 0);
});

test('จำกัดการลอง 10 ครั้ง/10 นาที (กันโควตา UrlFetch)', () => {
  const env = setup();
  env.idTokens[JWT] = good({ email: 'x@y.z' });
  for (let i = 0; i < 10; i++) assert.equal(login(env).error, 'unauthorized');
  const n = env.fetched.length;
  assert.equal(login(env).error, 'too-many-attempts');
  assert.equal(env.fetched.length, n, 'ไม่ยิงต่อเมื่อเกินโควตา');
});

test('token ผิด/ไม่มี/ถูกแก้ไม่ผ่าน และไม่คืนข้อมูล', () => {
  const env = setup();
  const s = login(env).data.session;
  for (const t of ['', 'x', s.slice(0, -1) + (s.endsWith('0') ? '1' : '0'), s + 'a', null, 12345]) {
    assert.deepEqual(withSession(env, t), { ok: false, error: 'unauthorized' });
  }
});

test('API_TOKEN เดิมยังใช้ได้ และลบแล้วใช้ไม่ได้ (disableLegacyToken) แต่ session ยังอยู่', () => {
  const env = setup();
  const s = login(env).data.session;
  assert.equal(env.raw({ token: 'legacy-token-abcdefghijklmnopqrstuvwxyz', action: 'bootstrap' }).ok, true);
  env.ctx.disableLegacyToken();
  assert.equal(env.raw({ token: 'legacy-token-abcdefghijklmnopqrstuvwxyz', action: 'bootstrap' }).error, 'unauthorized');
  assert.equal(withSession(env, s).ok, true);
});

test('session หมดอายุ/ถูกยกเลิก (revokeSessions) แล้วใช้ไม่ได้', () => {
  const env = setup();
  const s = login(env).data.session;
  const map = JSON.parse(env.props.SESSIONS);
  const h = Object.keys(map)[0];
  map[h].exp = Date.now() - 1;
  env.props.SESSIONS = JSON.stringify(map);
  assert.equal(withSession(env, s).error, 'unauthorized');
  env.cache['login-tries'] = '0';
  const s2 = login(env).data.session;
  assert.equal(withSession(env, s2).ok, true);
  env.ctx.revokeSessions();
  assert.equal(withSession(env, s2).error, 'unauthorized');
});

test('เก็บ session ได้ไม่เกินจำนวนที่กำหนด (ตัดอันเก่าสุด) และล้างอันหมดอายุ', () => {
  const env = setup();
  const first = login(env).data.session;
  const map = JSON.parse(env.props.SESSIONS);
  const fh = Object.keys(map)[0];
  map[fh].created -= 1000; // ทำให้ตัวแรกเก่าสุด
  env.props.SESSIONS = JSON.stringify(map);
  let last;
  for (let i = 0; i < 20; i++) {
    env.cache['login-tries'] = '0';
    last = login(env).data.session;
  }
  assert.equal(Object.keys(JSON.parse(env.props.SESSIONS)).length, 20);
  assert.equal(withSession(env, first).error, 'unauthorized');
  assert.equal(withSession(env, last).ok, true);
});

test('login สำเร็จแล้วรีเซ็ตตัวนับ; ทำงานปกติร่วมกับการเขียนข้อมูล', () => {
  const env = setup();
  env.cache['login-tries'] = '9';
  const s = login(env).data.session;
  assert.equal(env.cache['login-tries'], undefined);
  const w = env.raw({ token: s, action: 'saveExercise', opId: 'o1', args: [{ id: 's1', date: '2026-11-03', time: '10:00', gym: 'A' }, { name: 'X', kind: 'strength', sets: [{ r: 5, w: 5 }] }] });
  assert.equal(w.ok, true);
  assert.equal(env.sheets.Log.grid.length, 2);
});

test('login ไม่ทำให้ doGet / ข้อมูลรั่ว: ตอบผิดพลาดแบบเดียวกันทุกกรณี (ไม่บอกว่าผิดตรงไหน)', () => {
  const env = setup();
  env.idTokens[JWT] = good({ aud: 'x' });
  const a = login(env);
  env.cache['login-tries'] = '0';
  env.idTokens[JWT] = good({ email: 'x@y.z' });
  const b = login(env);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(env.ctx.doGet().getContent()), { ok: true, service: 'gymlog', v: 2 });
});

test('setup: ตั้ง GOOGLE_CLIENT_ID + ALLOWED_EMAIL + ขอสิทธิ์ UrlFetch และไม่สุ่ม API_TOKEN เมื่อใช้ Google', () => {
  const env = createEnv({ token: null });
  env.ctx.GOOGLE_CLIENT_ID_SETUP = CLIENT;
  const r = env.ctx.setup();
  assert.equal(env.props.GOOGLE_CLIENT_ID, CLIENT);
  assert.equal(env.props.ALLOWED_EMAIL, 'owner@example.test');
  assert.equal(r.tokenCreated, false);
  assert.equal(env.props.API_TOKEN, undefined);
  assert.equal(env.fetched.length, 1);
  assert.ok(r.report.some((x) => /ได้สิทธิ์ UrlFetch/.test(x)));
});

test('ข้อผิดพลาดของระบบ (เช่น ไม่มีสิทธิ์ UrlFetch) ตอบ login-error ไม่ใช่ unauthorized และไม่หลุดรายละเอียด', () => {
  const env = setup();
  const orig = env.ctx.UrlFetchApp.fetch;
  env.ctx.UrlFetchApp.fetch = () => { throw new Error('You do not have permission to call UrlFetchApp.fetch'); };
  const r = login(env);
  assert.deepEqual(r, { ok: false, error: 'login-error' });
  env.ctx.UrlFetchApp.fetch = orig;
});

test('ALLOWED_EMAIL ว่าง + หาอีเมลเจ้าของไม่ได้ = ปฏิเสธ (login-error) ไม่เทียบกับค่าว่าง', () => {
  const env = setup();
  env.owner.email = '';
  env.idTokens[JWT] = good({ email: '' });
  assert.notEqual(login(env).ok, true);
  env.cache['login-tries'] = '0';
  env.idTokens[JWT] = good();
  assert.deepEqual(login(env), { ok: false, error: 'login-error' });
});

test('setup: ALLOWED_EMAIL_SETUP จากไฟล์รวมมีผลเหนืออีเมลเจ้าของสคริปต์', () => {
  const env = createEnv({ token: null });
  env.ctx.ALLOWED_EMAIL_SETUP = 'me@example.test';
  env.owner.email = '';
  env.ctx.setup();
  assert.equal(env.props.ALLOWED_EMAIL, 'me@example.test');
});
