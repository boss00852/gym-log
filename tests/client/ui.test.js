import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup, waitFor, addExerciseUI, closeAll, boot } from './harness.js';
import { scrollDelta } from '../../js/viewport.js';

test.afterEach(() => closeAll());

const nos = (t) => t.$$('.ex .no').map((e) => e.textContent);
const names = (t) => t.$$('.ex .nm').map((e) => e.textContent);
const collapsed = (t) => t.$$('.ex').map((c) => c.classList.contains('collapsed'));

async function startSession(t) {
  await boot(t);
  t.click(t.$('.cta'));
}

/* ---------- 1) เลขลำดับท่า ---------- */
test('การ์ดแต่ละใบมีป้าย "ท่าที่ N" ตามลำดับในเซสชัน และเลขเลื่อนตามเมื่อลบท่า', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  assert.deepEqual(nos(t), ['ท่าที่ 1']);
  await addExerciseUI(t, 'Lateral raise');
  await addExerciseUI(t, 'Cable fly');
  assert.deepEqual(nos(t), ['ท่าที่ 1', 'ท่าที่ 2', 'ท่าที่ 3']);
  assert.deepEqual(names(t), ['Bench press', 'Lateral raise', 'Cable fly']);
  // ลบท่าที่ 2 (แตะ 2 ครั้ง) → ท่าที่ 3 กลายเป็นท่าที่ 2
  const del = t.$$('.ex')[1].querySelector('.del');
  t.click(del);
  t.click(del);
  assert.deepEqual(names(t), ['Bench press', 'Cable fly']);
  assert.deepEqual(nos(t), ['ท่าที่ 1', 'ท่าที่ 2']);
});

test('เปิดเซสชันเดิม: เลขท่าเรียงตามที่บันทึกไว้', async () => {
  const t = setup({ seed: 0 });
  const m = { id: 'x1', date: '2026-11-03', time: '17:17', gym: 'A' };
  for (const n of ['Bench press', 'Lateral raise', 'Cable fly']) t.env.call('saveExercise', [m, { name: n, kind: 'strength', sets: [{ r: 10, w: 20 }] }]);
  t.app.start();
  await waitFor(() => t.$$('.sc').length === 1);
  t.click(t.$('.sc'));
  assert.deepEqual(nos(t), ['ท่าที่ 1', 'ท่าที่ 2', 'ท่าที่ 3']);
});

/* ---------- 2) ย่อ/ขยายการ์ด ---------- */
test('ขยายทีละใบ: ท่าที่เพิ่มใหม่ขยาย ใบอื่นย่อ; แตะใบที่ย่อเพื่อกลับมาแก้ (ใบก่อนหน้าย่อลง)', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  assert.deepEqual(collapsed(t), [false]);
  await addExerciseUI(t, 'Lateral raise');
  assert.deepEqual(collapsed(t), [true, false]);
  await addExerciseUI(t, 'Cable fly');
  assert.deepEqual(collapsed(t), [true, true, false]);
  t.click(t.$$('.ex')[0]); // แตะใบที่ 1
  assert.deepEqual(collapsed(t), [false, true, true]);
  assert.equal(t.$$('.ex')[0].getAttribute('aria-expanded'), 'true');
  assert.equal(t.$$('.ex')[1].getAttribute('aria-expanded'), 'false');
  t.click(t.$$('.ex')[0]); // แตะใบที่ขยายอยู่ ไม่มีอะไรเปลี่ยน
  assert.deepEqual(collapsed(t), [false, true, true]);
});

test('แตะการ์ดที่ย่อไม่ทำให้ช่องกรอกในนั้นรับโฟกัส; โฟกัสด้วยคีย์บอร์ด (Tab) ก็ขยายให้', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  await addExerciseUI(t, 'Lateral raise');
  const first = t.$$('.ex')[0];
  assert.ok(first.classList.contains('collapsed'));
  first.querySelector('[data-r="0"]').dispatchEvent(new t.win.Event('focusin', { bubbles: true }));
  assert.deepEqual(collapsed(t), [false, true]);
});

test('ปุ่มลบท่าบนการ์ดที่ย่ออยู่ ไม่ทำให้การ์ดขยาย (ต้องแตะ 2 ครั้งตามเดิม)', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  await addExerciseUI(t, 'Lateral raise');
  const del = t.$$('.ex')[0].querySelector('.del');
  t.click(del);
  assert.equal(del.textContent, 'แตะอีกครั้งเพื่อลบ');
  assert.deepEqual(collapsed(t), [true, false]);
  assert.equal(t.$$('.ex').length, 2);
});

test('ข้อมูลในการ์ดที่ย่อยังอยู่/บันทึกต่อได้ และหลังขยายค่าที่กรอกไว้ยังครบ', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  t.type(t.$('[data-r="0"]'), '12');
  t.type(t.$('[data-w="0"]'), '40');
  await addExerciseUI(t, 'Lateral raise');
  assert.ok(t.$$('.ex')[0].classList.contains('collapsed'));
  await waitFor(() => t.logRows().length === 1);
  t.click(t.$$('.ex')[0]);
  assert.equal(t.$$('.ex')[0].querySelector('[data-r="0"]').value, '12');
  assert.equal(t.$$('.ex')[0].querySelector('[data-w="0"]').value, '40');
});

test('เพิ่มท่าที่มีอยู่แล้วในเซสชัน → ขยายใบนั้น ไม่สร้างซ้ำ', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  await addExerciseUI(t, 'Lateral raise');
  await addExerciseUI(t, 'Bench press');
  assert.equal(t.$$('.ex').length, 2);
  assert.deepEqual(collapsed(t), [false, true]);
});

test('ลบใบที่ขยายอยู่ → ไม่มีใบไหนขยายค้าง; เลือกท่าถัดไปขยายใบนั้น', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  await addExerciseUI(t, 'Lateral raise');
  const del = t.$$('.ex')[1].querySelector('.del');
  t.click(del);
  t.click(del);
  assert.deepEqual(collapsed(t), [true]);
  assert.equal(t.app.activeIt, null);
  t.click(t.$$('.ex')[0]);
  assert.deepEqual(collapsed(t), [false]);
});

test('เปิดเซสชันเดิม: ขยายเฉพาะใบสุดท้าย (ที่มักทำต่อ)', async () => {
  const t = setup({ seed: 0 });
  const m = { id: 'x1', date: '2026-11-03', time: '17:17', gym: 'A' };
  for (const n of ['Bench press', 'Lateral raise', 'Cable fly']) t.env.call('saveExercise', [m, { name: n, kind: 'strength', sets: [{ r: 10, w: 20 }] }]);
  t.app.start();
  await waitFor(() => t.$$('.sc').length === 1);
  t.click(t.$('.sc'));
  assert.deepEqual(collapsed(t), [true, true, false]);
});

test('CSS: การ์ดที่ย่อซ่อน 6 อย่างตามสั่ง (พักระหว่างเซ็ต, คำอธิบาย, ฝึกล่าสุด, โน้ต, ปุ่ม ± Set, สรุป Set/Reps) แต่คงชื่อ/ตารางเซ็ต', () => {
  const css = fs.readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8');
  const rule = /\.ex\.collapsed \.rest,([^{]+)\{display:none\}/.exec(css);
  assert.ok(rule, 'ไม่พบกฎซ่อนของการ์ดที่ย่อ');
  const hidden = ('.ex.collapsed .rest,' + rule[1]).split(',').map((s) => s.trim());
  for (const k of ['.rest', '.last', '.desc', '.tools2', '.note']) assert.ok(hidden.some((h) => h.endsWith(k)), k);
  // สรุป (.sum) และปุ่ม ± Set อยู่ใน .tools2 → ซ่อนไปพร้อมกัน
  assert.ok(!hidden.some((h) => /\.nm|\.g\b|\.no\b/.test(h)), 'ต้องไม่ซ่อนชื่อ/ตารางเซ็ต/เลขท่า');
  const dom = setup();
  return boot(dom).then(async () => {
    dom.click(dom.$('.cta'));
    await addExerciseUI(dom, 'Bench press');
    const card = dom.$('.ex');
    for (const sel of ['.rest', '.desc', '.last', '.note', '.tools2 .sum', '[data-act="plus"]', '[data-act="minus"]']) assert.ok(card.querySelector(sel), sel + ' ยังอยู่ใน DOM (แค่ซ่อนด้วย CSS ตอนย่อ)');
  });
});

/* ---------- 3) คีย์บอร์ด ---------- */
test('เลือกท่าใหม่: ไม่โฟกัสช่องค้นหาเอง (คีย์บอร์ดปิดเป็นค่าเริ่มต้น) และหลังเลือกไม่มีช่องไหนโฟกัส', async () => {
  const t = setup();
  await startSession(t);
  t.click(t.$('#addbtn'));
  t.click(t.$('.ty[data-kind="strength"]'));
  await new Promise((r) => setTimeout(r, 120)); // เดิมโค้ดสั่ง focus() หลัง 50ms
  assert.notEqual(t.doc.activeElement, t.$('#exq'));
  assert.equal(t.doc.activeElement, t.doc.body);
  // พิมพ์ค้นหา (ผู้ใช้แตะช่องเอง) แล้วเลือก → คีย์บอร์ดต้องปิด
  t.$('#exq').focus();
  t.type(t.$('#exq'), 'bench');
  assert.equal(t.doc.activeElement, t.$('#exq'));
  t.click(t.$('.opt[data-ex="Bench press"]'));
  assert.equal(t.doc.activeElement, t.doc.body);
  assert.equal(t.$$('.ex').length, 1);
});

test('เลือกคาร์ดิโอ/สร้างท่าใหม่ ก็ไม่เปิดคีย์บอร์ดและไม่โฟกัสช่องในการ์ดใหม่', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Treadmill', 'cardio');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(t.doc.activeElement, t.doc.body);
  await addExerciseUI(t, 'Brand new move');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(t.doc.activeElement, t.doc.body);
});

test('แผ่นเลือกสถานที่ ไม่โฟกัสช่องค้นหาเอง', async () => {
  const t = setup({ seed: 2 });
  t.app.start();
  await waitFor(() => t.app.data.gyms.length > 0);
  t.click(t.$('.cta'));
  t.click(t.$('[data-chip="gym"]'));
  t.click(t.$('#f-gym'));
  await new Promise((r) => setTimeout(r, 120));
  assert.notEqual(t.doc.activeElement, t.$('#gymq'));
});

test('scrollDelta: อยู่ในพื้นที่ที่เห็น = 0; จมใต้ขอบล่าง/ล้นบน = เลื่อนพอดี; ใหญ่กว่าพื้นที่ = ชิดบน', () => {
  // พื้นที่ที่เห็น: 58..400 (เหนือ dock/คีย์บอร์ด), ระยะเผื่อ 12
  assert.equal(scrollDelta({ top: 100, bottom: 200 }, 58, 400), 0);
  assert.equal(scrollDelta({ top: 300, bottom: 430 }, 58, 400), 430 - (400 - 12)); // ล่างจมใต้ขอบ → เลื่อนลง 42
  assert.equal(scrollDelta({ top: 20, bottom: 120 }, 58, 400), 20 - (58 + 12)); // ล้นขอบบน → เลื่อนขึ้น 50
  assert.equal(scrollDelta({ top: 200, bottom: 700 }, 58, 400), 200 - (58 + 12)); // สูงเกินพื้นที่ → ชิดบน
  assert.equal(scrollDelta({ top: 70, bottom: 388 }, 58, 400), 0); // พอดีขอบเผื่อ
});

test('ensureVisible: ช่องกรอกที่อยู่ใต้คีย์บอร์ด/dock ถูกเลื่อนขึ้นมาเหนือ dock (นับทั้งตารางเซ็ตและปุ่ม ± Set)', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  await new Promise((r) => setTimeout(r, 60));
  const calls = [];
  t.win.scrollBy = (o) => calls.push(o);
  // จอสูง 800 คีย์บอร์ดสูง 400 → พื้นที่ที่เห็น 400; dock อยู่เหนือคีย์บอร์ด (top=320); แถบบนล่างสุดที่ 58
  t.win.visualViewport = { height: 400, offsetTop: 0, addEventListener() {} };
  t.$('#dock').getBoundingClientRect = () => ({ top: 320, bottom: 400 });
  t.$('.stk').getBoundingClientRect = () => ({ top: 0, bottom: 58 });
  const card = t.$('.ex');
  card.querySelector('.scroll').getBoundingClientRect = () => ({ top: 250, bottom: 360 });
  card.querySelector('.tools2').getBoundingClientRect = () => ({ top: 370, bottom: 410 });
  const input = card.querySelector('[data-w="1"]');
  t.app.ensureVisible(card, input);
  // ขอบล่างที่ใช้ได้ = min(400, 320) = 320; ล่างสุดของตาราง+ปุ่มคือ 410 → ต้องเลื่อนลง 410 - (320-12) = 102
  assert.deepEqual(calls, [{ top: 102, behavior: 'smooth' }]);
  // ถ้าเห็นครบแล้วไม่เลื่อน
  card.querySelector('.tools2').getBoundingClientRect = () => ({ top: 200, bottom: 240 });
  card.querySelector('.scroll').getBoundingClientRect = () => ({ top: 120, bottom: 190 });
  calls.length = 0;
  t.app.ensureVisible(card, input);
  assert.deepEqual(calls, []);
});

test('คีย์บอร์ดเด้งขึ้นหลังโฟกัส (visualViewport เปลี่ยน) → จัดตำแหน่งช่องที่กำลังกรอกใหม่; การ์ดที่ย่อไม่ถูกเลื่อน', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  await new Promise((r) => setTimeout(r, 60));
  const calls = [];
  t.win.scrollBy = (o) => calls.push(o);
  t.win.visualViewport = { height: 380, offsetTop: 0, addEventListener() {} };
  t.$('.stk').getBoundingClientRect = () => ({ top: 0, bottom: 58 });
  t.$('#dock').getBoundingClientRect = () => ({ top: 300, bottom: 380 });
  const card = t.$('.ex');
  card.querySelector('.scroll').getBoundingClientRect = () => ({ top: 260, bottom: 370 });
  card.querySelector('.tools2').getBoundingClientRect = () => ({ top: 380, bottom: 420 });
  const input = card.querySelector('[data-r="0"]');
  input.focus();
  t.app.activeVisible();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].top, 420 - (300 - 12));
  // การ์ดที่ย่อ: ไม่เลื่อน
  // ถ้าช่องที่โฟกัสอยู่ในการ์ดที่ย่อ จะไม่ไปเลื่อนหน้าตามช่องที่มองไม่เห็นเป้าหมาย
  await addExerciseUI(t, 'Lateral raise'); // ใบที่ 1 ย่อ (ช่องยังโฟกัสอยู่ใน DOM ไม่นับ — เทียบว่าไม่สั่งเลื่อน)
  await new Promise((r) => setTimeout(r, 30)); // รอการเลื่อนไปหาใบใหม่ (setActive) จบก่อน
  assert.ok(card.classList.contains('collapsed'));
  calls.length = 0;
  input.focus({ preventScroll: true });
  card.classList.add('collapsed'); // focusin ขยายการ์ดให้ (ตามสเปก) — บังคับกลับเป็นย่อเพื่อทดสอบเฉพาะ activeVisible
  t.app.activeVisible();
  assert.deepEqual(calls, []);
});

test('โฟกัสช่องกรอกจริง → เรียกจัดตำแหน่งหลายจังหวะ (รอคีย์บอร์ดเลื่อนขึ้น) และยกเลิกถ้าช่องถูกลบแล้ว', async () => {
  const t = setup();
  await startSession(t);
  await addExerciseUI(t, 'Bench press');
  const seen = [];
  t.app.ensureVisible = (card, el) => seen.push(el.getAttribute('data-r') || el.className);
  const input = t.$('[data-r="1"]');
  input.dispatchEvent(new t.win.Event('focus'));
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(seen.length, 3);
  seen.length = 0;
  input.dispatchEvent(new t.win.Event('focus'));
  input.remove();
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(seen.length, 0);
});

/* ---------- อัปเดตแอป ---------- */
test('หน้าตั้งค่า: แสดงเวอร์ชัน และปุ่มอัปเดตล้างแคช/ยกเลิก service worker แล้วรีโหลด โดยไม่ลบข้อมูล/การล็อกอิน', async () => {
  const t = setup({ seed: 1 });
  await boot(t);
  t.click(t.$('.link'));
  assert.match(t.$('#s-vtext').textContent, /เวอร์ชันแอป \d{4}-\d{2}-\d{2}\.\d+/);
  const log = [];
  t.win.caches = { keys: async () => ['gymlog-shell-v3', 'old'], delete: async (k) => { log.push('del ' + k); return true; } };
  t.win.navigator.serviceWorker = { getRegistrations: async () => [{ unregister: async () => { log.push('unregister'); } }] };
  t.app.reloadPage = () => log.push('reload');
  t.click(t.$('#s-refresh'));
  await waitFor(() => log.includes('reload'));
  assert.deepEqual(log, ['unregister', 'del gymlog-shell-v3', 'del old', 'reload']);
  assert.equal(t.storage.get('gl_token'), 'secret-token', 'การล็อกอินยังอยู่');
  assert.ok(t.storage.get('gl_boot'), 'ข้อมูลในเครื่องยังอยู่');
});

test('มีเวอร์ชันใหม่ระหว่างจดอยู่ → รอจนกลับหน้าแรกแล้วรีโหลด (ไม่รีโหลดกลางการกรอก)', async () => {
  const t = setup();
  await boot(t);
  let reloads = 0;
  t.app.reloadPage = () => { reloads++; };
  t.click(t.$('.cta'));
  t.app.pendingReload = true;
  await addExerciseUI(t, 'Bench press');
  assert.equal(reloads, 0);
  t.click(t.$('.bk'));
  assert.equal(reloads, 1);
  assert.equal(t.app.pendingReload, false);
});
