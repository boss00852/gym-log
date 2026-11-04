/**
 * ตั้งค่าครั้งแรกด้วยการกดรันฟังก์ชันเดียว: setup
 *  - ตั้ง GOOGLE_CLIENT_ID (สำหรับเข้าสู่ระบบด้วย Google) และขอสิทธิ์ UrlFetch ครั้งแรก
 *  - ตั้ง OLD_BOOK_ID (ไฟล์เก่าสำหรับย้ายข้อมูล) และเช็กว่าเปิดไฟล์เก่าได้
 *  - สร้างแท็บ Log / Exercises / Places พร้อมหัวตาราง
 *  - ถ้ายังไม่ได้ตั้งค่า Google Client ID และยังไม่มี API_TOKEN จะสุ่ม API_TOKEN ให้ (ทางเลือกสำรอง)
 *
 * ค่าสองตัวด้านล่างเป็นค่าตัวอย่าง; ไฟล์ที่ได้จาก `node tools/bundle.mjs <OLD_BOOK_ID> <GOOGLE_CLIENT_ID>` จะใส่ค่าจริงให้แล้ว
 * (Client ID ไม่ใช่ความลับ — เป็นค่าสาธารณะที่อยู่ในหน้าเว็บอยู่แล้ว)
 */
var OLD_BOOK_ID = 'PASTE_OLD_BOOK_ID_HERE';
var GOOGLE_CLIENT_ID_SETUP = 'PASTE_GOOGLE_CLIENT_ID_HERE';

function setup() {
  var props = PropertiesService.getScriptProperties();
  var report = [];

  var hasClient = GOOGLE_CLIENT_ID_SETUP && GOOGLE_CLIENT_ID_SETUP.indexOf('PASTE_') !== 0;
  if (hasClient) {
    props.setProperty('GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID_SETUP);
    // ยิงคำขอเปล่า ๆ เพื่อให้ Google ขอสิทธิ์ UrlFetch ตั้งแต่ตอนนี้ (ไม่ใช่ตอนล็อกอินครั้งแรก)
    try {
      UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
      report.push('ตั้ง GOOGLE_CLIENT_ID แล้ว และได้สิทธิ์ UrlFetch');
    } catch (e) {
      report.push('ยังไม่ได้สิทธิ์ UrlFetch: ' + e.message);
    }
  } else {
    report.push('ยังไม่ได้ใส่ GOOGLE_CLIENT_ID (ยังเข้าสู่ระบบด้วย Google ไม่ได้ — ใช้ API token แทนได้)');
  }
  props.setProperty('ALLOWED_EMAIL', props.getProperty('ALLOWED_EMAIL') || Session.getEffectiveUser().getEmail());
  report.push('อนุญาตเฉพาะบัญชี: ' + props.getProperty('ALLOWED_EMAIL'));

  var token = props.getProperty('API_TOKEN');
  var created = false;
  if (!token && !hasClient) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('API_TOKEN', token);
    created = true;
  }

  if (OLD_BOOK_ID && OLD_BOOK_ID.indexOf('PASTE_') !== 0) {
    props.setProperty('OLD_BOOK_ID', OLD_BOOK_ID);
    try {
      var old = SpreadsheetApp.openById(OLD_BOOK_ID);
      report.push('เปิดไฟล์เก่าได้: "' + old.getName() + '" (' + old.getSheets().length + ' แท็บ)');
    } catch (e) {
      report.push('เปิดไฟล์เก่าไม่ได้ — ตรวจ OLD_BOOK_ID และสิทธิ์: ' + e.message);
    }
  } else {
    report.push('ยังไม่ได้ใส่ OLD_BOOK_ID (ข้ามได้ถ้าย้ายข้อมูลเก่าแล้ว)');
  }

  logSheet_();
  exSheet_();
  placeSheet_();
  report.push('แท็บ Log / Exercises / Places พร้อมแล้ว');

  Logger.log('==== setup เสร็จ ====\n' + report.join('\n'));
  if (created) Logger.log('API token ใหม่ (ทางเลือกสำรอง คัดลอกเก็บไว้ อย่าแชร์ให้ใคร):\n' + token);
  return { tokenCreated: created, report: report };
}

// แสดง API token เดิม (ถ้ามี) — ดูได้เฉพาะเจ้าของสคริปต์ใน Execution log
function showToken() {
  var t = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  Logger.log(t ? 'API token:\n' + t : 'ไม่มี API token (ใช้เข้าสู่ระบบด้วย Google อย่างเดียว)');
}

// ปิดการใช้ API token แบบเดิม (เหลือเฉพาะเข้าสู่ระบบด้วย Google) — เครื่องที่ใช้ token อยู่จะต้องล็อกอินใหม่
function disableLegacyToken() {
  PropertiesService.getScriptProperties().deleteProperty('API_TOKEN');
  Logger.log('ลบ API_TOKEN แล้ว — ใช้ได้เฉพาะการเข้าสู่ระบบด้วย Google');
}
