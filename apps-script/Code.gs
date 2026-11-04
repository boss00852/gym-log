/**
 * Gym Log — Google Apps Script JSON API (Web App)
 * ผูกกับสเปรดชีตของ Boss (container-bound)
 *
 * - แท็บ "Log"  : 1 แถวต่อ 1 เซ็ต (แหล่งข้อมูลจริง)
 * - แท็บ "REF"  : A = ชื่อท่า, B = คำอธิบายท่า, C = kind (strength/cardio) — เพิ่มท่าใหม่ต่อท้ายเท่านั้น
 * - ชีตเก่า '64'–'69' : อ่านอย่างเดียว ใช้หา "ฝึกล่าสุด" (ห้ามเขียน)
 *
 * Endpoint เดียว: doPost(e)  body = JSON {token, action, args, opId} (ส่งเป็น text/plain)
 * ตอบ {ok:true, data} หรือ {ok:false, error}
 * ความปลอดภัย: Script Property "API_TOKEN" (ไม่ตรง = unauthorized และไม่คืนข้อมูลใด ๆ)
 */

var LOG_SHEET = 'Log';
var REF_SHEET = 'REF';
var OLD_SHEETS = ['69', '68', '67', '66', '65', '64'];
var HEAD = ['UpdatedAt', 'SessionId', 'Date', 'Time', 'Gym', 'Exercise', 'Kind', 'Set', 'Reps', 'Weight', 'Minutes', 'AvgHR', 'Note'];
var CARDIO_RE = /treadmill|elliptical|swim|cycl|bike|run|walk|rowing|stair/i;
var PAGE_DEFAULT = 10;
var PAGE_MAX = 50;
var MAX_SETS = 30;
var OP_TTL = 6 * 60 * 60; // วินาที — เก็บ opId กันบันทึกซ้ำตอน retry

/* ---------- entry points ---------- */

function doGet() {
  return json_({ ok: true, service: 'gymlog' });
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!tokenOk_(body.token)) return json_({ ok: false, error: 'unauthorized' });
    var fn = ACTIONS_[body.action];
    if (!fn) return json_({ ok: false, error: 'unknown-action' });
    var args = Array.isArray(body.args) ? body.args : [];
    var data;
    if (WRITE_[body.action]) {
      data = withLock_(function () {
        return once_(body.opId, function () {
          return fn.apply(null, args);
        });
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
  addExercise: addExercise
};
var WRITE_ = { saveExercise: 1, deleteExercise: 1, saveMeta: 1, addExercise: 1 };

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

function tokenOk_(t) {
  var real = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!real || typeof t !== 'string' || t.length !== real.length) return false;
  var diff = 0; // เทียบแบบเวลาคงที่
  for (var i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ t.charCodeAt(i);
  return diff === 0;
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

function logSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
    sh.setFrozenRows(1);
    sh.getRange('C:D').setNumberFormat('@'); // วันที่/เวลาเป็นข้อความ กันชีตแปลงเอง
  }
  return sh;
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
      note: String(r[12] || '')
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
}

/* ---------- รายชื่อท่า ---------- */

function readExercises_(usage) {
  var sh = SpreadsheetApp.getActive().getSheetByName(REF_SHEET);
  if (!sh) return [];
  var n = sh.getLastRow();
  if (!n) return [];
  var v = sh.getRange(1, 1, n, 3).getValues();
  var seen = {};
  var out = [];
  v.forEach(function (r) {
    var nm = String(r[0]).trim();
    if (!nm || nm === '-') return;
    var k = nm.toLowerCase();
    if (seen[k]) return;
    seen[k] = 1;
    var c = String(r[2] || '').toLowerCase();
    var kind = c === 'cardio' ? 'cardio' : c === 'strength' ? 'strength' : CARDIO_RE.test(nm) ? 'cardio' : 'strength';
    out.push({ name: nm, desc: String(r[1] || '').trim(), kind: kind, n: usage[k] || 0 });
  });
  out.sort(function (a, b) {
    return b.n - a.n || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
  });
  return out;
}

// เพิ่มท่าใหม่ต่อท้าย REF เท่านั้น (ไม่แก้/ลบแถวเดิม)
function addExercise(name, kind) {
  name = str_(name, 80).trim();
  if (!name) return { ok: false };
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(REF_SHEET) || ss.insertSheet(REF_SHEET);
  var n = sh.getLastRow();
  if (n) {
    var names = sh.getRange(1, 1, n, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim().toLowerCase() === name.toLowerCase()) return { ok: true, existed: true };
    }
  }
  var row = sh.getRange(n + 1, 1, 1, 3);
  row.setNumberFormat('@');
  row.setValues([[name, '', kind === 'cardio' ? 'cardio' : 'strength']]);
  return { ok: true };
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
      it = s.ix[nk] = { name: r.name, kind: r.kind, sets: [], min: '', hr: '', note: '' };
      s.items.push(it);
      usage[nk] = (usage[nk] || 0) + 1;
    }
    if (r.note) it.note = r.note;
    if (r.kind === 'cardio') {
      it.min = r.min;
      it.hr = r.hr;
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
    gyms: b.gyms,
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
  return oldLast_(key);
}

// ชีตเก่า (อ่านอย่างเดียว): แถวชื่อท่า = จำนวนครั้ง (D:I), แถวถัดไป = น้ำหนัก, วันที่อยู่คอลัมน์ A ของแถวบน ๆ
function oldLast_(key) {
  var ss = SpreadsheetApp.getActive();
  for (var s = 0; s < OLD_SHEETS.length; s++) {
    var sh = ss.getSheetByName(OLD_SHEETS[s]);
    if (!sh) continue;
    var n = sh.getLastRow();
    if (n < 2) continue;
    var v = sh.getRange(1, 1, n, 9).getValues();
    for (var i = n - 2; i >= 0; i--) {
      if (String(v[i][1]).trim().toLowerCase() !== key) continue;
      var reps = v[i].slice(3, 9);
      var wts = v[i + 1].slice(3, 9);
      var sets = [];
      var prev = '';
      for (var k = 0; k < 6; k++) {
        var r = num_(reps[k]);
        if (r === '') continue;
        var w = num_(wts[k]);
        if (w === '') w = prev;
        prev = w;
        sets.push({ r: r, w: w });
      }
      if (!sets.length) continue;
      var date = '';
      for (var j = i; j >= 0; j--) {
        if (v[j][0] !== '' && v[j][0] !== null) {
          date = ds_(v[j][0]);
          break;
        }
      }
      return { date: date, sets: sets };
    }
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
    return [now, meta.id, meta.date, meta.time, meta.gym, name, kind, set, reps, w, min, hr, note];
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
  var rng = sh.getRange(2, 2, n - 1, 4); // B..E = SessionId, Date, Time, Gym
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
  }
  return { ok: true, rows: hit };
}
