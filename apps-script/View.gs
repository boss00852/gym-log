/**
 * แท็บ "View" — หน้าสำหรับ "อ่านด้วยตา" สร้างอัตโนมัติจากแท็บ Log (แก้ที่นี่ไม่ได้ผล จะถูกเขียนทับ; แก้ข้อมูลที่ Log หรือในแอป)
 *
 * 1 แถวต่อ 1 ท่าในเซสชันหนึ่ง เรียงใหม่สุดก่อน:
 *   วันที่ (dd-MM-yyyy พ.ศ.) | เวลา | สถานที่ | ท่า | Set 1 … Set N (รูปแบบ reps×kg เช่น 13×38) | Reps รวม | โน้ต
 *   คาร์ดิโอ: "30 นาที" | "HR 130" | "1.9 กม." อยู่ในช่อง Set 1–3
 * วันที่/เวลา/สถานที่แสดงเฉพาะแถวแรกของเซสชัน; สลับสีพื้นหลังทีละเซสชันให้แยกวันง่าย
 *
 * ฟังก์ชันที่ใช้:
 *   rebuildView()          สร้างหน้า View ใหม่ทันที (ใช้ได้จากเมนู "Gym Log" ตอนเปิดชีต)
 *   installViewTrigger()   ตั้งให้อัปเดตเองทุก 5 นาทีเมื่อมีการบันทึกใหม่ (รันครั้งเดียว)
 *   removeViewTrigger()    เลิกอัปเดตอัตโนมัติ
 */
var VIEW_SHEET = 'View';
var VIEW_MIN_SETS = 6;
var VIEW_MAX_SETS = 12;
var VIEW_TITLE = 'หน้าอ่านอย่างเดียว — สร้างอัตโนมัติจากแท็บ Log (แก้ที่นี่จะถูกเขียนทับ)';

function beDate_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? m[3] + '-' + m[2] + '-' + (Number(m[1]) + 543) : String(iso);
}

function viewSetText_(s) {
  if (!s || (s.r === '' && s.w === '')) return '';
  if (s.w === '') return String(s.r);
  if (s.r === '') return '–×' + s.w;
  return s.r + '×' + s.w;
}

// ตาราง View จากรายการเซสชัน (ฟังก์ชันล้วน ไม่แตะชีต): { head, rows, band }
function viewTable_(sessions) {
  var nSets = VIEW_MIN_SETS;
  sessions.forEach(function (s) {
    s.items.forEach(function (it) {
      if (it.kind !== 'cardio') nSets = Math.max(nSets, Math.min(it.sets.length, VIEW_MAX_SETS));
    });
  });
  var head = ['วันที่', 'เวลา', 'สถานที่', 'ท่า'];
  for (var i = 1; i <= nSets; i++) head.push('Set ' + i);
  head.push('Reps รวม', 'โน้ต');
  var rows = [];
  var band = [];
  sessions.forEach(function (s, si) {
    s.items.forEach(function (it, ii) {
      var row = [ii === 0 ? beDate_(s.date) : '', ii === 0 ? s.time : '', ii === 0 ? s.gym : '', it.name];
      var cells = [];
      var total = '';
      if (it.kind === 'cardio') {
        // ตำแหน่งคงที่: Set 1 = เวลา, Set 2 = HR, Set 3 = ระยะทาง
        cells.push(it.min !== '' ? it.min + ' นาที' : '');
        cells.push(it.hr !== '' ? 'HR ' + it.hr : '');
        cells.push(it.dist !== '' && it.dist !== undefined ? it.dist + ' กม.' : '');
      } else {
        var sum = 0;
        var any = false;
        it.sets.slice(0, nSets).forEach(function (st) {
          cells.push(viewSetText_(st));
        });
        it.sets.forEach(function (st) {
          if (st.r !== '' && !isNaN(Number(st.r))) {
            sum += Number(st.r);
            any = true;
          }
        });
        total = any ? sum : '';
        if (it.sets.length > nSets) cells[nSets - 1] += ' …'; // เซ็ตเกินคอลัมน์ที่แสดง ดูครบที่แท็บ Log
      }
      while (cells.length < nSets) cells.push('');
      row = row.concat(cells, [total, it.note || '']);
      rows.push(row);
      band.push(si % 2);
    });
  });
  return { head: head, rows: rows, band: band };
}

function rebuildView() {
  return withLock_(function () {
    var b = buildSessions_(readLog_());
    var t = viewTable_(b.list);
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(VIEW_SHEET) || ss.insertSheet(VIEW_SHEET);
    sh.clear();
    var cols = t.head.length;

    sh.getRange(1, 1).setValue(VIEW_TITLE);
    sh.getRange(1, 1, 1, cols).setFontColor('#9CA6B2').setFontStyle('italic');
    sh.getRange(2, 1, 1, cols).setValues([t.head]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1C2128').setHorizontalAlignment('center');
    sh.setFrozenRows(2);

    if (t.rows.length) {
      // ข้อความล้วนทุกคอลัมน์ ยกเว้น Reps รวม: วันที่/เวลาแสดงตามที่เห็น และค่าจาก Log ที่ขึ้นต้นด้วย = ไม่ถูกตีเป็นสูตร
      sh.getRange(3, 1, t.rows.length, cols - 2).setNumberFormat('@');
      sh.getRange(3, cols, t.rows.length, 1).setNumberFormat('@');
      sh.getRange(3, 1, t.rows.length, cols).setValues(t.rows);
      sh.getRange(3, 1, t.rows.length, cols).setBackgrounds(
        t.band.map(function (k) {
          var c = k ? '#EEF2F6' : '#FFFFFF';
          var r = [];
          for (var i = 0; i < cols; i++) r.push(c);
          return r;
        })
      );
      sh.getRange(3, 5, t.rows.length, cols - 6).setHorizontalAlignment('center'); // Set 1..N
      sh.getRange(3, cols - 1, t.rows.length, 1).setHorizontalAlignment('center'); // Reps รวม
    }

    sh.setColumnWidth(1, 95);
    sh.setColumnWidth(2, 55);
    sh.setColumnWidth(3, 110);
    sh.setColumnWidth(4, 260);
    for (var c = 5; c < cols - 1; c++) sh.setColumnWidth(c, 72);
    sh.setColumnWidth(cols - 1, 80);
    sh.setColumnWidth(cols, 240);

    sh.protect().setWarningOnly(true); // เตือนเมื่อพยายามแก้ แต่ไม่ล็อก
    PropertiesService.getScriptProperties().setProperty('VIEW_DIRTY', '0');
    return { rows: t.rows.length, sessions: b.list.length };
  });
}

// ถูกเรียกโดยตัวตั้งเวลา: สร้างใหม่เฉพาะเมื่อมีการบันทึกตั้งแต่รอบก่อน
function refreshViewIfDirty() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('VIEW_DIRTY') !== '1') return { skipped: true };
  props.setProperty('VIEW_DIRTY', '0'); // ถ้ามีการบันทึกระหว่างสร้าง จะถูกตั้งเป็น 1 อีกครั้งโดยการเขียน
  try {
    return rebuildView();
  } catch (e) {
    props.setProperty('VIEW_DIRTY', '1');
    throw e;
  }
}

function removeViewTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshViewIfDirty') ScriptApp.deleteTrigger(t);
  });
}

function installViewTrigger() {
  removeViewTrigger();
  ScriptApp.newTrigger('refreshViewIfDirty').timeBased().everyMinutes(5).create();
  PropertiesService.getScriptProperties().setProperty('VIEW_DIRTY', '1');
  Logger.log('ตั้งให้หน้า View อัปเดตเองทุก 5 นาทีเมื่อมีการบันทึกใหม่แล้ว');
}

// เมนู "Gym Log" ในชีต
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gym Log').addItem('อัปเดตหน้า View ตอนนี้', 'rebuildView').addToUi();
}
