// Mock ของ Apps Script (SpreadsheetApp ฯลฯ) สำหรับทดสอบ Code.gs ด้วย Node vm — ไม่แตะชีตจริง
import vm from 'node:vm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CODE = fs.readFileSync(path.join(here, '../../apps-script/Code.gs'), 'utf8');
const MIGRATE = fs.readFileSync(path.join(here, '../../apps-script/Migrate.gs'), 'utf8');
const SETUP = fs.readFileSync(path.join(here, '../../apps-script/Setup.gs'), 'utf8');

function colToNum(s) {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export class MockSheet {
  constructor(name, id) {
    this.name = name;
    this.id = id;
    this.grid = []; // grid[r][c] 0-based
    this.fmt = {}; // "r,c" -> '@'
    this.writes = []; // บันทึกการเขียนทุกครั้ง {op, row, col, nr, nc}
    this.formulaCells = [];
  }
  _cell(r, c) {
    return (this.grid[r] && this.grid[r][c]) ?? '';
  }
  _set(r, c, v) {
    while (this.grid.length <= r) this.grid.push([]);
    const row = this.grid[r];
    while (row.length <= c) row.push('');
    if (typeof v === 'string' && this.fmt[r + ',' + c] !== '@') {
      if (v[0] === '=') this.formulaCells.push([r + 1, c + 1, v]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = new Date(v + 'T00:00:00+07:00'); // เลียนแบบที่ Sheets แปลงเอง
    }
    row[c] = v;
  }
  getLastRow() {
    let last = 0;
    this.grid.forEach((row, i) => {
      if (row.some((v) => v !== '' && v !== null && v !== undefined)) last = i + 1;
    });
    return last;
  }
  getSheetId() {
    return this.id;
  }
  setFrozenRows() {}
  getRange(a, b, c, d) {
    const sh = this;
    let row, col, nr, nc;
    if (typeof a === 'string') {
      const m = /^([A-Z]+):([A-Z]+)$/.exec(a);
      row = 1; col = colToNum(m[1]); nc = colToNum(m[2]) - col + 1; nr = Math.max(sh.grid.length, 1000);
    } else {
      row = a; col = b; nr = c || 1; nc = d || 1;
    }
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const r = [];
          for (let j = 0; j < nc; j++) r.push(sh._cell(row - 1 + i, col - 1 + j));
          out.push(r);
        }
        return out;
      },
      setValues(vals) {
        if (vals.length !== nr || vals[0].length !== nc) throw new Error('mock: size mismatch');
        sh.writes.push({ op: 'setValues', row, col, nr, nc });
        vals.forEach((r, i) => r.forEach((v, j) => sh._set(row - 1 + i, col - 1 + j, v)));
      },
      setValue(v) {
        sh.writes.push({ op: 'setValue', row, col, nr: 1, nc: 1 });
        sh._set(row - 1, col - 1, v);
      },
      setNumberFormat(f) {
        sh.writes.push({ op: 'fmt', row, col, nr, nc });
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.fmt[row - 1 + i + ',' + (col - 1 + j)] = f;
      }
    };
  }
  deleteRows(start, count) {
    this.writes.push({ op: 'deleteRows', row: start, nr: count });
    this.grid.splice(start - 1, count);
  }
}

export function createEnv({ token = 'secret-token', tz = 'Asia/Bangkok' } = {}) {
  const sheets = {};
  const books = {}; // สเปรดชีตอื่น (ไฟล์เก่า) สำหรับ openById
  let nextId = 100;
  const props = token === null ? {} : { API_TOKEN: token };
  const cache = {};
  const logs = [];
  let lockDepth = 0;
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new MockSheet(n, nextId++)),
    getSpreadsheetTimeZone: () => tz,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/TESTID/edit'
  };
  const ctx = {
    console,
    Date,
    JSON,
    Math,
    SpreadsheetApp: { getActive: () => ss, openById: (id) => { if (!books[id]) throw new Error('no book ' + id); return books[id].ss; } },
    Logger: { log(m) { logs.push(String(m)); } },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate(d, zone, pattern) {
        // รองรับเฉพาะ pattern ที่ใช้ใน Code.gs
        const p = new Intl.DateTimeFormat('en-CA', {
          timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {});
        const hh = p.hour === '24' ? '00' : p.hour;
        return pattern === 'yyyy-MM-dd' ? `${p.year}-${p.month}-${p.day}` : `${hh}:${p.minute}`;
      }
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() { if (lockDepth) throw new Error('mock: lock reentered'); lockDepth++; },
        releaseLock() { lockDepth--; }
      })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache[k] ?? null,
        put: (k, v) => { cache[k] = v; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType(m) { this.mime = m; return this; }, getContent() { return this.content; } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx, { filename: 'Code.gs' });
  vm.runInContext(MIGRATE, ctx, { filename: 'Migrate.gs' });
  vm.runInContext(SETUP, ctx, { filename: 'Setup.gs' });

  const env = {
    ctx, sheets, props, cache, books, logs,
    // สร้างสเปรดชีตอื่น (เช่นไฟล์เก่า) พร้อมเก็บบันทึกการเขียนของทุกชีตในนั้น
    addBook(id) {
      const bs = {};
      let bid = 900;
      const bss = { getSheetByName: (n) => bs[n] || null, insertSheet: (n) => (bs[n] = new MockSheet(n, bid++)), getSpreadsheetTimeZone: () => tz, getUrl: () => 'https://old/' + id, getName: () => 'OLD ' + id, getSheets: () => Object.values(bs) };
      books[id] = { ss: bss, sheets: bs };
      return {
        sheets: bs,
        addSheet(name, rows = []) {
          const sh = (bs[name] = new MockSheet(name, bid++));
          rows.forEach((r, i) => r.forEach((v, j) => sh._set(i, j, v)));
          return sh;
        }
      };
    },
    addSheet(name, rows = []) {
      const sh = (sheets[name] = new MockSheet(name, nextId++));
      rows.forEach((r, i) => r.forEach((v, j) => sh._set(i, j, v)));
      return sh;
    },
    // เรียก API เหมือน client จริง (ส่ง JSON เป็นข้อความ)
    call(action, args = [], extra = {}) {
      const body = { token, action, args, ...extra };
      const out = ctx.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' } });
      return JSON.parse(out.getContent());
    },
    raw(body) {
      const out = ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
      return JSON.parse(out.getContent());
    }
  };
  return env;
}
