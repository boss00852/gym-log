import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './mock.js';

const D = (s) => new Date(s + 'T00:00:00+07:00');
const H = [['DATE', 'ACTIVITY', 'TIME\n(min)', 'SETS  REPS  WEIGHT', '', '', '', '', '', 'DISTANCE', 'NOTE'], ['', '', '', 1, 2, 3, 4, 5, 6, '', '', 'สรุปแล้วเข้ายิมไป']];

// ข้อมูลตัวอย่างตามรูปแบบจริงของชีตเก่า (ดึงมาจากไฟล์ WORKOUT RECORD)
function oldBook(env) {
  const b = env.addBook('OLD');
  b.addSheet('REF', [
    ['Treadmill', 'เครื่องวิ่งสายพาน: คาร์ดิโอ'],
    ['-'],
    ['Bench press', 'ดันบาร์เบลบนม้านอนราบ: อก'],
    ['Dumbbell lateral raise', 'ยกดัมเบลออกข้าง: ไหล่ข้าง'],
    ['Lat pull down', 'ดึงบาร์ลง: หลัง'],
    ['cable crossover', 'ดึงสายไขว้: อก'],
    ['Bench press', 'ซ้ำ']
  ]);
  b.addSheet('64', [
    ...H,
    ['27/9/21', 'Treadmill', '30'],
    [],
    ['', 'Dumbbell lateral raise', '', 12, 12, 10, 10],
    ['', '', '', 7.5, 7.5, 7.5, 7.5],
    ['28/9/21', 'Treadmill', '30']
  ]);
  b.addSheet('69', [
    ...H,
    ['6/1/2026', 'Inclined bench press', '', 13, 12, 8, 8, 8],
    ['', '', '', 38, 38, 38, 38, 38],
    ['', 'cable crossover', '', 12, 8, 8, 8, 9],
    ['', '', '', 27, 27, 27, 27, 27],
    ['', 'Treadmill', 20],
    [D('2026-01-07'), 'Treadmill', 40, '', '', '', '', '', '', 1.9, '141-428'],
    ['', 'back extension', '', 16, 15, 12, 12, 12],
    ['', '', '', 0, 0, 0, 0, 0],
    ['12/1/2026', 'DUMBBELL LATERAL RAISE', '', 12, 10, 9],
    ['', '', '', 15, '', 15],
    ['', 'Bench press', '', 10, 8],
    ['', '', '', 38, 38],
    ['', 'Bench press', '', 6, 5],
    ['', '', '', 36, 36],
    ['', 'Lat pull down', '', 12, 12],
    ['', 'Empty row ไม่มีข้อมูล'],
    ['31/2/2026', 'วันที่ผิด', '', 5],
    ['', '', '', 5]
  ]);
  return b;
}

function setup() {
  const env = createEnv();
  env.props.OLD_BOOK_ID = 'OLD';
  const old = oldBook(env);
  return { env, old };
}

const rowsOf = (env) => env.sheets.Log.grid.slice(1);

test('migrateDryRun: สรุปให้ดูโดยไม่เขียนข้อมูลลงชีตใหม่/เก่า', () => {
  const { env, old } = setup();
  const r = env.ctx.migrateDryRun();
  assert.equal(r.dry, true);
  assert.ok(r.rows > 0);
  assert.equal(rowsOf(env).length, 0);
  assert.equal(env.sheets.Exercises.grid.length, 1, 'Exercises มีแต่หัวตาราง');
  Object.values(old.sheets).forEach((sh) => assert.equal(sh.writes.length, 0));
});

test('migrateAll: 1 แถวต่อเซ็ต ปี 2 หลักถูกแปลง ไม่ระบุสถานที่/เวลา Source=ชื่อชีต', () => {
  const { env } = setup();
  const r = env.ctx.migrateAll();
  const rows = rowsOf(env);
  assert.equal(rows.length, r.rows);
  rows.forEach((x) => {
    assert.equal(x[3], '', 'ไม่มีเวลา');
    assert.equal(x[4], '', 'ไม่ระบุสถานที่');
    assert.ok(['64', '69'].includes(x[14]));
    assert.match(x[1], /^m(64|69)-\d{8}$/);
  });
  const dates64 = [...new Set(rows.filter((x) => x[14] === '64').map((x) => x[2]))].sort();
  assert.deepEqual(dates64, ['2021-09-27', '2021-09-28']);
  const lat = rows.filter((x) => x[1] === 'm64-20210927' && x[6] === 'strength').map((x) => [x[7], x[8], x[9]]);
  assert.deepEqual(lat, [[1, 12, 7.5], [2, 12, 7.5], [3, 10, 7.5], [4, 10, 7.5]]);
  assert.equal(env.sheets.Log.formulaCells.length, 0);
  assert.equal(typeof env.sheets.Log.grid[1][14], 'string', 'Source เป็นข้อความ ไม่ถูกแปลงเป็นตัวเลข');
});

test('migrateAll: คาร์ดิโอ (นาที/ระยะทาง/โน้ต), น้ำหนัก 0 คงไว้, น้ำหนักว่างใช้ค่าเซ็ตก่อนหน้า', () => {
  const { env } = setup();
  env.ctx.migrateAll();
  const rows = rowsOf(env);
  const tm = rows.filter((x) => x[1] === 'm69-20260107' && x[5] === 'Treadmill')[0];
  assert.deepEqual([tm[6], tm[7], tm[10], tm[13], tm[12]], ['cardio', 1, 40, 1.9, '141-428']);
  const tm6 = rows.filter((x) => x[1] === 'm69-20260106' && x[5] === 'Treadmill')[0];
  assert.equal(tm6[10], 20);
  const be = rows.filter((x) => x[5] === 'back extension').map((x) => x[9]);
  assert.deepEqual(be, [0, 0, 0, 0, 0]);
  const lat = rows.filter((x) => x[1] === 'm69-20260112' && x[5] === 'Dumbbell lateral raise').map((x) => [x[7], x[8], x[9]]);
  assert.deepEqual(lat, [[1, 12, 15], [2, 10, 15], [3, 9, 15]]); // ตัวพิมพ์ตาม Exercises; ว่างเติม 15
});

test('migrateAll: ท่าซ้ำในวันเดียว ต่อเลขเซ็ต; วันที่ผิดไม่ทำให้พัง แต่เตือน', () => {
  const { env } = setup();
  const r = env.ctx.migrateAll();
  const bench = rowsOf(env).filter((x) => x[1] === 'm69-20260112' && x[5] === 'Bench press').map((x) => [x[7], x[8], x[9]]);
  assert.deepEqual(bench, [[1, 10, 38], [2, 8, 38], [3, 6, 36], [4, 5, 36]]);
  assert.ok(r.warnings.some((w) => /อ่านวันที่ไม่ได้ "31\/2\/2026"/.test(w)));
  assert.ok(!rowsOf(env).some((x) => x[5] === 'วันที่ผิด'));
  assert.equal(r.sheets['69'].skipped >= 2, true);
});

test('Exercises: นำเข้าจาก REF เก่า (ตัด "-" และซ้ำ) + เติมท่าที่หายไป + เวลาพัก', () => {
  const { env } = setup();
  const r = env.ctx.migrateAll();
  const g = env.sheets.Exercises.grid;
  assert.deepEqual(g[0], ['Exercise', 'Description', 'Kind', 'Rest']);
  const names = g.slice(1).map((x) => x[0]);
  assert.ok(!names.includes('-'));
  assert.equal(names.filter((n) => n === 'Bench press').length, 1);
  const by = Object.fromEntries(g.slice(1).map((x) => [x[0], x]));
  assert.deepEqual(by['Treadmill'].slice(1), ['เครื่องวิ่งสายพาน: คาร์ดิโอ', 'cardio', '']);
  assert.deepEqual(by['Dumbbell lateral raise'].slice(2), ['strength', '60–90 วินาที']);
  assert.deepEqual(by['Bench press'].slice(2), ['strength', '~2 นาที']);
  // ท่าที่อยู่ในประวัติแต่ไม่อยู่ใน REF ถูกเติมต่อท้าย
  assert.ok(by['Inclined bench press'] && by['back extension']);
  assert.ok(r.exercisesAdded.includes('Inclined bench press'));
  assert.equal(by['Inclined bench press'][1], '', 'ไม่มีคำอธิบายให้ (Boss เติมเอง)');
});

test('รันซ้ำไม่ซ้ำข้อมูล (ข้ามชีตที่เคยย้ายแล้ว)', () => {
  const { env } = setup();
  const a = env.ctx.migrateAll();
  const n = rowsOf(env).length;
  const b = env.ctx.migrateAll();
  assert.equal(rowsOf(env).length, n);
  assert.equal(b.rows, 0);
  assert.equal(b.sheets['64'], 'ข้าม (เคยย้ายแล้ว)');
  assert.equal(a.rows, n);
});

test('ไฟล์เก่าไม่ถูกแตะเลย (ทุกชีตรวมทั้ง REF)', () => {
  const { env, old } = setup();
  env.ctx.migrateAll();
  env.ctx.migrateAll();
  env.ctx.clearMigrated();
  Object.values(old.sheets).forEach((sh) => assert.equal(sh.writes.length, 0, sh.name));
});

test('ไม่ตั้ง OLD_BOOK_ID = หยุดพร้อมข้อความชัดเจน ไม่เขียนอะไร', () => {
  const { env } = setup();
  delete env.props.OLD_BOOK_ID;
  assert.throws(() => env.ctx.migrateAll(), /OLD_BOOK_ID/);
  assert.equal(env.sheets.Log, undefined);
});

test('หลังย้าย แอปอ่านได้ปกติ: เซสชัน, ฝึกล่าสุด, แบ่งหน้า; แถวที่แอปบันทึกเองอยู่ร่วมกันได้', () => {
  const { env } = setup();
  env.ctx.migrateAll();
  const b = env.call('bootstrap', [], {}).data;
  assert.equal(b.total, 5); // 64: 2 วัน (27, 28 ก.ย. 2021) + 69: 6/1, 7/1, 12/1
  assert.equal(b.sessions[0].date, '2026-01-12');
  assert.equal(b.sessions[0].gym, '');
  const l = env.call('last', ['Bench press', 'x']).data;
  assert.equal(l.date, '2026-01-12');
  assert.deepEqual(l.sets, [{ r: 10, w: 38 }, { r: 8, w: 38 }, { r: 6, w: 36 }, { r: 5, w: 36 }]);
  // แอปบันทึกเซสชันใหม่ แล้ว clearMigrated ลบเฉพาะที่ย้ายมา
  env.call('saveExercise', [{ id: 'app1', date: '2026-11-03', time: '17:17', gym: 'ยิมหลัก' }, { name: 'Bench press', kind: 'strength', sets: [{ r: 9, w: 40 }] }]);
  const cleared = env.ctx.clearMigrated();
  assert.ok(cleared.removed > 0);
  assert.deepEqual(rowsOf(env).map((x) => x[1]), ['app1']);
});

test('แก้เซสชันที่ย้ายมาในแอป (วันที่/สถานที่/ท่า) ทำงานได้และไม่ซ้ำกับท่าอื่น', () => {
  const { env } = setup();
  env.ctx.migrateAll();
  env.call('saveMeta', [{ id: 'm69-20260112', date: '2026-01-12', time: '18:30', gym: 'ยิมหลัก' }]);
  const rows = rowsOf(env).filter((x) => x[1] === 'm69-20260112');
  assert.ok(rows.length > 0);
  rows.forEach((x) => assert.deepEqual([x[3], x[4]], ['18:30', 'ยิมหลัก']));
  env.call('saveExercise', [{ id: 'm69-20260112', date: '2026-01-12', time: '18:30', gym: 'ยิมหลัก' }, { name: 'Bench press', kind: 'strength', sets: [{ r: 11, w: 40 }] }]);
  const bench = rowsOf(env).filter((x) => x[1] === 'm69-20260112' && x[5] === 'Bench press');
  assert.equal(bench.length, 1);
  assert.equal(bench[0][14], '', 'แถวที่แอปเขียนใหม่ไม่มี Source (ไม่ถูก clearMigrated ลบ)');
});
