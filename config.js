// ใส่ได้เฉพาะ URL ของ Apps Script Web App (ลงท้าย /exec) — ห้ามใส่ token ในไฟล์นี้
// เว้นว่างไว้ได้ แล้วไปใส่ในหน้า "ตั้งค่าการเชื่อมต่อ" ตอนเปิดแอปครั้งแรก
// googleClientId: OAuth Client ID (ชนิด Web application) สำหรับปุ่ม "เข้าสู่ระบบด้วย Google" — เป็นค่าสาธารณะ ไม่ใช่ความลับ
window.GYMLOG_CONFIG = {
  googleClientId: '257757459462-525mln3fvfpqj9fmtqk219p41h5kbknc.apps.googleusercontent.com',
  apiUrl: 'https://script.google.com/macros/s/AKfycbwIFKbB7fbd-yJYtyl5srUTqlD49xDIstX7mnaLh1fiKixyJxN1weLXSzZtLtm9H37B8g/exec'
};
