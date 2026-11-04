// วันที่: เก็บ ISO ค.ศ. (yyyy-MM-dd) แสดง/แก้ไขเป็น dd-MM-yyyy ปี พ.ศ.
export const pad = (n) => (n < 10 ? '0' + n : '' + n);

export function isoToday(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function nowHM(d = new Date()) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function isoToBE(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}-${m[2]}-${+m[1] + 543}` : iso || '';
}

function validDate(y, mo, d) {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

// รับ "03-11-2569", "3/11/69"(ไม่รับ), "03112569" → ISO หรือ null; ปี >= 2400 ถือเป็น พ.ศ. ไม่งั้น ค.ศ.
export function parseBE(text) {
  const s = String(text || '').trim();
  let parts;
  if (/^\d{8}$/.test(s)) parts = [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
  else parts = s.split(/[-/.\s]+/);
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const d = +parts[0], mo = +parts[1];
  let y = +parts[2];
  if (parts[2].length !== 4) return null;
  if (y >= 2400) y -= 543;
  if (!validDate(y, mo, d)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// "1717", "17:17", "7.05" → "HH:mm" หรือ null
export function parseTime(text) {
  const s = String(text || '').trim();
  let m = /^(\d{1,2})[:.](\d{2})$/.exec(s) || /^(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return pad(h) + ':' + pad(mi);
}
