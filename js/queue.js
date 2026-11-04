// คิวออฟไลน์: เก็บ op ใน localStorage ส่งทีละตัวตามลำดับ; opId = op.uid ทำให้ retry ไม่เขียนซ้ำ (เซิร์ฟเวอร์จำ opId)
import { uid } from './util.js';

const key = (n) => String(n).toLowerCase();

export function createQueue({ api, storage, retryMs = 8000, onChange = () => {}, setT = setTimeout, clearT = clearTimeout }) {
  let queue = storage.get('gl_q', []);
  let inflight = null;
  let blocked = false; // unauthorized / ยังไม่ตั้งค่า → รอผู้ใช้แก้
  let online = true;
  let retryT = null;
  const failed = storage.get('gl_failed', []);

  const save = () => storage.set('gl_q', queue);
  const emit = () => onChange(status());

  function status() {
    if (blocked && queue.length) return { state: 'auth', n: queue.length };
    if (!queue.length) return { state: 'idle', n: 0 };
    return { state: online ? 'pending' : 'offline', n: queue.length };
  }

  function enqueue(op) {
    op.uid = uid();
    queue = queue.filter((o) => {
      if (inflight && o.uid === inflight) return true;
      if (op.t === 'save' && o.t === 'save') return !(o.meta.id === op.meta.id && key(o.ex.name) === key(op.ex.name));
      if (op.t === 'del') return !(o.t === 'save' && o.meta.id === op.id && key(o.ex.name) === key(op.name));
      if (op.t === 'meta' && o.t === 'meta') return o.meta.id !== op.meta.id;
      return true;
    });
    queue.push(op);
    save();
    emit();
    flush();
  }

  function run(op) {
    if (op.t === 'save') return api.call('saveExercise', [op.meta, op.ex], op.uid);
    if (op.t === 'del') return api.call('deleteExercise', [op.id, op.name], op.uid);
    if (op.t === 'meta') return api.call('saveMeta', [op.meta], op.uid);
    if (op.t === 'add') return api.call('addExercise', [op.name, op.kind], op.uid);
    return Promise.resolve();
  }

  async function flush() {
    if (inflight || !queue.length || blocked) {
      emit();
      return;
    }
    clearT(retryT);
    const op = queue[0];
    inflight = op.uid;
    try {
      await run(op);
      queue = queue.filter((o) => o.uid !== op.uid);
      save();
      online = true;
      inflight = null;
      emit();
      flush();
    } catch (e) {
      inflight = null;
      const code = e && e.code;
      if (code === 'unauthorized' || code === 'not-configured') {
        blocked = true;
        emit();
      } else if (code === 'server') {
        // เซิร์ฟเวอร์ปฏิเสธ op นี้ (ข้อมูลไม่ถูกต้อง) — ทิ้งเพื่อไม่ให้คิวค้าง แต่เก็บร่องรอยไว้
        queue = queue.filter((o) => o.uid !== op.uid);
        save();
        failed.push({ op: op.t, error: e.message, at: Date.now() });
        storage.set('gl_failed', failed.slice(-20));
        emit();
        flush();
      } else {
        online = false;
        emit();
        retryT = setT(flush, retryMs);
      }
    }
  }

  return {
    enqueue,
    flush,
    status,
    resume() {
      blocked = false;
      online = true;
      flush();
    },
    setOnline(v) {
      online = v;
      if (v) flush();
      else emit();
    },
    get length() {
      return queue.length;
    },
    get ops() {
      return queue;
    }
  };
}
