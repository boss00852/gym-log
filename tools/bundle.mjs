// รวม Code.gs + Migrate.gs + Setup.gs เป็นไฟล์เดียวสำหรับวางใน Apps Script ครั้งเดียว
// ใช้:  node tools/bundle.mjs [OLD_BOOK_ID] [GOOGLE_CLIENT_ID]   → dist/gym-log-all.gs (โฟลเดอร์ dist/ ไม่ถูก commit)
//       (ข้าม OLD_BOOK_ID ด้วย "" ได้ถ้าย้ายข้อมูลเก่าเสร็จแล้ว)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldId = process.argv[2] || '';
const clientId = process.argv[3] || '';
if (oldId && !/^[A-Za-z0-9_-]{20,}$/.test(oldId)) {
  console.error('OLD_BOOK_ID ดูไม่ถูกต้อง');
  process.exit(1);
}
if (clientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  console.error('GOOGLE_CLIENT_ID ดูไม่ถูกต้อง (ต้องลงท้าย .apps.googleusercontent.com)');
  process.exit(1);
}
const read = (f) => fs.readFileSync(path.join(root, 'apps-script', f), 'utf8').replace(/\r\n/g, '\n');
const q = (v) => "'" + v + "'"; // ค่าผ่านการตรวจรูปแบบแล้ว ไม่มีอักขระที่ต้อง escape
let setup = read('Setup.gs');
if (oldId) setup = setup.replace("'PASTE_OLD_BOOK_ID_HERE'", q(oldId));
if (clientId) setup = setup.replace("'PASTE_GOOGLE_CLIENT_ID_HERE'", q(clientId));
const out = ['// ===== Code.gs =====', read('Code.gs'), '// ===== Migrate.gs =====', read('Migrate.gs'), '// ===== Setup.gs =====', setup].join('\n');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'gym-log-all.gs');
fs.writeFileSync(file, out);
console.log(file, out.split('\n').length + ' บรรทัด', '·', oldId ? 'OLD_BOOK_ID ✓' : 'OLD_BOOK_ID ✗', '·', clientId ? 'GOOGLE_CLIENT_ID ✓' : 'GOOGLE_CLIENT_ID ✗');
