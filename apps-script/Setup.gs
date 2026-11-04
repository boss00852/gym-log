/**
 * ตั้งค่าครั้งแรกด้วยการกดรันฟังก์ชันเดียว: setup
 *  - สร้าง Script Property API_TOKEN (สุ่มให้ ถ้ายังไม่มี) แล้วแสดง token ใน Execution log — คัดลอกไปวางในแอป
 *  - ตั้ง OLD_BOOK_ID (ไฟล์เก่าสำหรับย้ายข้อมูล) และเช็กว่าเปิดไฟล์เก่าได้
 *  - สร้างแท็บ Log / Exercises / Places พร้อมหัวตาราง
 *
 * OLD_BOOK_ID ด้านล่างเป็นค่าตัวอย่าง; ไฟล์ที่ได้จาก `node tools/bundle.mjs <ID>` จะใส่ ID จริงให้แล้ว
 */
var OLD_BOOK_ID = 'PASTE_OLD_BOOK_ID_HERE';

function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('API_TOKEN');
  var created = false;
  if (!token) {
    // สุ่มจาก UUID v4 สองตัว (ประมาณ 244 บิต)
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('API_TOKEN', token);
    created = true;
  }

  var report = [];
  if (OLD_BOOK_ID && OLD_BOOK_ID.indexOf('PASTE_') !== 0) {
    props.setProperty('OLD_BOOK_ID', OLD_BOOK_ID);
    try {
      var old = SpreadsheetApp.openById(OLD_BOOK_ID);
      report.push('เปิดไฟล์เก่าได้: "' + old.getName() + '" (' + old.getSheets().length + ' แท็บ)');
    } catch (e) {
      report.push('เปิดไฟล์เก่าไม่ได้ — ตรวจ OLD_BOOK_ID และสิทธิ์: ' + e.message);
    }
  } else {
    report.push('ยังไม่ได้ใส่ OLD_BOOK_ID (แก้ค่าด้านบนของไฟล์ Setup แล้วรัน setup ใหม่ ถ้าต้องการย้ายข้อมูลเก่า)');
  }

  logSheet_();
  exSheet_();
  placeSheet_();
  report.push('แท็บ Log / Exercises / Places พร้อมแล้ว');

  Logger.log('==== setup เสร็จ ====\n' + report.join('\n'));
  Logger.log((created ? 'API token ใหม่ (คัดลอกไปวางในแอป อย่าแชร์ให้ใคร):\n' : 'มี API token อยู่แล้ว (ดูได้ด้วยการรัน showToken):\n') + (created ? token : '(ซ่อนไว้)'));
  return { tokenCreated: created, report: report };
}

// แสดง token ที่ตั้งไว้ (ใช้เมื่อลืมคัดลอก) — ดูได้เฉพาะเจ้าของสคริปต์ใน Execution log
function showToken() {
  var t = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  Logger.log(t ? 'API token:\n' + t : 'ยังไม่มี token — รัน setup ก่อน');
}
