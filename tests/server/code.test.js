import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './mock.js';

const HEAD = ['UpdatedAt', 'SessionId', 'Date', 'Time', 'Gym', 'Exercise', 'Kind', 'Set', 'Reps', 'Weight', 'Minutes', 'AvgHR', 'Note'];
const meta = (o = {}) => ({ id: 's1', date: '2026-11-03', time: '17:17', gym: 'ยิมหลัก', ...o });
const ex = (o = {}) => ({ name: 'Bench press', kind: 'strength', sets: [{ r: 12, w: 40 }, { r: 10, w: 40 }], note: '', ...o });

function fresh() {
  const env = createEnv();
  env.addSheet('REF', [
    ['Bench press', 'ท่าอกพื้นฐาน', 'strength'],
    ['Lat pulldown', 'ดึงลง', 'strength'],
    ['Treadmill', 'เดินวิ่ง', 'cardio'],
    ['-', '', '']
  ]);
  return env;
}

test('doGet ตอบแค่ service ไม่มีข้อมูล', () => {
  const env = fresh();
  const r = JSON.parse(env.ctx.doGet().getContent());
  assert.deepEqual(r, { ok: true, service: 'gymlog' });
});

test('unauthorized: token ผิด/ไม่มี/ไม่ตั้งค่า → ไม่คืนข้อมูล', () => {
  const env = fresh();
  for (const body of [{ token: 'x', action: 'bootstrap' }, { action: 'bootstrap' }, 'not json', { token: 'secret-token-longer', action: 'bootstrap' }]) {
    const r = env.raw(body);
    assert.deepEqual(r, { ok: false, error: 'unauthorized' });
  }
  delete env.props.API_TOKEN; // ลืมตั้ง Script Property → ปฏิเสธทุกคำขอ
  assert.equal(env.call('bootstrap').error, 'unauthorized');
});

test('unauthorized ไม่แตะชีต (ไม่สร้างแท็บ Log)', () => {
  const env = fresh();
  env.raw({ token: 'bad', action: 'saveExercise', args: [meta(), ex()] });
  assert.equal(env.sheets.Log, undefined);
});

test('action ที่ไม่รู้จัก', () => {
  assert.equal(fresh().call('nope').error, 'unknown-action');
});

test('saveExercise: 1 แถวต่อเซ็ต + สร้าง Log พร้อมหัวตาราง', () => {
  const env = fresh();
  const r = env.call('saveExercise', [meta(), ex()]);
  assert.equal(r.ok, true);
  const g = env.sheets.Log.grid;
  assert.deepEqual(g[0], HEAD);
  assert.equal(g.length, 3);
  assert.deepEqual(g[1].slice(1), ['s1', '2026-11-03', '17:17', 'ยิมหลัก', 'Bench press', 'strength', 1, 12, 40, '', '', '']);
  assert.equal(g[2][7], 2);
});

test('saveExercise: แทนที่ทั้งท่า (ลดเซ็ตแล้วแถวส่วนเกินหาย) และไม่กระทบท่าอื่น', () => {
  const env = fresh();
  env.call('saveExercise', [meta(), ex({ sets: [{ r: 12, w: 40 }, { r: 10, w: 40 }, { r: 8, w: 35 }] })]);
  env.call('saveExercise', [meta(), ex({ name: 'Lat pulldown', sets: [{ r: 10, w: 45 }] })]);
  env.call('saveExercise', [meta(), ex({ sets: [{ r: 13, w: 42 }] })]);
  const rows = env.sheets.Log.grid.slice(1);
  assert.equal(rows.filter((r) => r[5] === 'Bench press').length, 1);
  assert.equal(rows.filter((r) => r[5] === 'Lat pulldown').length, 1);
  assert.equal(rows.find((r) => r[5] === 'Bench press')[8], 13);
});

test('saveExercise: ว่างทั้งหมด = ลบท่า, มีแต่โน้ต = เก็บ 1 แถว', () => {
  const env = fresh();
  env.call('saveExercise', [meta(), ex()]);
  env.call('saveExercise', [meta(), ex({ sets: [{ r: '', w: '' }] })]);
  assert.equal(env.sheets.Log.getLastRow(), 1);
  env.call('saveExercise', [meta(), ex({ sets: [{ r: '', w: '' }], note: 'ไหล่ตึง' })]);
  assert.equal(env.sheets.Log.getLastRow(), 2);
  assert.equal(env.sheets.Log.grid[1][12], 'ไหล่ตึง');
});

test('saveExercise: ลำดับเซ็ตตามตำแหน่ง ข้ามเซ็ตว่างได้ (set number คงเดิม)', () => {
  const env = fresh();
  env.call('saveExercise', [meta(), ex({ sets: [{ r: 12, w: 40 }, { r: '', w: '' }, { r: 8, w: 35 }] })]);
  const rows = env.sheets.Log.grid.slice(1);
  assert.deepEqual(rows.map((r) => r[7]), [1, 3]);
});

test('คาร์ดิโอ: เก็บ Minutes/AvgHR', () => {
  const env = fresh();
  env.call('saveExercise', [meta(), { name: 'Treadmill', kind: 'cardio', min: '30', hr: '130', note: '' }]);
  const row = env.sheets.Log.grid[1];
  assert.deepEqual([row[6], row[10], row[11]], ['cardio', 30, 130]);
});

test('ค่าที่ขึ้นต้นด้วย = ไม่ถูกตีเป็นสูตร และวันที่ไม่ถูกแปลงเป็น Date', () => {
  const env = fresh();
  env.call('saveExercise', [meta({ gym: '=HYPERLINK("x")' }), ex({ note: '=1+1' })]);
  assert.equal(env.sheets.Log.formulaCells.length, 0);
  assert.equal(typeof env.sheets.Log.grid[1][2], 'string');
});

test('meta ไม่ถูกต้องถูกปฏิเสธ', () => {
  const env = fresh();
  assert.match(env.call('saveExercise', [meta({ date: '03-11-2569' }), ex()]).error, /bad-meta-date/);
  assert.match(env.call('saveExercise', [meta({ id: '' }), ex()]).error, /bad-meta-id/);
  assert.match(env.call('saveExercise', [meta({ time: '5pm' }), ex()]).error, /bad-meta-time/);
  assert.equal(env.sheets.Log, undefined); // ปฏิเสธก่อนแตะชีต
});

test('opId กันซ้ำ: ส่งซ้ำแล้วไม่เขียนซ้ำ (retry หลัง response หาย)', () => {
  const env = fresh();
  const a = env.call('saveExercise', [meta(), ex()], { opId: 'op1' });
  const w = env.sheets.Log.writes.length;
  const b = env.call('saveExercise', [meta(), ex({ sets: [{ r: 1, w: 1 }] })], { opId: 'op1' });
  assert.deepEqual(a, b);
  assert.equal(env.sheets.Log.writes.length, w);
  assert.equal(env.sheets.Log.grid[1][8], 12);
});

test('deleteExercise', () => {
  const env = fresh();
  env.call('saveExercise', [meta(), ex()]);
  env.call('saveExercise', [meta(), ex({ name: 'Lat pulldown' })]);
  env.call('deleteExercise', ['s1', 'bench PRESS']);
  const rows = env.sheets.Log.grid.slice(1);
  assert.ok(rows.every((r) => r[5] === 'Lat pulldown'));
});

test('saveMeta: อัปเดตทุกแถวของเซสชัน ไม่แตะเซสชันอื่น', () => {
  const env = fresh();
  env.call('saveExercise', [meta(), ex()]);
  env.call('saveExercise', [meta(), ex({ name: 'Lat pulldown' })]);
  env.call('saveExercise', [meta({ id: 's2', date: '2026-10-30' }), ex()]);
  const r = env.call('saveMeta', [meta({ date: '2026-11-04', time: '08:05', gym: 'ยิม B' })]);
  assert.equal(r.data.rows, 4);
  const rows = env.sheets.Log.grid.slice(1);
  rows.filter((x) => x[1] === 's1').forEach((x) => assert.deepEqual([x[2], x[3], x[4]], ['2026-11-04', '08:05', 'ยิม B']));
  rows.filter((x) => x[1] === 's2').forEach((x) => assert.deepEqual([x[2], x[4]], ['2026-10-30', 'ยิมหลัก']));
});

test('addExercise: ต่อท้าย REF เท่านั้น ไม่ซ้ำ ไม่แก้แถวเดิม', () => {
  const env = fresh();
  const before = JSON.stringify(env.sheets.REF.grid);
  assert.equal(env.call('addExercise', ['Pec deck fly', 'strength']).data.ok, true);
  assert.equal(env.call('addExercise', ['pec DECK fly', 'strength']).data.existed, true);
  env.call('addExercise', ['Cycling', 'cardio']);
  const g = env.sheets.REF.grid;
  assert.equal(JSON.stringify(g.slice(0, 4)), before);
  assert.deepEqual(g[4], ['Pec deck fly', '', 'strength']);
  assert.deepEqual(g[5], ['Cycling', '', 'cardio']);
  assert.ok(env.sheets.REF.writes.every((w) => w.row >= 5), 'เขียนเฉพาะแถวใหม่');
});

function seedSessions(env, n) {
  for (let i = 1; i <= n; i++) {
    const d = `2026-10-${String(i).padStart(2, '0')}`;
    env.call('saveExercise', [{ id: 's' + i, date: d, time: '10:00', gym: i % 3 ? 'ยิมหลัก' : 'ยิม B' }, ex({ sets: [{ r: i, w: 40 }] })]);
  }
}

test('bootstrap: ท่า+desc+จำนวนครั้ง, ยิม+จำนวน, lastGym, sheetUrl+gid, 10 เซสชันแรก', () => {
  const env = fresh();
  seedSessions(env, 25);
  const b = env.call('bootstrap').data;
  assert.equal(b.sessions.length, 10);
  assert.equal(b.total, 25);
  assert.equal(b.sessions[0].id, 's25'); // ใหม่สุดก่อน
  assert.equal(b.lastGym, 'ยิมหลัก');
  assert.deepEqual(b.gyms.map((g) => g.name), ['ยิมหลัก', 'ยิม B']);
  assert.equal(b.gyms[0].n + b.gyms[1].n, 25);
  const bench = b.exercises.find((e) => e.name === 'Bench press');
  assert.deepEqual([bench.desc, bench.kind, bench.n], ['ท่าอกพื้นฐาน', 'strength', 25]);
  assert.equal(b.exercises[0].name, 'Bench press'); // เรียงตามจำนวนครั้งที่ใช้
  assert.ok(!b.exercises.some((e) => e.name === '-'));
  assert.equal(b.exercises.find((e) => e.name === 'Treadmill').kind, 'cardio');
  assert.equal(b.sheetUrl, 'https://docs.google.com/spreadsheets/d/TESTID/edit');
  assert.equal(b.logUrl, b.sheetUrl + '#gid=' + env.sheets.Log.id);
});

test('sessions: แบ่งหน้าทีละ 10 + total ไม่ซ้ำ ไม่ขาด', () => {
  const env = fresh();
  seedSessions(env, 25);
  const ids = [];
  for (const off of [0, 10, 20]) {
    const r = env.call('sessions', [off, 10]).data;
    assert.equal(r.total, 25);
    ids.push(...r.sessions.map((s) => s.id));
  }
  assert.equal(ids.length, 25);
  assert.equal(new Set(ids).size, 25);
  assert.equal(env.call('sessions', [30, 10]).data.sessions.length, 0);
  assert.equal(env.call('sessions', [-5, 9999]).data.sessions.length, 25 > 50 ? 50 : 25); // clamp
});

test('sessions: ทุกท่าครบ (ไม่ยุบ) และคาร์ดิโอมี min/hr', () => {
  const env = fresh();
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) env.call('saveExercise', [meta(), ex({ name: n })]);
  env.call('saveExercise', [meta(), { name: 'Treadmill', kind: 'cardio', min: 30, hr: 130 }]);
  const s = env.call('sessions', [0, 10]).data.sessions[0];
  assert.equal(s.items.length, 7);
  assert.deepEqual([s.items[6].min, s.items[6].hr], [30, 130]);
});

test('last: จาก Log ล่าสุด (ไม่นับเซสชันปัจจุบัน) น้ำหนักต่อเซ็ตตามจริง', () => {
  const env = fresh();
  env.call('saveExercise', [meta({ id: 'a', date: '2026-10-20' }), ex({ sets: [{ r: 13, w: 38 }, { r: 12, w: 38 }, { r: 8, w: 35 }] })]);
  env.call('saveExercise', [meta({ id: 'b', date: '2026-10-25' }), ex({ sets: [{ r: 10, w: 40 }] })]);
  env.call('saveExercise', [meta({ id: 'c', date: '2026-11-01' }), ex({ sets: [{ r: 1, w: 1 }] })]);
  const r = env.call('last', ['bench press', 'c']).data;
  assert.equal(r.date, '2026-10-25');
  assert.deepEqual(r.sets, [{ r: 10, w: 40 }]);
});

// ชีตเก่า: แถวชื่อท่า = reps (D:I), แถวถัดไป = น้ำหนัก, วันที่อยู่คอลัมน์ A
function oldSheet(env) {
  return env.addSheet('69', [
    [new Date('2026-09-01T00:00:00+07:00'), '', '', '', '', '', '', '', ''],
    ['', 'Seated cable row', '', 12, 12, 10, 9, '', ''],
    ['', '', '', 45, 45, 45, '', '', ''],
    [new Date('2026-09-08T00:00:00+07:00'), '', '', '', '', '', '', '', ''],
    ['', 'Seated cable row', '', 13, 12, 10, '', '', ''],
    ['', '', '', 50, '', '', '', '', '']
  ]);
}

test('last: ไม่มีใน Log → อ่านจากชีตเก่า (แถวล่างสุดก่อน, น้ำหนักเติมจากเซ็ตก่อนหน้า)', () => {
  const env = fresh();
  oldSheet(env);
  const r = env.call('last', ['Seated Cable Row', 'x']).data;
  assert.equal(r.date, '2026-09-08');
  assert.deepEqual(r.sets, [{ r: 13, w: 50 }, { r: 12, w: 50 }, { r: 10, w: 50 }]);
  assert.equal(env.call('last', ['ไม่มีท่านี้', 'x']).data, null);
});

test('ห้ามเขียนชีตเก่า / แก้แถวเดิมใน REF ตลอดทุก action', () => {
  const env = fresh();
  const old = oldSheet(env);
  const refBefore = JSON.stringify(env.sheets.REF.grid);
  seedSessions(env, 3);
  env.call('saveMeta', [meta({ id: 's1', gym: 'X' })]);
  env.call('deleteExercise', ['s2', 'Bench press']);
  env.call('addExercise', ['New one', 'strength']);
  env.call('bootstrap');
  env.call('sessions', [0, 10]);
  env.call('last', ['Seated cable row', '']);
  assert.equal(old.writes.length, 0);
  assert.equal(JSON.stringify(env.sheets.REF.grid.slice(0, 4)), refBefore);
  assert.ok(env.sheets.REF.writes.every((w) => w.row > 4));
});

test('ตอบเป็น JSON mime และ error ไม่หลุด stack', () => {
  const env = fresh();
  const out = env.ctx.doPost({ postData: { contents: JSON.stringify({ token: 'secret-token', action: 'saveExercise', args: [] }) } });
  assert.equal(out.mime, 'application/json');
  const r = JSON.parse(out.getContent());
  assert.equal(r.ok, false);
  assert.ok(!/\n\s+at /.test(r.error));
});
