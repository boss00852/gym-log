// localStorage แบบปลอดภัย (ถ้าใช้ไม่ได้ เช่น private mode จะเก็บในหน่วยความจำแทน)
export function createStorage(ls) {
  const mem = {};
  return {
    get(k, d) {
      try {
        const v = ls ? ls.getItem(k) : mem[k];
        return v === null || v === undefined ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      try {
        if (ls) ls.setItem(k, s);
        else mem[k] = s;
      } catch (e) {
        mem[k] = s;
      }
    },
    remove(k) {
      try {
        if (ls) ls.removeItem(k);
      } catch (e) {}
      delete mem[k];
    }
  };
}
