// ตรรกะล้วน (ไม่แตะ DOM): ฝึกล่าสุด, สรุปสด, ไฮไลต์น้ำหนักลด, เติมน้ำหนัก
import { empty, isNum, toNum } from './util.js';
import { isoToBE } from './date.js';

const SMALL_RE = /curl|raise|pushdown|push down|extension|fly|crunch|calf|kickback|shrug|face pull|pec deck|rear delt|wrist/i;

export const restText = (name) => 'พักระหว่างเซ็ต ' + (SMALL_RE.test(name) ? '60–90 วินาที' : '~2 นาที');

export const setFilled = (s) => !empty(s && s.r);

export function hasData(it) {
  if (it.kind === 'cardio') return !!(String(it.min ?? '') !== '' || String(it.hr ?? '') !== '' || it.note);
  return !!(it.note || it.sets.some((s) => !empty(s.r) || !empty(s.w)));
}

// "ฝึกล่าสุด 23-10-2569 · 13*38, 12*38, 8*38, 8*38"
export function lastText(last) {
  const parts = last.sets.map((x) => (empty(x.r) ? '–' : String(x.r)) + (empty(x.w) ? '' : '*' + x.w));
  return 'ฝึกล่าสุด ' + isoToBE(last.date) + ' · ' + parts.join(', ');
}

// สรุปสด: เซ็ตที่กรอก Reps แล้ว เทียบ "เซ็ตเดียวกัน" ของครั้งก่อนเท่านั้น
export function summary(it, last) {
  const filled = [];
  it.sets.forEach((s, i) => {
    if (setFilled(s) && isNum(s.r)) filled.push(i);
  });
  if (!filled.length) return { sets: 0, reps: 0, delta: null, text: 'ยังไม่ได้กรอก' };
  const reps = filled.reduce((a, i) => a + toNum(it.sets[i].r), 0);
  let delta = null;
  if (last) {
    filled.forEach((i) => {
      const lp = last.sets[i];
      if (lp && isNum(lp.r)) delta = (delta || 0) + toNum(it.sets[i].r) - toNum(lp.r);
    });
  }
  return { sets: filled.length, reps, delta, text: `${filled.length} Set · ${reps} Reps` };
}

export const deltaText = (d) => '(' + (d === 0 ? '±0' : d > 0 ? '+' + d : '−' + Math.abs(d)) + ')';

// น้ำหนักต่ำกว่าเซ็ตก่อนหน้า (ที่มีน้ำหนัก) → true
export function dropFlags(sets) {
  let prev = null;
  return sets.map((s) => {
    const cur = !empty(s.w) && isNum(s.w) ? toNum(s.w) : null;
    const drop = cur !== null && prev !== null && cur < prev;
    if (cur !== null) prev = cur;
    return drop;
  });
}

// น้ำหนักที่จะเติมให้อัตโนมัติเมื่อกรอก Reps ของเซ็ต i แล้ว kg ยังว่าง
export function autoWeight(sets, i, last) {
  if (i > 0 && !empty(sets[i - 1].w)) return String(sets[i - 1].w);
  const lp = last && last.sets[i];
  if (lp && !empty(lp.w)) return String(lp.w);
  return '';
}
