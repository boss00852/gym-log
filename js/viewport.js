// คำนวณระยะที่ต้องเลื่อนหน้า เพื่อให้กล่อง rect มองเห็นครบในพื้นที่ที่ว่างจริง
// (ระหว่างแถบบน sticky กับขอบล่างที่เล็กที่สุดของ "พื้นที่ที่เห็น (เหนือคีย์บอร์ด)" และ "dock จับเวลา")
// คืนค่าบวก = เลื่อนหน้าลง (เนื้อหาขึ้น), ลบ = เลื่อนขึ้น, 0 = ไม่ต้องเลื่อน
export function scrollDelta(rect, topLimit, bottomLimit, pad = 12) {
  const height = rect.bottom - rect.top;
  const room = bottomLimit - topLimit - 2 * pad;
  if (height > room) return Math.round(rect.top - (topLimit + pad)); // ใหญ่กว่าพื้นที่ → ชิดบน (เห็นส่วนหัวก่อน)
  if (rect.bottom > bottomLimit - pad) return Math.round(rect.bottom - (bottomLimit - pad));
  if (rect.top < topLimit + pad) return Math.round(rect.top - (topLimit + pad));
  return 0;
}
