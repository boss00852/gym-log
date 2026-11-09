import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './mock.js';

const HEAD = ['UpdatedAt', 'SessionId', 'Date', 'Time', 'Place', 'Exercise', 'Kind', 'Set', 'Reps', 'Weight', 'Minutes', 'AvgHR', 'Note', 'Distance', 'Source'];
const meta = (o = {}) => ({ id: 's1', date: '2026-11-03', time: '17:17', gym: 'ยิมหลัก', ...o });
const ex = (o = {}) => ({ name: 'Bench press', kind: 'strength', sets: [{ r: 12, w: 40 }, { r: 10, w: 40 }], note: '', ...o });

function fresh() {
  const env = createEnv();
  env.addSheet('Exercises', [
    ['Exercise', 'Description', 'Kind', 'Rest'],
    ['Bench press', 'ท่าอกพื้นฐาน', 'strength', '~2 นาที'],
    ['Lat pulldown', 'ดึงลง', 'strength', ''],
    ['Treadmill', 'เดินวิ่ง', 'cardio', ''],
    ['-', '', '', '']
  ]);
  return env;
}

test('doGet ตอบแค่ service ไม่มีข้อมูล', () => {
  const env = fresh();
  const r = JSON.parse(env.ctx.doGet().getContent());
  assert.deepEqual(r, { ok: true, service: 'gymlog', v: 2 });
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
  assert.deepEqual(g[1].slice(1), ['s1', '2026-11-03', '17:17', 'ยิมหลัก', 'Bench press', 'strength', 1, 12, 40, '', '', '', '', '']);
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

test('addExercise: ต่อท้าย Exercises เท่านั้น ไม่ซ้ำ ไม่แก้แถวเดิม + เติมเวลาพักให้', () => {
  const env = fresh();
  const before = JSON.stringify(env.sheets.Exercises.grid);
  assert.equal(env.call('addExercise', ['Pec deck fly', 'strength']).data.ok, true);
  assert.equal(env.call('addExercise', ['pec DECK fly', 'strength']).data.existed, true);
  env.call('addExercise', ['Cycling', 'cardio']);
  env.call('addExercise', ['Deadlift', 'strength']);
  const g = env.sheets.Exercises.grid;
  assert.equal(JSON.stringify(g.slice(0, 5)), before);
  assert.deepEqual(g[5], ['Pec deck fly', '', 'strength', '60–90 วินาที']);
  assert.deepEqual(g[6], ['Cycling', '', 'cardio', '']);
  assert.deepEqual(g[7], ['Deadlift', '', 'strength', '~2 นาที']);
  assert.ok(env.sheets.Exercises.writes.every((w) => w.row >= 6), 'เขียนเฉพาะแถวใหม่');
});

test('สถานที่: เพิ่มลง Places อัตโนมัติตอนบันทึก สีไล่ตามชุด ไม่ซ้ำ ไม่แตะแถวเดิม', () => {
  const env = fresh();
  env.call('saveExercise', [meta(), ex()]);
  env.call('saveExercise', [meta({ id: 's2', gym: 'ยิม B' }), ex()]);
  env.call('saveMeta', [meta({ id: 's2', gym: 'ยิม C' })]);
  env.call('saveExercise', [meta({ id: 's3' }), ex()]); // ยิมหลักซ้ำ ไม่เพิ่มแถว
  const g = env.sheets.Places.grid;
  assert.deepEqual(g[0], ['Place', 'Color', 'Note']);
  assert.deepEqual(g.slice(1).map((r) => [r[0], r[1]]), [['ยิมหลัก', '#C8F169'], ['ยิม B', '#7CC4F5'], ['ยิม C', '#F5B461']]);
  assert.equal(env.call('addPlace', ['ยิมหลัก']).data.existed, true);
  assert.equal(env.sheets.Places.grid.length, 4);
  // ไม่มีสถานที่ = ไม่เพิ่มแถว
  env.call('saveExercise', [meta({ id: 's4', gym: '' }), ex()]);
  assert.equal(env.sheets.Places.grid.length, 4);
});

test('bootstrap: gyms รวม Places (แม้ n = 0) + สี และเวลาพักจากชีต', () => {
  const env = fresh();
  env.addSheet('Places', [['Place', 'Color', 'Note'], ['ยิมหลัก', '#C8F169', ''], ['ยิมใหม่ยังไม่เคยไป', '#7CC4F5', '']]);
  env.call('saveExercise', [meta(), ex()]);
  env.call('saveExercise', [meta({ id: 's2', gym: 'ไม่อยู่ใน Places' }), ex()]);
  const b = env.call('bootstrap').data;
  const m = Object.fromEntries(b.gyms.map((g) => [g.name, [g.n, g.color]]));
  assert.equal(m['ยิมหลัก'][0], 1);
  assert.equal(m['ยิมหลัก'][1], '#C8F169');
  assert.deepEqual(m['ยิมใหม่ยังไม่เคยไป'], [0, '#7CC4F5']);
  assert.ok(m['ไม่อยู่ใน Places'][0] === 0 || m['ไม่อยู่ใน Places'][0] === 1);
  assert.equal(b.exercises.find((e) => e.name === 'Bench press').rest, '~2 นาที');
  assert.equal(b.exercises.find((e) => e.name === 'Lat pulldown').rest, '');
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

test('last: ไม่มีประวัติ = null (ไม่อ่านชีตอื่นนอก Log)', () => {
  const env = fresh();
  assert.equal(env.call('last', ['ไม่มีท่านี้', 'x']).data, null);
  env.addSheet('69', [['x', 'Bench press', '', 99]]); // ชีตเก่าในไฟล์เดียวกัน (ถ้ามี) ต้องไม่ถูกอ่าน
  assert.equal(env.call('last', ['Bench press', 'x']).data, null);
});

test('ตอบเป็น JSON mime และ error ไม่หลุด stack', () => {
  const env = fresh();
  const out = env.ctx.doPost({ postData: { contents: JSON.stringify({ token: 'secret-token', action: 'saveExercise', args: [] }) } });
  assert.equal(out.mime, 'application/json');
  const r = JSON.parse(out.getContent());
  assert.equal(r.ok, false);
  assert.ok(!/\n\s+at /.test(r.error));
});

test('เดาหมวดจากชื่อ (Kind ว่าง): Crunch / Machine Crunch / Bicycle crunch เป็นเวท ไม่ใช่คาร์ดิโอ (บั๊ก "run" ใน "crunch")', () => {
  const env = createEnv();
  const names = {
    Crunch: 'strength', 'Machine Crunch': 'strength', 'Bicycle crunch': 'strength', 'Cable crunch': 'strength', 'Walking lunge': 'strength', 'Trunk rotation': 'strength',
    Treadmill: 'cardio', 'Running': 'cardio', 'Run intervals': 'cardio', 'Stationary bike': 'cardio', Cycling: 'cardio', 'Stair climber': 'cardio', 'Rowing machine': 'cardio', Swimming: 'cardio', 'Walking': 'cardio', 'Elliptical machine': 'cardio',
    'Low Row': 'strength', 'Seated cable row': 'strength'
  };
  env.addSheet('Exercises', [['Exercise', 'Description', 'Kind', 'Rest'], ...Object.keys(names).map((n) => [n, '', '', ''])]);
  const got = Object.fromEntries(env.call('bootstrap').data.exercises.map((e) => [e.name, e.kind]));
  assert.deepEqual(got, names);
});

test('คอลัมน์ Kind ในชีตมีผลเหนือการเดาจากชื่อเสมอ', () => {
  const env = createEnv();
  env.addSheet('Exercises', [['Exercise', 'Description', 'Kind', 'Rest'], ['Crunch', '', 'strength', ''], ['Mystery', '', 'cardio', '']]);
  const got = Object.fromEntries(env.call('bootstrap').data.exercises.map((e) => [e.name, e.kind]));
  assert.deepEqual(got, { Crunch: 'strength', Mystery: 'cardio' });
});
