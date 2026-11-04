// สีป้ายสถานที่: ยิมหลัก (ใช้บ่อยสุด) = เขียว, ที่สอง = ฟ้า, ที่เหลือ = สีถัดไปในชุด (จำสีไว้ไม่ให้เปลี่ยน)
const PALETTE = ['#C8F169', '#7CC4F5', '#F5B461', '#C9A7F5', '#6FD3C0', '#F5A3C7', '#F28B82'];

export function gymColor(app, name) {
  if (!name) return '#9CA6B2';
  const map = app.storage.get('gl_gymcolors', {});
  if (map[name]) return map[name];
  const used = Object.values(map);
  const next = PALETTE.find((c) => !used.includes(c)) || PALETTE[Object.keys(map).length % PALETTE.length];
  map[name] = next;
  app.storage.set('gl_gymcolors', map);
  return next;
}

// ให้ยิมที่เรียงตามจำนวนครั้งได้สีตามลำดับก่อน (เรียกตอนได้ข้อมูลจาก bootstrap)
export function seedGymColors(app, gyms) {
  gyms.forEach((g) => gymColor(app, g.name));
}

export function bumpGym(app, name, delta) {
  if (!name) return;
  const g = app.data.gyms.find((x) => x.name === name);
  if (g) g.n = Math.max(0, g.n + delta);
  else if (delta > 0) app.data.gyms.push({ name, n: delta });
}
