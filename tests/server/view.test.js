import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './mock.js';

const m = (o = {}) => ({ id: 's1', date: '2026-11-03', time: '17:17', gym: 'ยิมหลัก', ...o });
const st = (name, pairs, note = '') => ({ name, kind: 'strength', sets: pairs.map(([r, w]) => ({ r, w })), note });

function setup() {
  const env = createEnv();
  env.addSheet('Exercises', [['Exercise', 'Description', 'Kind', 'Rest']]);
  env.call('saveExercise', [m({ id: 'a', date: '2026-10-30', time: '18:05' }), st('Lat pull down', [[12, 45], [10, 45], [10, 45], [8, 40]])]);
  env.call('saveExercise', [m({ id: 'b' }), st('Bench press', [[13, 38], [12, 38], [8, 36], [8, 36]], 'ไหล่ตึง')]);
  env.call('saveExercise', [m({ id: 'b' }), st('Lateral raise', [[16, 10], [13, 10], ['', ''], [9, '']])]);
  env.call('saveExercise', [m({ id: 'b' }), { name: 'Treadmill', kind: 'cardio', min: 30, hr: 130 }]);
  return env;
}
const view = (env) => env.sheets.View.grid;

test('rebuildView: หัวตาราง/ชื่อหน้า, เรียงใหม่สุดก่อน, วันที่ พ.ศ. แสดงเฉพาะแถวแรกของเซสชัน', () => {
  const env = setup();
  const r = env.ctx.rebuildView();
  assert.deepEqual({ ...r }, { rows: 4, sessions: 2 });
  const g = view(env);
  assert.match(g[0][0], /อ่านอย่างเดียว/);
  assert.deepEqual(g[1].slice(0, 6), ['วันที่', 'เวลา', 'สถานที่', 'ท่า', 'Set 1', 'Set 2']);
  assert.deepEqual(g[1].slice(-2), ['Reps รวม', 'โน้ต']);
  assert.deepEqual(g[2].slice(0, 4), ['03-11-2569', '17:17', 'ยิมหลัก', 'Bench press']);
  assert.deepEqual(g[3].slice(0, 4), ['', '', '', 'Lateral raise']);
  assert.deepEqual(g[4].slice(0, 4), ['', '', '', 'Treadmill']);
  assert.deepEqual(g[5].slice(0, 4), ['30-10-2569', '18:05', 'ยิมหลัก', 'Lat pull down']);
});

test('เซ็ตแสดงเป็น reps×kg, เซ็ตว่างเว้นว่าง, น้ำหนักว่างแสดงเฉพาะ reps, Reps รวม และโน้ต', () => {
  const env = setup();
  env.ctx.rebuildView();
  const g = view(env);
  const cols = g[1].length;
  assert.deepEqual(g[2].slice(4, 8), ['13×38', '12×38', '8×36', '8×36']);
  assert.equal(g[2][cols - 2], 41);
  assert.equal(g[2][cols - 1], 'ไหล่ตึง');
  assert.deepEqual(g[3].slice(4, 8), ['16×10', '13×10', '', '9']);
  assert.equal(g[3][cols - 2], 38);
});

test('คาร์ดิโอ: นาที / HR / ระยะทางอยู่ในช่อง Set 1–3 และไม่มี Reps รวม', () => {
  const env = setup();
  env.call('saveExercise', [m({ id: 'c', date: '2026-11-04' }), { name: 'Elliptical', kind: 'cardio', min: 40 }]);
  env.ctx.rebuildView();
  const g = view(env);
  const cols = g[1].length;
  const tm = g.find((r) => r[3] === 'Treadmill');
  assert.deepEqual(tm.slice(4, 7), ['30 นาที', 'HR 130', '']);
  assert.equal(tm[cols - 2], '');
  const el = g.find((r) => r[3] === 'Elliptical');
  assert.deepEqual(el.slice(4, 6), ['40 นาที', '']);
  // ระยะทางจากข้อมูลที่ย้ายมา (คอลัมน์ Distance ใน Log)
  const log = env.sheets.Log;
  const row = log.grid.findIndex((r) => r[5] === 'Elliptical');
  log.grid[row][13] = 1.9;
  env.ctx.rebuildView();
  assert.deepEqual(view(env).find((r) => r[3] === 'Elliptical').slice(4, 7), ['40 นาที', '', '1.9 กม.']);
});

test('คอลัมน์ Set ขยายตามท่าที่เซ็ตเยอะสุด (อย่างน้อย 6, ไม่เกิน 12) และบอกเมื่อมีเกิน', () => {
  const env = setup();
  const many = Array.from({ length: 14 }, (_, i) => [10, 20 + i]);
  env.call('saveExercise', [m({ id: 'd', date: '2026-11-05' }), st('Drop set', many)]);
  env.ctx.rebuildView();
  const g = view(env);
  const heads = g[1].filter((h) => /^Set \d+$/.test(h));
  assert.equal(heads.length, 12);
  const r = g.find((x) => x[3] === 'Drop set');
  assert.match(r[4 + 11], /…$/);
  assert.equal(r[g[1].length - 2], 140);
});

test('สร้างซ้ำได้ผลเหมือนเดิม ไม่ซ้อน; สลับสีพื้นหลังทีละเซสชัน; เตือนเมื่อแก้ (protect warning only)', () => {
  const env = setup();
  env.ctx.rebuildView();
  const first = JSON.stringify(view(env));
  env.ctx.rebuildView();
  assert.equal(JSON.stringify(view(env)), first);
  const bg = env.sheets.View.backgrounds;
  assert.equal(bg['2,0'], '#FFFFFF'); // แถวข้อมูลแรก (แถวที่ 3 ในชีต)
  assert.equal(bg['4,0'], '#FFFFFF'); // แถวที่ 3 ของเซสชันแรกยังสีเดิม
  assert.equal(bg['5,0'], '#EEF2F6'); // เซสชันถัดไปสลับสี
  assert.equal(env.sheets.View.protection.warningOnly, true);
});

test('View ไม่แตะ Log และสะท้อนการแก้ไข/ลบข้อมูลหลังสร้างใหม่', () => {
  const env = setup();
  env.ctx.rebuildView();
  const logWrites = env.sheets.Log.writes.length;
  env.ctx.rebuildView();
  assert.equal(env.sheets.Log.writes.length, logWrites);
  env.call('deleteExercise', ['b', 'Lateral raise']);
  env.ctx.rebuildView();
  assert.ok(!view(env).some((r) => r[3] === 'Lateral raise'));
});

test('ข้อความที่ขึ้นต้นด้วย = ใน Log ไม่กลายเป็นสูตรใน View (ตั้งเป็นข้อความ/ไม่มีสูตร)', () => {
  const env = createEnv();
  env.call('saveExercise', [m({ gym: '=1+1' }), st('X', [[5, 5]], '=HYPERLINK("x")')]);
  env.ctx.rebuildView();
  const view_ = env.sheets.View;
  const fx = view_.formulaCells.map((c) => c[2]);
  // ค่า "=…" ที่ถูกเขียนลง View ต้องไม่ถูกตีเป็นสูตร (มันเป็นข้อความจาก Log) — อย่างน้อยต้องถูกตั้งฟอร์แมตข้อความก่อนเขียน
  assert.deepEqual(fx.filter((v) => v.startsWith('=')), [], 'ไม่ควรมีสูตรหลุดเข้า View: ' + fx.join(','));
});

test('ธง VIEW_DIRTY: ทุกการเขียนตั้งเป็น 1, refreshViewIfDirty สร้างใหม่เฉพาะเมื่อมีการเปลี่ยนแปลง', () => {
  const env = createEnv();
  env.call('bootstrap');
  assert.equal(env.props.VIEW_DIRTY, undefined, 'การอ่านไม่ตั้งธง');
  assert.equal(env.ctx.refreshViewIfDirty().skipped, true);
  env.call('saveExercise', [m(), st('Bench press', [[10, 40]])]);
  assert.equal(env.props.VIEW_DIRTY, '1');
  const r = env.ctx.refreshViewIfDirty();
  assert.equal(r.rows, 1);
  assert.equal(env.props.VIEW_DIRTY, '0');
  assert.equal(env.ctx.refreshViewIfDirty().skipped, true);
  env.call('addPlace', ['ยิม B']);
  assert.equal(env.props.VIEW_DIRTY, '1');
});

test('installViewTrigger: ตั้งตัวเดียวทุก 5 นาที (รันซ้ำไม่ซ้อน) และ removeViewTrigger ลบได้', () => {
  const env = createEnv();
  env.ctx.installViewTrigger();
  env.ctx.installViewTrigger();
  assert.equal(env.triggers.length, 1);
  assert.deepEqual([env.triggers[0].fn, env.triggers[0].n], ['refreshViewIfDirty', 5]);
  env.ctx.removeViewTrigger();
  assert.equal(env.triggers.length, 0);
});

test('migrateAll แล้วสร้าง View ให้อัตโนมัติ (ไม่ต้องรันเอง)', () => {
  const env = createEnv();
  env.props.OLD_BOOK_ID = 'OLD';
  const b = env.addBook('OLD');
  b.addSheet('REF', [['Bench press', 'x']]);
  b.addSheet('69', [['DATE', 'ACTIVITY'], ['', '', '', 1, 2], ['6/1/2026', 'Bench press', '', 10, 8], ['', '', '', 38, 38]]);
  env.ctx.migrateAll();
  assert.ok(env.sheets.View);
  assert.deepEqual(view(env)[2].slice(0, 6), ['06-01-2569', '', '', 'Bench press', '10×38', '8×38']);
});
