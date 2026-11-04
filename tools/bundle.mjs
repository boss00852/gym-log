// รวม Code.gs + Migrate.gs + Setup.gs เป็นไฟล์เดียวสำหรับวางใน Apps Script ครั้งเดียว
// ใช้:  node tools/bundle.mjs <OLD_BOOK_ID>     → dist/gym-log-all.gs (โฟลเดอร์ dist/ ไม่ถูก commit)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldId = process.argv[2] || '';
if (oldId && !/^[A-Za-z0-9_-]{20,}$/.test(oldId)) {
  console.error('OLD_BOOK_ID ดูไม่ถูกต้อง');
  process.exit(1);
}
const read = (f) => fs.readFileSync(path.join(root, 'apps-script', f), 'utf8').replace(/\r\n/g, '\n');
let setup = read('Setup.gs');
if (oldId) setup = setup.replace("'PASTE_OLD_BOOK_ID_HERE'", JSON.stringify(oldId).replace(/"/g, "'"));
const out = ['// ===== Code.gs =====', read('Code.gs'), '// ===== Migrate.gs =====', read('Migrate.gs'), '// ===== Setup.gs =====', setup].join('\n');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'gym-log-all.gs');
fs.writeFileSync(file, out);
console.log(file, out.split('\n').length + ' บรรทัด', oldId ? '(ใส่ OLD_BOOK_ID แล้ว)' : '(ยังไม่ได้ใส่ OLD_BOOK_ID)');
