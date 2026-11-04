import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitFor, addExerciseUI, closeAll, boot, TOKEN } from './harness.js';

test.afterEach(() => closeAll());
import { isoToBE, parseBE, parseTime } from '../../js/date.js';
import { summary, deltaText, dropFlags, lastText } from '../../js/stats.js';
import { fmtHMS } from '../../js/timer.js';

const idle = (t) => t.$('[data-badge].st-idle') && t.app.q.length === 0;

/* ---------- ตรรกะล้วน ---------- */
test('วันที่: ISO ค.ศ. ↔ dd-MM-yyyy พ.ศ.', () => {
  assert.equal(isoToBE('2026-11-03'), '03-11-2569');
  assert.equal(parseBE('03-11-2569'), '2026-11-03');
  assert.equal(parseBE('3/11/2569'), '2026-11-03');
  assert.equal(parseBE('03112569'), '2026-11-03');
  assert.equal(parseBE('03-11-2026'), '2026-11-03'); // ปี ค.ศ. ก็รับ
  assert.equal(parseBE('31-02-2569'), null);
  assert.equal(parseBE('abc'), null);
  assert.equal(parseTime('1717'), '17:17');
  assert.equal(parseTime('7.05'), '07:05');
  assert.equal(parseTime('25:00'), null);
});

test('สรุปสด เทียบเซ็ตเดียวกันของครั้งก่อนเท่านั้น', () => {
  const last = { date: '2026-10-23', sets: [{ r: 13, w: 38 }, { r: 12, w: 38 }, { r: 8, w: 38 }, { r: 8, w: 38 }] };
  const it = { sets: [{ r: '13', w: '' }, { r: '12', w: '' }, { r: '9', w: '' }, { r: '', w: '' }] };
  const s = summary(it, last);
  assert.deepEqual([s.sets, s.reps, s.delta, s.text], [3, 34, 1, '3 Set · 34 Reps']);
  assert.equal(deltaText(1), '(+1)');
  assert.equal(deltaText(0), '(±0)');
  assert.equal(deltaText(-2), '(−2)');
  assert.equal(summary({ sets: [{ r: '', w: '' }] }, last).text, 'ยังไม่ได้กรอก');
  // เซ็ตที่ครั้งก่อนไม่มี ไม่นับเข้า delta
  const it2 = { sets: [{ r: 10, w: '' }, { r: 10, w: '' }] };
  assert.equal(summary(it2, { sets: [{ r: 10, w: 1 }] }).delta, 0);
  assert.equal(summary(it2, null).delta, null);
});

test('ฝึกล่าสุด reps*kg และน้ำหนักเปลี่ยนกลางท่า', () => {
  assert.equal(lastText({ date: '2026-10-23', sets: [{ r: 13, w: 38 }, { r: 12, w: 38 }, { r: 8, w: 36 }] }), 'ฝึกล่าสุด 23-10-2569 · 13*38, 12*38, 8*36');
});

test('ไฮไลต์น้ำหนักลด', () => {
  assert.deepEqual(dropFlags([{ w: 38 }, { w: 38 }, { w: '' }, { w: 36 }]), [false, false, false, true]);
});

test('จับเวลา: ฟอร์แมต HH:MM:SS', () => {
  assert.equal(fmtHMS(0), '00:00:00');
  assert.equal(fmtHMS(84000), '00:01:24');
  assert.equal(fmtHMS(3723000), '01:02:03');
});

/* ---------- หน้าแรก / แบ่งหน้า ---------- */
test('หน้าแรก: โหลด 10 รายการก่อน แล้ว infinite scroll ทีละ 10 จนครบ ไม่ซ้ำ', async () => {
  const t = setup({ seed: 25 });
  t.app.start();
  await waitFor(() => t.$$('.sc').length === 10 && t.app.data.total === 25);
  assert.match(t.text(), /แสดง 10 จาก 25 เซสชัน · เลื่อนลงเพื่อโหลดเพิ่ม/);
  assert.equal(t.$$('.sc')[0].querySelector('.dt').textContent, '25-10-2569  10:00'); // ใหม่สุดก่อน, พ.ศ.
  await t.app.loadMore();
  assert.equal(t.$$('.sc').length, 20);
  await t.app.loadMore();
  assert.equal(t.$$('.sc').length, 25);
  assert.match(t.text(), /แสดงครบ 25 เซสชัน/);
  const ids = t.$$('.sc').map((e) => e.dataset.id);
  assert.equal(new Set(ids).size, 25);
  const sess = t.net.calls.filter((c) => c.action === 'sessions').map((c) => c.args);
  assert.deepEqual(sess, [[10, 10], [20, 10]]);
});

test('หน้าแรก: ปุ่มไป Google Sheet 2 จุด ชี้แท็บ Log (gid)', async () => {
  const t = setup({ seed: 2 });
  t.app.start();
  await waitFor(() => t.$('a.shbtn'));
  const gid = t.env.sheets.Log.id;
  assert.equal(t.$('a.shbtn').href, `https://docs.google.com/spreadsheets/d/TESTID/edit#gid=${gid}`);
  assert.equal(t.$('a.shlink').href, t.$('a.shbtn').href);
});

test('หน้าแรก: แสดงทุกท่าไม่ยุบ + คาร์ดิโอ + ป้ายยิมสีต่างกัน', async () => {
  const t = setup({ seed: 0 });
  const m = { id: 'x1', date: '2026-11-03', time: '17:17', gym: 'ยิมหลัก' };
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) t.env.call('saveExercise', [m, { name: n, kind: 'strength', sets: [{ r: 12, w: 40 }, { r: 10, w: 38 }] }]);
  t.env.call('saveExercise', [m, { name: 'Treadmill', kind: 'cardio', min: 30, hr: 130 }]);
  t.env.call('saveExercise', [{ ...m, id: 'x2', gym: 'ยิม B', date: '2026-10-01' }, { name: 'A1', kind: 'strength', sets: [{ r: 1, w: 1 }] }]);
  t.app.start();
  await waitFor(() => t.$$('.sc').length === 2);
  const card = t.$$('.sc')[0];
  assert.equal(card.querySelectorAll('.mini').length, 7);
  assert.ok(!t.text().includes('แตะเพื่อดูทั้งหมด'));
  assert.equal(card.querySelector('.mini .v').textContent, '12 · 10');
  assert.equal(card.querySelector('.mini .w').textContent, '40 · 38');
  assert.equal(card.querySelectorAll('.mini')[6].querySelector('.v').textContent, '30 นาที · HR 130');
  const c1 = card.querySelector('.gy').style.color, c2 = t.$$('.sc')[1].querySelector('.gy').style.color;
  assert.notEqual(c1, c2);
});

/* ---------- เพิ่มท่า / autosave ---------- */
test('เพิ่มท่าเวท: การ์ดมีคำอธิบาย พักระหว่างเซ็ต 4 เซ็ต ป้าย Set/Reps/kg และปุ่ม − Set / + Set', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  const card = t.$('.ex');
  assert.equal(card.querySelector('.nm').textContent, 'Bench press');
  assert.equal(card.querySelector('.desc').textContent, 'ท่าอกพื้นฐาน');
  assert.equal(card.querySelector('.rest').textContent, 'พักระหว่างเซ็ต ~2 นาที');
  assert.deepEqual([...card.querySelectorAll('.sn')].map((e) => e.textContent), ['Set 1', 'Set 2', 'Set 3', 'Set 4']);
  assert.deepEqual([...card.querySelectorAll('.lb')].map((e) => e.textContent), ['Reps', 'kg']);
  assert.deepEqual([...card.querySelectorAll('.tools2 .sm')].map((e) => e.textContent), ['− Set', '+ Set']);
  assert.equal(card.querySelector('.sum').textContent, 'ยังไม่ได้กรอก');
  assert.ok(card.querySelector('.c.p'), 'ช่องว่างเป็นเส้นประ');
  t.click(card.querySelector('[data-act="plus"]'));
  assert.equal(card.querySelectorAll('.sn').length, 5);
  t.click(card.querySelector('[data-act="minus"]'));
  t.click(card.querySelector('[data-act="minus"]'));
  assert.equal(card.querySelectorAll('.sn').length, 3);
  assert.equal(t.$('.ex .rest').textContent.includes('~2'), true);
  const lat = t.$('.ex'); // ท่าเล็ก
  assert.ok(lat);
});

test('ท่าเล็ก (Lateral raise) พัก 60–90 วินาที', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Lateral raise');
  assert.equal(t.$('.rest').textContent, 'พักระหว่างเซ็ต 60–90 วินาที');
});

test('autosave: พิมพ์แล้วบันทึกเอง (debounce) 1 แถวต่อเซ็ต + จุดสถานะกลับเขียว', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  const [r0, r1] = t.$$('[data-r]');
  const [w0] = t.$$('[data-w]');
  t.type(r0, '12');
  t.type(w0, '40');
  t.type(r1, '10');
  assert.equal(t.logRows().length, 0, 'ยังไม่บันทึกก่อนครบ debounce');
  await waitFor(() => t.logRows().length === 2 && idle(t));
  const rows = t.logRows();
  assert.deepEqual(rows.map((r) => [r[5], r[7], r[8], r[9]]), [['Bench press', 1, 12, 40], ['Bench press', 2, 10, 40]]);
  assert.ok(t.$('[data-badge].st-idle'));
  // แก้ต่อ → แทนที่ ไม่เพิ่มซ้ำ
  t.type(r1, '9');
  await waitFor(() => t.logRows().some((r) => r[8] === 9));
  assert.equal(t.logRows().length, 2);
  // โน้ต
  t.type(t.$('.note'), 'ไหล่ตึง');
  await waitFor(() => t.logRows().every((r) => r[12] === 'ไหล่ตึง'));
});

test('เติมน้ำหนักอัตโนมัติ: จากเซ็ตก่อนหน้า หรือค่าครั้งก่อน และเคลียร์เมื่อลบ Reps', async () => {
  const t = setup({ seed: 0 });
  t.env.call('saveExercise', [{ id: 'old', date: '2026-10-23', time: '10:00', gym: 'ยิมหลัก' }, { name: 'Bench press', kind: 'strength', sets: [{ r: 13, w: 38 }, { r: 12, w: 38 }, { r: 8, w: 36 }, { r: 8, w: 36 }] }]);
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  await waitFor(() => t.$('.last') && !t.$('.last').hidden);
  assert.equal(t.$('.last').textContent, 'ฝึกล่าสุด 23-10-2569 · 13*38, 12*38, 8*36, 8*36');
  const r = t.$$('[data-r]'), w = t.$$('[data-w]');
  assert.equal(r[0].placeholder, '13');
  assert.equal(w[2].placeholder, '36');
  t.type(r[0], '13'); // ไม่มีเซ็ตก่อนหน้า → ใช้ค่าครั้งก่อนของเซ็ต 1
  assert.equal(w[0].value, '38');
  assert.ok(!w[0].classList.contains('p'), 'นับเป็นกรอกแล้ว ขอบทึบ');
  t.type(r[1], '12'); // เติมจากเซ็ตก่อนหน้า
  assert.equal(w[1].value, '38');
  t.type(r[1], ''); // ลบ Reps → เคลียร์น้ำหนักที่เติมอัตโนมัติ
  assert.equal(w[1].value, '');
  // น้ำหนักที่ผู้ใช้พิมพ์เองไม่ถูกเคลียร์
  t.type(w[2], '34');
  t.type(r[2], '9');
  t.type(r[2], '');
  assert.equal(w[2].value, '34');
});

test('ไฮไลต์น้ำหนักลด (.d) + สรุปสด (+1) ในหน้าจริง', async () => {
  const t = setup({ seed: 0 });
  t.env.call('saveExercise', [{ id: 'old', date: '2026-10-23', time: '10:00', gym: 'ยิมหลัก' }, { name: 'Bench press', kind: 'strength', sets: [{ r: 13, w: 38 }, { r: 12, w: 38 }, { r: 8, w: 38 }, { r: 8, w: 38 }] }]);
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  await waitFor(() => t.$('.last') && !t.$('.last').hidden);
  const r = t.$$('[data-r]'), w = t.$$('[data-w]');
  t.type(r[0], '13'); t.type(r[1], '12'); t.type(r[2], '9');
  assert.equal(t.$('.sum').textContent, '3 Set · 34 Reps (+1)');
  assert.ok(!t.$('.sum b').classList.contains('neg'));
  t.type(w[3], '36');
  assert.ok(w[3].classList.contains('d'));
  assert.ok(!w[2].classList.contains('d'));
  t.type(r[2], '6');
  assert.equal(t.$('.sum').textContent, '3 Set · 31 Reps (−2)');
  assert.ok(t.$('.sum b').classList.contains('neg'));
});

test('ท่าใหม่: สร้างแล้วต่อท้าย REF (เฉพาะแถวใหม่) และใช้ได้ทันที', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Pec deck fly');
  assert.equal(t.$('.nm').textContent, 'Pec deck fly');
  await waitFor(() => t.env.sheets.REF.grid.some((r) => r[0] === 'Pec deck fly'));
  assert.deepEqual(t.env.sheets.REF.grid[3], ['Pec deck fly', '', 'strength']);
  assert.equal(t.env.sheets.REF.grid.length, 4);
});

test('คาร์ดิโอ: ไม่มี dock จับเวลา, บันทึกนาที/HR, เพิ่มเวทแล้ว dock กลับมา', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  assert.ok(!t.$('#dock').hidden, 'เซสชันว่างยังมี dock');
  await addExerciseUI(t, 'Treadmill', 'cardio');
  assert.ok(t.$('#dock').hidden);
  assert.ok(!t.$('.tools2'), 'ไม่มีตาราง Set');
  t.type(t.$('[data-f="min"]'), '30');
  t.type(t.$('[data-f="hr"]'), '130');
  await waitFor(() => t.logRows().length === 1);
  assert.deepEqual([t.logRows()[0][6], t.logRows()[0][10], t.logRows()[0][11]], ['cardio', 30, 130]);
  await addExerciseUI(t, 'Bench press');
  assert.ok(!t.$('#dock').hidden);
});

test('ลบท่า: แตะครั้งแรกเตือน แตะอีกครั้งจึงลบ และลบแถวในชีต', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  t.type(t.$('[data-r]'), '10');
  await waitFor(() => t.logRows().length === 1);
  const del = t.$('.del');
  t.click(del);
  assert.equal(del.textContent, 'แตะอีกครั้งเพื่อลบ');
  assert.equal(t.$$('.ex').length, 1);
  t.click(del);
  assert.equal(t.$$('.ex').length, 0);
  await waitFor(() => t.logRows().length === 0);
});

test('ออกจากเซสชันที่ไม่ได้กรอกอะไร: ไม่สร้างแถว ไม่ขึ้นหน้าแรก', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  t.click(t.$('.bk'));
  assert.equal(t.$$('.sc').length, 0);
  assert.equal(t.logRows().length, 0);
});

/* ---------- แถบบน / แผ่นแก้ meta ---------- */
test('แถบบน sticky + ชิป วันที่ (พ.ศ.) เวลา สถานที่; แก้ในแผ่นแล้วอัปเดตทุกแถวของเซสชันที่บันทึกแล้ว', async () => {
  const t = setup({ seed: 1 });
  t.app.start();
  await waitFor(() => t.$$('.sc').length === 1);
  t.click(t.$('.sc'));
  assert.ok(t.$('.stk'));
  assert.equal(t.$('[data-chip="date"]').textContent, '01-10-2569');
  assert.equal(t.$('[data-chip="time"]').textContent, '10:00');
  assert.equal(t.$('[data-chip="gym"]').textContent, 'ยิมหลัก');
  assert.ok(!t.$('input[type="date"]'), 'ไม่มีช่องกรอกวันที่แบบเต็มบนสุดอีกแล้ว');
  t.click(t.$('[data-chip="date"]'));
  t.change(t.$('#f-date'), '04-11-2569');
  t.change(t.$('#f-time'), '1805');
  t.click(t.$('.chip[data-gym="ยิมหลัก"]'));
  await waitFor(() => t.logRows().every((r) => r[2] === '2026-11-04' && r[3] === '18:05'));
  assert.equal(t.$('[data-chip="date"]').textContent, '04-11-2569');
  // วันที่ผิดไม่ถูกบันทึก
  t.change(t.$('#f-date'), '99-99-2569');
  assert.ok(t.$('#f-date').classList.contains('bad'));
  assert.equal(t.$('[data-chip="date"]').textContent, '04-11-2569');
});

test('เพิ่มสถานที่ใหม่จากแผ่นค้นหา ใช้กับเซสชันนี้ทันที + มีจำนวนครั้งของยิมเดิม', async () => {
  const t = setup({ seed: 3 });
  t.app.start();
  await waitFor(() => t.app.data.gyms.length === 2);
  t.click(t.$('.cta'));
  t.click(t.$('[data-chip="gym"]'));
  t.click(t.$('#f-gym'));
  const opts = t.$$('.opt[data-gym]').map((e) => e.textContent);
  assert.ok(opts.some((x) => /ยิมหลัก.*2 ครั้ง/.test(x)));
  t.type(t.$('#gymq'), 'ยิม C');
  t.click(t.$('#newgym'));
  assert.equal(t.app.cur.gym, 'ยิม C');
  assert.equal(t.$('[data-chip="gym"]').textContent, 'ยิม C');
  assert.equal(t.$('#f-gym').textContent, 'ยิม C');
  // เซสชันใหม่ที่ยังไม่มีข้อมูลไม่ถูกส่งขึ้นชีต
  assert.equal(t.net.calls.filter((c) => c.action === 'saveMeta').length, 0);
  await addExerciseUI(t, 'Bench press');
  t.type(t.$('[data-r]'), '10');
  await waitFor(() => t.logRows().some((r) => r[4] === 'ยิม C'));
});

/* ---------- จับเวลา ---------- */
test('จับเวลาพัก: นับขึ้นจาก timestamp, เริ่มพักใหม่รีเซ็ตจาก 0, ■ หยุด, ไม่หายเมื่อเปิดแอปใหม่', async () => {
  const now = { t: 1_000_000 };
  const t = setup({ nowRef: now });
  await boot(t);
  t.click(t.$('.cta'));
  assert.match(t.$('.dt2').textContent, /00:00:00/);
  assert.equal(t.$('#restgo').textContent, 'เริ่มพัก');
  assert.ok(t.$('#reststop').hidden);
  t.click(t.$('#restgo'));
  now.t += 84_000; // พับจอ 84 วินาที ค่าต้องไม่เพี้ยน
  t.app.paintTimer();
  assert.match(t.$('.dt2').textContent, /00:01:24/);
  assert.equal(t.$('#restgo').textContent, 'เริ่มพักใหม่');
  assert.ok(!t.$('#reststop').hidden);
  t.click(t.$('#restgo'));
  assert.match(t.$('.dt2').textContent, /00:00:00/);
  now.t += 5_000;
  t.app.paintTimer();
  assert.match(t.$('.dt2').textContent, /00:00:05/);
  assert.equal(t.storage.get('gl_rest'), 1_084_000);
  t.click(t.$('#reststop'));
  assert.match(t.$('.dt2').textContent, /00:00:00/);
  assert.equal(t.storage.get('gl_rest', null), null);
});

/* ---------- คิวออฟไลน์ / retry ---------- */
test('ออฟไลน์: เก็บคิวใน localStorage จุดเป็นส้ม แล้วซิงก์เมื่อกลับมา ไม่ซ้ำ', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  t.net.offline = true;
  t.type(t.$('[data-r]'), '12');
  await waitFor(() => t.$('[data-badge].st-offline'));
  assert.equal(t.storage.get('gl_q', []).length, 1);
  assert.equal(t.logRows().length, 0);
  assert.ok(!t.$('[data-hint]').hidden);
  // แก้ซ้ำระหว่างออฟไลน์ → รวมเป็น op เดียว
  t.type(t.$('[data-r]'), '13');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(t.storage.get('gl_q', []).length, 1);
  t.net.offline = false;
  await waitFor(() => t.logRows().length === 1 && idle(t), 2000);
  assert.equal(t.logRows()[0][8], 13);
  assert.deepEqual(t.storage.get('gl_q', []), []);
  assert.ok(t.$('[data-hint]').hidden);
});

test('กันซ้ำเมื่อ retry: เซิร์ฟเวอร์เขียนแล้วแต่ response หาย → ส่งซ้ำด้วย opId เดิมไม่เพิ่มแถว', async () => {
  const t = setup();
  await boot(t);
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  t.net.dropResponse = 2;
  t.type(t.$('[data-r]'), '12');
  await waitFor(() => t.net.calls.filter((c) => c.action === 'saveExercise').length >= 3 && idle(t), 2000);
  const saves = t.net.calls.filter((c) => c.action === 'saveExercise');
  assert.equal(new Set(saves.map((c) => c.opId)).size, 1, 'ทุกครั้งที่ retry ใช้ opId เดิม');
  assert.equal(t.logRows().length, 1);
});

test('คิวที่ค้างอยู่ตอนปิดแอป ถูกส่งต่อเมื่อเปิดใหม่', async () => {
  const op = { uid: 'old1', t: 'save', meta: { id: 'sz', date: '2026-11-03', time: '09:00', gym: 'ยิมหลัก' }, ex: { name: 'Bench press', kind: 'strength', sets: [{ r: 10, w: 40 }], min: '', hr: '', note: '' } };
  const t = setup({ preset: { gl_q: [op] } });
  t.app.start();
  await waitFor(() => t.logRows().length === 1 && t.app.q.length === 0);
  assert.equal(t.logRows()[0][1], 'sz');
});

/* ---------- ความปลอดภัย / การตั้งค่า ---------- */
test('คำขอ API: POST text/plain ไม่มี custom header ไม่ส่ง credentials และไม่แคช', async () => {
  const t = setup({ seed: 1 });
  t.app.start();
  await waitFor(() => t.net.lastInit);
  const { init } = t.net.lastInit;
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'follow');
  assert.equal(init.headers, undefined);
  assert.equal(typeof init.body, 'string');
  const b = JSON.parse(init.body);
  assert.deepEqual(Object.keys(b).sort(), ['action', 'args', 'token']); // อ่านข้อมูลไม่มี opId
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  t.type(t.$('[data-r]'), '10');
  await waitFor(() => t.net.calls.some((c) => c.action === 'saveExercise'));
  assert.match(t.net.calls.find((c) => c.action === 'saveExercise').opId, /^s\w+$/); // เขียนมี opId กันซ้ำ
});

test('unauthorized: token ผิด → จุดแดง ไม่แสดงข้อมูล คิวไม่หาย และแก้ token แล้วซิงก์ต่อ', async () => {
  const t = setup({ token: 'wrong', seed: 3 });
  t.app.start();
  await waitFor(() => t.$('[data-badge].st-auth'));
  assert.equal(t.$$('.sc').length, 0, 'ไม่มีข้อมูลหลุดมา');
  assert.equal(t.app.data.sessions.length, 0);
  // บันทึกขณะ token ผิด → เก็บในคิว ไม่ทิ้ง
  t.click(t.$('.cta'));
  await addExerciseUI(t, 'Bench press');
  t.type(t.$('[data-r]'), '10');
  // ท่าใหม่ (add) ค้างหัวคิว + save ตามหลัง รอเงียบ ๆ จนกว่าจะแก้ token
  await waitFor(() => t.app.q.length === 2 && t.$('[data-badge].st-auth'));
  await new Promise((r) => setTimeout(r, 120));
  const writes = t.net.calls.filter((c) => ['addExercise', 'saveExercise', 'deleteExercise', 'saveMeta'].includes(c.action));
  assert.equal(writes.length, 1, 'ลองส่งครั้งเดียวแล้วหยุด ไม่ยิงซ้ำรัว ๆ ด้วย token ผิด');
  assert.equal(t.storage.get('gl_q', []).length, 2, 'คิวไม่หาย');
  assert.equal(t.logRows().length, 3);
  // ไปหน้าตั้งค่า ทดสอบ → ผิด
  t.click(t.$('.bk'));
  t.click(t.$('.link'));
  t.type(t.$('#s-token'), 'wrong2');
  t.click(t.$('#s-test'));
  await waitFor(() => /token ไม่ถูกต้อง/.test(t.$('#s-res').textContent));
  assert.ok(t.$('#s-res').classList.contains('err'));
  // ใส่ token ถูก
  t.type(t.$('#s-token'), TOKEN);
  t.click(t.$('#s-test'));
  await waitFor(() => /เชื่อมต่อสำเร็จ · พบ 3 เซสชัน/.test(t.$('#s-res').textContent));
  t.click(t.$('#s-save'));
  await waitFor(() => t.app.q.length === 0 && t.logRows().length === 4);
  assert.equal(t.$$('.sc').length >= 1, true);
});

test('เปิดครั้งแรก: ไปหน้าตั้งค่า, URL ต้องเป็น https, ทดสอบแล้วบันทึกลง localStorage (ไม่โชว์ token)', async () => {
  const t = setup({ noConfig: true, seed: 2 });
  t.app.start();
  assert.ok(t.$('#s-url'));
  assert.ok(!t.$('.bk'), 'ยังไม่ตั้งค่า → ไม่มีปุ่มย้อนกลับ');
  t.type(t.$('#s-url'), 'http://evil.example/exec');
  t.click(t.$('#s-save'));
  assert.match(t.$('#s-res').textContent, /URL ไม่ถูกต้อง/);
  t.type(t.$('#s-url'), 'https://script.google.com/macros/s/TEST/exec');
  t.type(t.$('#s-token'), TOKEN);
  assert.equal(t.$('#s-token').type, 'password');
  t.click(t.$('#s-test'));
  await waitFor(() => /เชื่อมต่อสำเร็จ/.test(t.$('#s-res').textContent));
  t.click(t.$('#s-save'));
  await waitFor(() => t.$$('.sc').length === 2);
  assert.equal(t.storage.get('gl_token'), TOKEN);
  assert.equal(t.storage.get('gl_api_url'), 'https://script.google.com/macros/s/TEST/exec');
  t.click(t.$('.link'));
  assert.equal(t.$('#s-token').value, '', 'ไม่เติม token กลับลงช่อง');
});

test('ตัวอย่างข้อมูลจากชีตถูกแสดงด้วย textContent (ไม่ตีความ HTML)', async () => {
  const t = setup();
  t.env.call('saveExercise', [{ id: 'xss', date: '2026-11-03', time: '10:00', gym: '<img src=x onerror=alert(1)>' }, { name: '<b>bold</b>', kind: 'strength', sets: [{ r: 1, w: 1 }] }]);
  t.app.start();
  await waitFor(() => t.$$('.sc').length === 1);
  assert.equal(t.$$('img').length, 0);
  assert.equal(t.$$('.sc b').length, 0);
  assert.ok(t.$('.sc').textContent.includes('<b>bold</b>'));
});
