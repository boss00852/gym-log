// จับเวลาพักนับขึ้น: เก็บเฉพาะ "เวลาเริ่ม" (timestamp) แล้วคำนวณทุกครั้งที่แสดงผล → ไม่เพี้ยนเมื่อพับจอ/สลับแอป
export function fmtHMS(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return p(Math.floor(t / 3600)) + ':' + p(Math.floor((t % 3600) / 60)) + ':' + p(t % 60);
}

export function createTimer({ storage, now = () => Date.now() }) {
  let startedAt = storage.get('gl_rest', null);
  return {
    start() {
      startedAt = now();
      storage.set('gl_rest', startedAt);
    },
    stop() {
      startedAt = null;
      storage.remove('gl_rest');
    },
    get running() {
      return startedAt !== null;
    },
    elapsed() {
      return startedAt === null ? 0 : now() - startedAt;
    },
    text() {
      return fmtHMS(this.elapsed());
    }
  };
}
