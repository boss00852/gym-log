/**
 * ย้ายข้อมูลจากสเปรดชีตเก่า (ชีต '64'–'69' + แท็บ REF) เข้าสเปรดชีตใหม่ — รันครั้งเดียวจากตัวแก้ไข Apps Script
 *
 * ก่อนรัน: Project Settings → Script Properties → เพิ่ม OLD_BOOK_ID = ID ของสเปรดชีตเก่า
 *          (ส่วนระหว่าง /d/ กับ /edit ใน URL) — ไม่ฝัง ID ไว้ในโค้ด
 *
 * ฟังก์ชันที่รันได้:
 *   migrateDryRun()   ลองอ่านและสรุปให้ดู ไม่เขียนข้อมูลใด ๆ (รันอันนี้ก่อน)
 *   migrateAll()      ย้ายจริง (ข้ามชีตที่เคยย้ายแล้ว รันซ้ำได้ ไม่ซ้ำข้อมูล)
 *   clearMigrated()   ลบเฉพาะแถวใน Log ที่ย้ายมา (คอลัมน์ Source ไม่ว่าง) เผื่อต้องย้ายใหม่
 *
 * ไฟล์เก่าถูก "อ่านอย่างเดียว" ตลอด — ไม่มีการเขียน/แก้/ลบอะไรในนั้น
 *
 * รูปแบบชีตเก่า: แถวชื่อท่า = A วันที่ (เฉพาะแถวแรกของวัน), B ท่า, C เวลา (นาที, คาร์ดิโอ), D:I Reps เซ็ต 1–6,
 *               J ระยะทาง, K โน้ต; แถวถัดไป = D:I น้ำหนักของแต่ละเซ็ต
 * ผลลัพธ์: 1 แถวต่อเซ็ตใน Log, 1 วัน = 1 เซสชัน (SessionId = m<ชีต>-<yyyymmdd>), ไม่ระบุสถานที่และเวลา, Source = ชื่อชีตเก่า
 */

var MIGRATE_SHEETS = ['64', '65', '66', '67', '68', '69'];
var OLD_SHEET_COLS = 11; // A..K

/* ---------- แปลงวันที่แบบเก่า (d/M/yy, d/M/yyyy หรือ Date) เป็น yyyy-MM-dd ---------- */
function parseOldDate_(v) {
  if (v instanceof Date) return ds_(v);
  var m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\s*$/.exec(String(v));
  if (!m) return null;
  var d = +m[1], mo = +m[2], y = +m[3];
  if (m[3].length === 2) y += 2000;
  var t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
}

/**
 * แปลงค่าทั้งชีตเก่าเป็นรายการเซสชัน (ฟังก์ชันล้วน ไม่แตะชีต)
 * คืน { sessions: [{id,date,items:[{name,kind,sets:[{set,r,w}],min,dist,note}]}], warnings: [], skipped: n }
 */
function parseOldSheet_(v, sheetName) {
  var sessions = [];
  var byId = {};
  var warnings = [];
  var skipped = 0;
  var date = null;

  for (var i = 0; i < v.length; i++) {
    var row = v[i] || [];
    if (row[0] !== '' && row[0] !== null && row[0] !== undefined) {
      date = parseOldDate_(row[0]);
      if (!date) warnings.push(sheetName + ' แถว ' + (i + 1) + ': อ่านวันที่ไม่ได้ "' + row[0] + '"');
    }
    var name = String(row[1] === undefined || row[1] === null ? '' : row[1]).trim();
    if (!name || name.toUpperCase() === 'ACTIVITY') continue;

    var reps = [];
    for (var k = 3; k < 9; k++) reps.push(num_(row[k]));
    var hasReps = reps.some(function (x) { return x !== ''; });
    var minutes = num_(row[2]);

    if (!hasReps && minutes === '' && num_(row[9]) === '') {
      skipped++; // ชื่อท่าแต่ไม่มีข้อมูล
      continue;
    }
    if (!date) {
      warnings.push(sheetName + ' แถว ' + (i + 1) + ': ข้ามท่า "' + name + '" เพราะไม่มีวันที่');
      skipped++;
      continue;
    }

    var id = 'm' + sheetName + '-' + date.replace(/-/g, '');
    var s = byId[id];
    if (!s) {
      s = byId[id] = { id: id, date: date, items: [], ix: {} };
      sessions.push(s);
    }
    var note = String(row[10] === undefined || row[10] === null ? '' : row[10]).trim();
    var item;

    if (!hasReps) {
      // คาร์ดิโอ: นาที (C) + ระยะทาง (J) + โน้ต (K)
      item = { name: name, kind: 'cardio', sets: [], min: minutes, dist: num_(row[9]), note: note };
    } else {
      var wrow = v[i + 1] || [];
      var nextName = String(wrow[1] === undefined || wrow[1] === null ? '' : wrow[1]).trim();
      if (nextName) wrow = []; // แถวถัดไปเป็นท่าอื่น = ไม่มีแถวน้ำหนัก
      var sets = [];
      var prev = '';
      for (var j = 0; j < 6; j++) {
        if (reps[j] === '') continue;
        var w = num_(wrow[3 + j]);
        if (w === '') w = prev; // น้ำหนักว่าง = ใช้ค่าเซ็ตก่อนหน้า (เหมือนที่แอปเดิมทำ)
        prev = w;
        sets.push({ set: j + 1, r: reps[j], w: w });
      }
      item = { name: name, kind: 'strength', sets: sets, min: '', dist: '', note: note };
    }

    var key = name.toLowerCase();
    var ex = s.ix[key];
    if (!ex) {
      s.ix[key] = item;
      s.items.push(item);
    } else if (item.kind === 'cardio' && ex.kind === 'cardio') {
      // ทำคาร์ดิโอท่าเดียวกันซ้ำในวันเดียว: รวมเวลา/ระยะทาง
      ex.min = (ex.min === '' ? 0 : ex.min) + (item.min === '' ? 0 : item.min);
      if (item.dist !== '') ex.dist = (ex.dist === '' ? 0 : ex.dist) + item.dist;
      if (item.note) ex.note = ex.note ? ex.note + ' | ' + item.note : item.note;
    } else if (item.kind === 'strength' && ex.kind === 'strength') {
      // ท่าเดียวกันซ้ำในวันเดียว: ต่อเลขเซ็ตท้ายของเดิม
      var base = ex.sets.length ? ex.sets[ex.sets.length - 1].set : 0;
      item.sets.forEach(function (st, n2) {
        ex.sets.push({ set: base + n2 + 1, r: st.r, w: st.w });
      });
      if (item.note) ex.note = ex.note ? ex.note + ' | ' + item.note : item.note;
    } else {
      warnings.push(sheetName + ' แถว ' + (i + 1) + ': "' + name + '" ซ้ำในวันเดียวกันแต่คนละชนิด (ข้ามแถวนี้)');
      skipped++;
    }
  }
  sessions.forEach(function (s) { delete s.ix; });
  return { sessions: sessions, warnings: warnings, skipped: skipped };
}

/* ---------- ประกอบแถว Log จากเซสชันที่แปลงแล้ว ---------- */
function oldRows_(parsed, sheetName, canon, now) {
  var rows = [];
  parsed.sessions.forEach(function (s) {
    s.items.forEach(function (it) {
      var nm = canon(it.name, it.kind);
      if (it.kind === 'cardio') {
        rows.push([now, s.id, s.date, '', '', nm, 'cardio', 1, '', '', it.min, '', it.note, it.dist, sheetName]);
      } else {
        it.sets.forEach(function (st, idx) {
          rows.push([now, s.id, s.date, '', '', nm, 'strength', st.set, st.r, st.w, '', '', it.note, '', sheetName]);
        });
      }
    });
  });
  return rows;
}

/* ---------- เปิดไฟล์เก่า (อ่านอย่างเดียว) ---------- */
function oldBook_() {
  var id = PropertiesService.getScriptProperties().getProperty('OLD_BOOK_ID');
  if (!id) throw new Error('ยังไม่ได้ตั้ง Script Property OLD_BOOK_ID');
  return SpreadsheetApp.openById(id);
}

// นำเข้ารายชื่อท่าจาก REF เดิมถ้า Exercises ยังว่าง (เหลือแต่หัวตาราง)
function importOldExercises_(old, report) {
  var sh = exSheet_();
  if (sh.getLastRow() > 1) return;
  var ref = old.getSheetByName('REF');
  if (!ref || ref.getLastRow() < 1) return;
  var v = ref.getRange(1, 1, ref.getLastRow(), 3).getValues();
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
    out.push([nm, String(r[1] || '').trim(), kind, defaultRest_(nm, kind)]);
  });
  if (out.length) {
    var rng = sh.getRange(2, 1, out.length, 4);
    rng.setNumberFormat('@');
    rng.setValues(out);
  }
  report.exercisesImported = out.length;
}

function migrate_(dry) {
  return withLock_(function () {
    var old = oldBook_();
    var report = { dry: !!dry, sheets: {}, exercisesImported: 0, exercisesAdded: [], warnings: [], rows: 0 };
    var log = logSheet_();
    placeSheet_(); // สร้างแท็บ Places (ว่าง) ให้พร้อมใช้
    if (!dry) importOldExercises_(old, report);

    // ชื่อท่ามาตรฐาน (ตัวพิมพ์ตาม Exercises); ท่าที่ไม่มีจะถูกเติมให้
    var canonMap = {};
    readExercises_({}).forEach(function (e) { canonMap[e.name.toLowerCase()] = e.name; });
    if (dry && !Object.keys(canonMap).length) {
      var ref = old.getSheetByName('REF');
      if (ref && ref.getLastRow()) ref.getRange(1, 1, ref.getLastRow(), 1).getValues().forEach(function (r) {
        var nm = String(r[0]).trim();
        if (nm && nm !== '-') canonMap[nm.toLowerCase()] = nm;
      });
    }
    var newEx = {};
    function canon(name, kind) {
      var k = name.toLowerCase();
      if (canonMap[k]) return canonMap[k];
      canonMap[k] = name;
      newEx[k] = { name: name, kind: kind };
      return name;
    }

    // ชีตที่เคยย้ายแล้ว (ดูจาก Source ใน Log)
    var done = {};
    readLog_().forEach(function (r) { if (r.src) done[r.src] = 1; });

    var now = new Date();
    var allRows = [];
    MIGRATE_SHEETS.forEach(function (name) {
      var sh = old.getSheetByName(name);
      if (!sh) { report.sheets[name] = 'ไม่พบชีต'; return; }
      if (done[name]) { report.sheets[name] = 'ข้าม (เคยย้ายแล้ว)'; return; }
      var n = sh.getLastRow();
      var values = n ? sh.getRange(1, 1, n, OLD_SHEET_COLS).getValues() : [];
      var parsed = parseOldSheet_(values, name);
      var rows = oldRows_(parsed, name, canon, now);
      report.sheets[name] = { sessions: parsed.sessions.length, rows: rows.length, skipped: parsed.skipped };
      report.warnings = report.warnings.concat(parsed.warnings);
      allRows = allRows.concat(rows);
    });
    report.rows = allRows.length;
    report.exercisesAdded = Object.keys(newEx).map(function (k) { return newEx[k].name; });

    if (!dry) {
      var CH = 500;
      for (var i = 0; i < allRows.length; i += CH) {
        var part = allRows.slice(i, i + CH);
        var start = log.getLastRow() + 1;
        textFormat_(log, start, part.length);
        log.getRange(start, 1, part.length, HEAD.length).setValues(part);
      }
      var ex = exSheet_();
      Object.keys(newEx).forEach(function (k) {
        var r = ex.getRange(ex.getLastRow() + 1, 1, 1, 4);
        r.setNumberFormat('@');
        r.setValues([[newEx[k].name, '', newEx[k].kind, defaultRest_(newEx[k].name, newEx[k].kind)]]);
      });
    }
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  });
}

function migrateDryRun() {
  return migrate_(true);
}

function migrateAll() {
  return migrate_(false);
}

// ลบเฉพาะแถวที่ย้ายมา (Source ไม่ว่าง) — แถวที่แอปบันทึกเองไม่ถูกแตะ
function clearMigrated() {
  return withLock_(function () {
    var sh = logSheet_();
    var n = sh.getLastRow();
    if (n < 2) return { removed: 0 };
    var src = sh.getRange(2, 15, n - 1, 1).getValues();
    var idx = [];
    for (var i = 0; i < src.length; i++) if (String(src[i][0]) !== '') idx.push(i + 2);
    var removed = idx.length;
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
    Logger.log('removed ' + removed);
    return { removed: removed };
  });
}
