/**
 * Gym Log — Google Apps Script JSON API (Web App)
 * ผูกกับสเปรดชีตของ Boss (container-bound)
 *
 * สเปรดชีตใหม่ 3 แท็บ (สร้างหัวตารางให้เองถ้ายังไม่มี):
 * - "Log"       : 1 แถวต่อ 1 เซ็ต (แหล่งข้อมูลจริง)
 *                UpdatedAt, SessionId, Date, Time, Place, Exercise, Kind, Set, Reps, Weight, Minutes, AvgHR, Note, Distance, Source
 * - "Exercises" : Exercise, Description, Kind (strength/cardio), Rest — เพิ่มท่าใหม่ต่อท้ายเท่านั้น
 * - "Places"    : Place, Color, Note — สถานที่ใหม่ถูกเพิ่มต่อท้ายให้อัตโนมัติ
 * ข้อมูลเก่าจากสเปรดชีตเดิมย้ายด้วย Migrate.gs (รันครั้งเดียว) — ไฟล์เดิมไม่ถูกแตะ
 *
 * Endpoint เดียว: doPost(e)  body = JSON {token, action, args, opId} (ส่งเป็น text/plain)
 * ตอบ {ok:true, data} หรือ {ok:false, error}
 * ความปลอดภัย: เข้าสู่ระบบด้วย Google (action login → session token) หรือ Script Property "API_TOKEN" (เดิม)
 *               ไม่มี token ที่ถูกต้อง = unauthorized และไม่คืนข้อมูลใด ๆ
 */

var LOG_SHEET = 'Log';
var EX_SHEET = 'Exercises';
var PLACE_SHEET = 'Places';
var HEAD = ['UpdatedAt', 'SessionId', 'Date', 'Time', 'Place', 'Exercise', 'Kind', 'Set', 'Reps', 'Weight', 'Minutes', 'AvgHR', 'Note', 'Distance', 'Source'];
var EX_HEAD = ['Exercise', 'Description', 'Kind', 'Rest'];
var PLACE_HEAD = ['Place', 'Color', 'Note'];
var PALETTE = ['#C8F169', '#7CC4F5', '#F5B461', '#C9A7F5', '#6FD3C0', '#F5A3C7', '#F28B82'];
// เดาหมวดจากชื่อ (ใช้เมื่อคอลัมน์ Kind ว่างเท่านั้น) — ต้องขึ้นต้นคำ: "run" ใน "crunch" / "cycl" ใน "bicycle crunch" ไม่นับ
var CARDIO_RE = /\b(treadmill|elliptical|swim|cycl|bike|biking|run|walk|rowing|stair)/i;
function guessKind_(name) {
  return CARDIO_RE.test(name) && !/lunge|crunch/i.test(name) ? 'cardio' : 'strength'; // walking lunge / ท่า crunch เป็นเวท
}
var SMALL_RE = /curl|raise|pushdown|push down|extension|fly|crunch|calf|kickback|shrug|face pull|pec deck|rear delt|wrist/i;
var PAGE_DEFAULT = 10;
var PAGE_MAX = 50;
var MAX_SETS = 30;
var SESSION_DAYS = 180; // อายุ session หลังเข้าสู่ระบบด้วย Google
var MAX_SESSIONS = 20; // จำนวนอุปกรณ์สูงสุดที่ล็อกอินค้างไว้ได้
var OP_TTL = 6 * 60 * 60; // วินาที — เก็บ opId กันบันทึกซ้ำตอน retry

/* ---------- entry points ---------- */

function doGet() {
  return json_({ ok: true, service: 'gymlog', v: 2 }); // v ใช้เช็กว่า deploy โค้ดเวอร์ชันล่าสุดแล้ว (ไม่มีข้อมูลใด ๆ)
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (body.action === 'login') return json_(loginAction_(body.args)); // ไม่ต้องมี token (ใช้ Google ID token แทน)
    if (!tokenOk_(body.token)) return json_({ ok: false, error: 'unauthorized' });
    var fn = ACTIONS_[body.action];
    if (!fn) return json_({ ok: false, error: 'unknown-action' });
    var args = Array.isArray(body.args) ? body.args : [];
    var data;
    if (WRITE_[body.action]) {
      data = withLock_(function () {
        var res = once_(body.opId, function () {
          return fn.apply(null, args);
        });
        PropertiesService.getScriptProperties().setProperty('VIEW_DIRTY', '1'); // ให้หน้า View อัปเดตในรอบถัดไป
        return res;
      });
    } else {
      data = fn.apply(null, args);
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

var ACTIONS_ = {
  bootstrap: bootstrap,
  sessions: sessions,
  last: last,
  saveExercise: saveExercise,
  deleteExercise: deleteExercise,
  saveMeta: saveMeta,
  addExercise: addExercise,
  addPlace: addPlace
};
var WRITE_ = { saveExercise: 1, deleteExercise: 1, saveMeta: 1, addExercise: 1, addPlace: 1 };

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) return {};
  try {
    var o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (x) {
    return {};
  }
}

/* ---------- ยืนยันตัวตน ----------
 * 1) เข้าสู่ระบบด้วย Google (แนะนำ): client ส่ง Google ID token มาที่ action "login" (เรียกได้โดยไม่ต้องมี token)
 *    เซิร์ฟเวอร์ตรวจกับ Google (aud = GOOGLE_CLIENT_ID, อีเมลยืนยันแล้ว, ตรงกับ ALLOWED_EMAIL หรือเจ้าของสคริปต์)
 *    แล้วออก "session token" อายุ SESSION_DAYS วัน — เก็บเฉพาะค่าแฮชไว้ใน Script Property SESSIONS
 * 2) API_TOKEN (เดิม): ยังใช้ได้ถ้ายังตั้งค่าไว้ — ลบ property นี้เพื่อปิด (disableLegacyToken)
 * ทุก action อื่นต้องมี token ที่ถูกต้องอย่างใดอย่างหนึ่ง ไม่งั้นตอบ unauthorized โดยไม่คืนข้อมูล
 */

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length < 2 ? '0' + v : v;
    })
    .join('');
}

function readSessions_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('SESSIONS');
    var o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

function sessionOk_(t) {
  if (typeof t !== 'string' || t.length < 32 || t.length > 200) return false;
  var s = readSessions_()[sha256Hex_(t)];
  return !!s && s.exp > Date.now();
}

function tokenOk_(t) {
  if (typeof t !== 'string' || !t) return false;
  var real = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (real && t.length === real.length) {
    var diff = 0; // เทียบแบบเวลาคงที่
    for (var i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ t.charCodeAt(i);
    if (diff === 0) return true;
  }
  return sessionOk_(t);
}

// ตรวจ Google ID token กับ Google (ตรวจลายเซ็น/อายุ) แล้วเช็ก aud, iss, อีเมลที่ยืนยันแล้ว
function verifyIdToken_(idToken, clientId) {
  if (typeof idToken !== 'string' || idToken.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) throw new Error('unauthorized');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('unauthorized');
  var info;
  try {
    info = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('unauthorized');
  }
  var issOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  var verified = info.email_verified === true || info.email_verified === 'true';
  var live = Number(info.exp) * 1000 > Date.now();
  if (info.aud !== clientId || !issOk || !verified || !live || !info.email) throw new Error('unauthorized');
  return info;
}

// แลก Google ID token เป็น session token (เรียกภายใน lock)
function login_(idToken) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('not-configured');
  var cache = CacheService.getScriptCache();
  var tries = Number(cache.get('login-tries') || 0);
  if (tries >= 10) throw new Error('too-many-attempts'); // กันยิงรัวจนโควตา UrlFetch หมด
  cache.put('login-tries', String(tries + 1), 600);

  var info = verifyIdToken_(idToken, clientId);
  var allowed = String(props.getProperty('ALLOWED_EMAIL') || Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!allowed) throw new Error('misconfigured: ALLOWED_EMAIL ว่าง'); // ไม่ปล่อยให้เทียบกับค่าว่าง
  if (String(info.email).toLowerCase() !== allowed) throw new Error('unauthorized');

  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var now = Date.now();
  var sessions = readSessions_();
  Object.keys(sessions).forEach(function (h) {
    if (sessions[h].exp <= now) delete sessions[h];
  });
  var keys = Object.keys(sessions).sort(function (a, b) {
    return sessions[a].created - sessions[b].created;
  });
  while (keys.length >= MAX_SESSIONS) delete sessions[keys.shift()]; // เก็บล่าสุดเท่านั้น
  var exp = now + SESSION_DAYS * 24 * 3600 * 1000;
  sessions[sha256Hex_(token)] = { exp: exp, created: now };
  props.setProperty('SESSIONS', JSON.stringify(sessions));
  cache.remove('login-tries');
  return { session: token, email: String(info.email), expires: exp };
}

function loginAction_(args) {
  try {
    var data = withLock_(function () {
      return login_(args && args[0]);
    });
    return { ok: true, data: data };
  } catch (err) {
    var m = String((err && err.message) || err);
    // ไม่บอกรายละเอียดว่าผิดตรงไหน (ยกเว้นยังไม่ตั้งค่า/ลองถี่เกินไป); ข้อผิดพลาดของระบบเอง (เช่น ไม่มีสิทธิ์ UrlFetch)
    // ตอบ login-error และบันทึกสาเหตุไว้ในหน้า Executions ของ Apps Script (เห็นเฉพาะเจ้าของ)
    if (m === 'not-configured' || m === 'too-many-attempts' || m === 'unauthorized') return { ok: false, error: m };
    console.error('login failed: ' + m);
    return { ok: false, error: 'login-error' };
  }
}

// ใช้ใน Apps Script editor: ยกเลิกทุกอุปกรณ์ที่เคยล็อกอินไว้ (ต้องล็อกอินใหม่)
function revokeSessions() {
  PropertiesService.getScriptProperties().deleteProperty('SESSIONS');
  Logger.log('ยกเลิกการล็อกอินทุกอุปกรณ์แล้ว');
}

// ใช้ใน Apps Script editor: ดูจำนวนอุปกรณ์ที่ล็อกอินอยู่ (ไม่แสดง token)
function listSessions() {
  var s = readSessions_();
  var lines = Object.keys(s).map(function (h) {
    return 'สร้าง ' + new Date(s[h].created).toISOString() + ' · หมดอายุ ' + new Date(s[h].exp).toISOString();
  });
  Logger.log(lines.length ? lines.join('\n') : 'ไม่มีการล็อกอินค้างอยู่');
}

// กันซ้ำ: opId เดิมที่เคยสำเร็จแล้ว ตอบ ok ซ้ำโดยไม่เขียนอีก (เรียกภายใน lock เท่านั้น)
function once_(opId, fn) {
  if (!opId) return fn();
  var cache = CacheService.getScriptCache();
  var key = 'op:' + String(opId).slice(0, 80);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var res = fn();
  cache.put(key, JSON.stringify(res === undefined ? null : res), OP_TTL);
  return res;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */

function tz_() {
  return SpreadsheetApp.getActive().getSpreadsheetTimeZone();
}

function ds_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v === null || v === undefined ? '' : v);
}

function ts_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  return String(v === null || v === undefined ? '' : v);
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(String(v).replace(',', '.'));
  return isNaN(n) || !isFinite(n) ? '' : n;
}

function str_(v, max) {
  return String(v === null || v === undefined ? '' : v).slice(0, max || 200);
}

// หาแท็บ ถ้าไม่มีสร้างพร้อมหัวตาราง (ไม่แตะแท็บที่มีอยู่แล้ว)
function ensureSheet_(name, head, textCols) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    (textCols || []).forEach(function (c) {
      sh.getRange(c).setNumberFormat('@');
    });
  }
  return sh;
}

function logSheet_() {
  return ensureSheet_(LOG_SHEET, HEAD, ['B:G', 'M:M', 'O:O']); // ข้อความล้วน กันชีตแปลงวันที่/สูตรเอง
}
function exSheet_() {
  return ensureSheet_(EX_SHEET, EX_HEAD, ['A:D']);
}
function placeSheet_() {
  return ensureSheet_(PLACE_SHEET, PLACE_HEAD, ['A:C']);
}

function readLog_() {
  var sh = logSheet_();
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, HEAD.length).getValues().map(function (r) {
    return {
      id: String(r[1]),
      date: ds_(r[2]),
      time: ts_(r[3]),
      gym: String(r[4] || ''),
      name: String(r[5]),
      kind: String(r[6]),
      set: Number(r[7]) || 0,
      reps: num_(r[8]),
      w: num_(r[9]),
      min: num_(r[10]),
      hr: num_(r[11]),
      note: String(r[12] || ''),
      dist: num_(r[13]),
      src: String(r[14] || '')
    };
  });
}

// ตรวจและทำความสะอาด meta ที่ client ส่งมา
function cleanMeta_(m) {
  m = m || {};
  var id = str_(m.id, 80).trim();
  var date = str_(m.date, 10);
  var time = str_(m.time, 5);
  if (!id) throw new Error('bad-meta-id');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad-meta-date');
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new Error('bad-meta-time');
  return { id: id, date: date, time: time, gym: str_(m.gym, 60).trim() };
}

// ตั้งฟอร์แมตข้อความล้วนในคอลัมน์ B..G และ M ของช่วงแถว กันค่าขึ้นต้น = + - @ ถูกตีเป็นสูตร
function textFormat_(sh, row, count) {
  sh.getRange(row, 2, count, 6).setNumberFormat('@'); // SessionId..Kind
  sh.getRange(row, 13, count, 1).setNumberFormat('@'); // Note
  sh.getRange(row, 15, count, 1).setNumberFormat('@'); // Source
}

/* ---------- รายชื่อท่า ---------- */

function defaultRest_(name, kind) {
  if (kind === 'cardio') return '';
  return SMALL_RE.test(name) ? '60–90 วินาที' : '~2 นาที';
}

function readExercises_(usage) {
  var sh = exSheet_();
  var n = sh.getLastRow();
  if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, 4).getValues(); // ข้ามแถวหัวตาราง
  var seen = {};
  var out = [];
  v.forEach(function (r) {
    var nm = String(r[0]).trim();
    if (!nm || nm === '-') return;
    var k = nm.toLowerCase();
    if (seen[k]) return;
    seen[k] = 1;
    var c = String(r[2] || '').toLowerCase();
    var kind = c === 'cardio' ? 'cardio' : c === 'strength' ? 'strength' : guessKind_(nm);
    out.push({ name: nm, desc: String(r[1] || '').trim(), kind: kind, rest: String(r[3] || '').trim(), n: usage[k] || 0 });
  });
  out.sort(function (a, b) {
    return b.n - a.n || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
  });
  return out;
}

// เพิ่มท่าใหม่ต่อท้าย Exercises เท่านั้น (ไม่แก้/ลบแถวเดิม)
function addExercise(name, kind) {
  name = str_(name, 80).trim();
  if (!name) return { ok: false };
  kind = kind === 'cardio' ? 'cardio' : 'strength';
  var sh = exSheet_();
  var n = sh.getLastRow();
  if (n > 1) {
    var names = sh.getRange(2, 1, n - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim().toLowerCase() === name.toLowerCase()) return { ok: true, existed: true };
    }
  }
  var row = sh.getRange(n + 1, 1, 1, 4);
  row.setNumberFormat('@');
  row.setValues([[name, '', kind, defaultRest_(name, kind)]]);
  return { ok: true };
}

/* ---------- สถานที่ ---------- */

function readPlaces_() {
  var sh = placeSheet_();
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 3).getValues().map(function (r) {
    return { name: String(r[0]).trim(), color: String(r[1] || '').trim(), note: String(r[2] || '') };
  }).filter(function (p) { return p.name; });
}

// เพิ่มสถานที่ต่อท้าย Places ถ้ายังไม่มี (สีใช้ตัวแรกในชุดที่ยังไม่ถูกใช้)
function addPlace(name) {
  name = str_(name, 60).trim();
  if (!name) return { ok: false };
  var places = readPlaces_();
  for (var i = 0; i < places.length; i++) {
    if (places[i].name.toLowerCase() === name.toLowerCase()) return { ok: true, existed: true, color: places[i].color };
  }
  var used = places.map(function (p) { return p.color; });
  var color = PALETTE.filter(function (c) { return used.indexOf(c) < 0; })[0] || PALETTE[places.length % PALETTE.length];
  var sh = placeSheet_();
  var row = sh.getRange(sh.getLastRow() + 1, 1, 1, 3);
  row.setNumberFormat('@');
  row.setValues([[name, color, '']]);
  return { ok: true, color: color };
}

/* ---------- รวมแถว Log เป็นเซสชัน ---------- */

function buildSessions_(rows) {
  var map = {};
  var list = [];
  var usage = {};
  var gymCount = {};

  rows.forEach(function (r) {
    var s = map[r.id];
    if (!s) {
      s = map[r.id] = { id: r.id, date: r.date, time: r.time, gym: r.gym, items: [], ix: {} };
      list.push(s);
      if (r.gym) gymCount[r.gym] = (gymCount[r.gym] || 0) + 1;
    }
    var nk = r.name.toLowerCase();
    var it = s.ix[nk];
    if (!it) {
      it = s.ix[nk] = { name: r.name, kind: r.kind, sets: [], min: '', hr: '', dist: '', note: '' };
      s.items.push(it);
      usage[nk] = (usage[nk] || 0) + 1;
    }
    if (r.note) it.note = r.note;
    if (r.kind === 'cardio') {
      it.min = r.min;
      it.hr = r.hr;
      it.dist = r.dist;
    } else if (r.reps !== '' || r.w !== '') {
      it.sets[Math.max(0, r.set - 1)] = { r: r.reps, w: r.w };
    }
  });

  list.forEach(function (s) {
    s.items.forEach(function (it) {
      for (var i = 0; i < it.sets.length; i++) if (!it.sets[i]) it.sets[i] = { r: '', w: '' };
    });
  });

  list.sort(function (a, b) {
    var x = a.date + ' ' + a.time;
    var y = b.date + ' ' + b.time;
    return x < y ? 1 : x > y ? -1 : a.id < b.id ? 1 : -1;
  });

  var gyms = Object.keys(gymCount)
    .map(function (g) {
      return { name: g, n: gymCount[g] };
    })
    .sort(function (a, b) {
      return b.n - a.n || (a.name < b.name ? -1 : 1);
    });

  return { list: list, usage: usage, gyms: gyms };
}

// รวมสถานที่จากแท็บ Places (แม้ยังไม่เคยใช้) กับที่พบใน Log พร้อมจำนวนครั้งและสี
function mergeGyms_(counted) {
  var byName = {};
  var out = [];
  readPlaces_().forEach(function (p) {
    var o = { name: p.name, n: 0, color: p.color };
    byName[p.name] = o;
    out.push(o);
  });
  counted.forEach(function (g) {
    if (byName[g.name]) byName[g.name].n = g.n;
    else out.push({ name: g.name, n: g.n, color: '' });
  });
  return out.sort(function (a, b) {
    return b.n - a.n || (a.name < b.name ? -1 : 1);
  });
}

function pickSessions_(list, offset, limit) {
  return list.slice(offset, offset + limit).map(function (s) {
    return { id: s.id, date: s.date, time: s.time, gym: s.gym, items: s.items };
  });
}

function clampInt_(v, def, min, max) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = def;
  return Math.max(min, Math.min(max, n));
}

/* ---------- actions: อ่าน ---------- */

function bootstrap() {
  var b = buildSessions_(readLog_());
  var sh = logSheet_();
  var url = SpreadsheetApp.getActive().getUrl();
  var gid = sh.getSheetId();
  return {
    exercises: readExercises_(b.usage),
    gyms: mergeGyms_(b.gyms),
    lastGym: b.list.length ? b.list[0].gym : '',
    sheetUrl: url,
    gid: gid,
    logUrl: url + '#gid=' + gid,
    total: b.list.length,
    sessions: pickSessions_(b.list, 0, PAGE_DEFAULT)
  };
}

function sessions(offset, limit) {
  var b = buildSessions_(readLog_());
  var o = clampInt_(offset, 0, 0, 1e9);
  var l = clampInt_(limit, PAGE_DEFAULT, 1, PAGE_MAX);
  return { total: b.list.length, offset: o, sessions: pickSessions_(b.list, o, l) };
}

function last(name, excludeId) {
  var key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  var rows = readLog_().filter(function (r) {
    return r.name.toLowerCase() === key && r.kind !== 'cardio' && r.id !== excludeId && (r.reps !== '' || r.w !== '');
  });
  if (rows.length) {
    var best = rows[0];
    rows.forEach(function (r) {
      if (r.date + ' ' + r.time > best.date + ' ' + best.time) best = r;
    });
    var sets = rows
      .filter(function (r) {
        return r.id === best.id;
      })
      .sort(function (a, b) {
        return a.set - b.set;
      })
      .map(function (r) {
        return { r: r.reps, w: r.w };
      });
    return { date: best.date, sets: sets };
  }
  return null;
}

/* ---------- actions: เขียน (เรียกภายใน lock) ---------- */

function removeRows_(sh, id, name) {
  var n = sh.getLastRow();
  if (n < 2) return;
  var v = sh.getRange(2, 2, n - 1, 5).getValues(); // คอลัมน์ B..F
  var key = String(name).toLowerCase();
  var idx = [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) === String(id) && String(v[i][4]).toLowerCase() === key) idx.push(i + 2);
  }
  var j = idx.length - 1;
  while (j >= 0) {
    var end = idx[j];
    var start = end;
    while (j > 0 && idx[j - 1] === start - 1) {
      j--;
      start = idx[j];
    }
    sh.deleteRows(start, end - start + 1);
    j--;
  }
}

function buildRows_(meta, ex) {
  var now = new Date();
  var rows = [];
  var name = str_(ex.name, 80).trim();
  var kind = ex.kind === 'cardio' ? 'cardio' : 'strength';
  var note = str_(ex.note, 2000);
  function base(set, reps, w, min, hr) {
    return [now, meta.id, meta.date, meta.time, meta.gym, name, kind, set, reps, w, min, hr, note, '', ''];
  }
  if (kind === 'cardio') {
    var m = num_(ex.min);
    var h = num_(ex.hr);
    if (m !== '' || h !== '' || note) rows.push(base(1, '', '', m, h));
  } else {
    (ex.sets || []).slice(0, MAX_SETS).forEach(function (s, i) {
      var r = num_(s && s.r);
      var w = num_(s && s.w);
      if (r !== '' || w !== '') rows.push(base(i + 1, r, w, '', ''));
    });
    if (!rows.length && note) rows.push(base(1, '', '', '', ''));
  }
  return rows;
}

// แทนที่ข้อมูลของท่านี้ในเซสชันนี้ทั้งหมด (ว่างทั้งหมด = ลบ)
function saveExercise(meta, ex) {
  meta = cleanMeta_(meta);
  ex = ex || {};
  var name = str_(ex.name, 80).trim();
  if (!name) throw new Error('bad-exercise');
  var sh = logSheet_();
  removeRows_(sh, meta.id, name);
  var rows = buildRows_(meta, ex);
  if (rows.length) {
    var start = sh.getLastRow() + 1;
    textFormat_(sh, start, rows.length);
    sh.getRange(start, 1, rows.length, HEAD.length).setValues(rows);
    if (meta.gym) addPlace(meta.gym);
  }
  return { ok: true, rows: rows.length };
}

function deleteExercise(sessionId, name) {
  removeRows_(logSheet_(), str_(sessionId, 80), str_(name, 80));
  return { ok: true };
}

// เปลี่ยนวันที่/เวลา/สถานที่ของเซสชันที่บันทึกไปแล้ว (อัปเดตทุกแถวของเซสชัน)
function saveMeta(meta) {
  meta = cleanMeta_(meta);
  var sh = logSheet_();
  var n = sh.getLastRow();
  if (n < 2) return { ok: true, rows: 0 };
  var rng = sh.getRange(2, 2, n - 1, 4); // B..E = SessionId, Date, Time, Place
  var v = rng.getValues();
  var hit = 0;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) === meta.id) {
      v[i][1] = meta.date;
      v[i][2] = meta.time;
      v[i][3] = meta.gym;
      hit++;
    }
  }
  if (hit) {
    rng.setNumberFormat('@');
    rng.setValues(v);
    if (meta.gym) addPlace(meta.gym);
  }
  return { ok: true, rows: hit };
}
