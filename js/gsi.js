// โหลด Google Identity Services (เฉพาะตอนเปิดหน้าตั้งค่า/เข้าสู่ระบบ เพื่อไม่ให้แอปที่ใช้ออฟไลน์พัง)
export function loadGsi(win) {
  return new Promise((resolve, reject) => {
    if (win.google && win.google.accounts && win.google.accounts.id) return resolve(win.google.accounts.id);
    const doc = win.document;
    const s = doc.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (win.google && win.google.accounts ? resolve(win.google.accounts.id) : reject(new Error('gsi-missing')));
    s.onerror = () => reject(new Error('gsi-load'));
    doc.head.appendChild(s);
  });
}
