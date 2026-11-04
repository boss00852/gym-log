// แผ่นล่าง: แก้วัน/เวลา/สถานที่ (04), เลือก/เพิ่มสถานที่ (05), เพิ่มท่า (06,07)
import { isoToBE, parseBE, parseTime } from './date.js';
import { gymColor } from './gyms.js';

function openModal(app, { tall = false } = {}) {
  const { h, doc } = app;
  const sheet = h('div', { class: 'sheet' + (tall ? ' tall' : '') });
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [sheet]);
  let onClose = null;
  const close = () => {
    if (onClose) onClose();
    modal.remove();
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  doc.body.appendChild(modal);
  return { sheet, modal, close, onClose: (f) => { onClose = f; } };
}

/* ---------- 04: แก้ วัน · เวลา · สถานที่ ---------- */
export function openMetaSheet(app) {
  const { h } = app;
  const m = openModal(app);
  const s = m.sheet;
  const cur = app.cur;
  const prevGym = cur.gym;

  const dateIn = h('input', { class: 'in', id: 'f-date', inputmode: 'numeric', autocomplete: 'off', value: isoToBE(cur.date), 'aria-label': 'วันที่ (วัน-เดือน-ปี พ.ศ.)' });
  const timeIn = h('input', { class: 'in', id: 'f-time', inputmode: 'numeric', autocomplete: 'off', value: cur.time, 'aria-label': 'เวลา (24 ชั่วโมง)' });
  const gymBtn = h('button', { class: 'in', id: 'f-gym', type: 'button', onclick: () => openGymPicker(app, { onPick: renderGym }) });
  const chips = h('div', { class: 'gchips' });
  let gymAtOpen = prevGym;

  function commitDate() {
    const iso = parseBE(dateIn.value);
    if (iso) {
      dateIn.classList.remove('bad');
      if (iso !== cur.date) { cur.date = iso; app.metaChanged(gymAtOpen); }
    } else dateIn.classList.add('bad');
    if (iso) dateIn.value = isoToBE(iso);
  }
  function commitTime() {
    const t = parseTime(timeIn.value);
    if (t) {
      timeIn.classList.remove('bad');
      if (t !== cur.time) { cur.time = t; app.metaChanged(gymAtOpen); }
      timeIn.value = t;
    } else timeIn.classList.add('bad');
  }
  dateIn.addEventListener('change', commitDate);
  timeIn.addEventListener('change', commitTime);

  function setGym(name) {
    const old = cur.gym;
    cur.gym = name;
    app.metaChanged(old);
    gymAtOpen = name;
    renderGym();
  }
  function renderGym() {
    gymBtn.textContent = cur.gym || 'เลือกสถานที่';
    gymBtn.style.color = cur.gym ? gymColor(app, cur.gym) : '#9CA6B2';
    chips.replaceChildren();
    app.data.gyms.slice(0, 6).forEach((g) => {
      const c = h('button', { class: 'chip', type: 'button', 'data-gym': g.name, text: g.name, onclick: () => setGym(g.name) });
      c.style.color = gymColor(app, g.name);
      chips.appendChild(c);
    });
    if (cur.gym && !app.data.gyms.some((g) => g.name === cur.gym)) {
      const c = h('button', { class: 'chip', type: 'button', text: cur.gym });
      c.style.color = gymColor(app, cur.gym);
      chips.insertBefore(c, chips.firstChild);
    }
    chips.appendChild(h('button', { class: 'chip add', type: 'button', id: 'addgym', text: '+ เพิ่มสถานที่', onclick: () => openGymPicker(app, { onPick: renderGym }) }));
  }

  s.appendChild(h('h2', { text: 'แก้วันที่ · เวลา · สถานที่' }));
  s.appendChild(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
    h('label', { class: 'fld' }, ['วันที่', dateIn]),
    h('label', { class: 'fld' }, ['เวลา', timeIn])
  ]));
  s.appendChild(h('div', { class: 'fld', style: 'margin-bottom:4px' }, ['สถานที่', gymBtn]));
  s.appendChild(chips);
  s.appendChild(h('div', { class: 'note2', text: 'แก้แล้วบันทึกอัตโนมัติ · แตะข้างนอกเพื่อปิด' }));
  renderGym();
  m.onClose(() => { commitDate(); commitTime(); });
  return m;
}

/* ---------- 05: เลือก / เพิ่มสถานที่ ---------- */
export function openGymPicker(app, { onPick }) {
  const { h, win } = app;
  const m = openModal(app, { tall: true });
  const s = m.sheet;
  const cur = app.cur;
  const q = h('input', { class: 'srch', id: 'gymq', type: 'text', placeholder: 'ค้นหา หรือพิมพ์ชื่อสถานที่ใหม่', autocomplete: 'off' });
  const res = h('div', { style: 'overflow:auto;flex:0 1 auto;min-height:0' });
  s.style.display = 'flex';
  s.style.flexDirection = 'column';
  s.appendChild(h('h2', { text: 'สถานที่' }));
  s.appendChild(q);
  s.appendChild(res);
  s.appendChild(h('div', { class: 'note2' }, ['แตะเพื่อเลือก · สถานที่ใหม่จะถูกใช้กับเซสชันนี้ทันที และกำหนดสีป้ายให้อัตโนมัติ', h('br'), 'น้ำหนักเทียบข้ามสถานที่ไม่ได้ตรง ๆ เพราะเครื่องต่างกัน']));

  function choose(name) {
    const old = cur.gym;
    cur.gym = name;
    gymColor(app, name);
    app.metaChanged(old);
    m.close();
    onPick && onPick(name);
  }
  function render() {
    res.replaceChildren();
    const raw = q.value.trim();
    const t = raw.toLowerCase();
    let exact = false;
    // รายการสถานที่สั้น: แสดงทั้งหมดเสมอ (พิมพ์แล้วมีแถว "+ เพิ่มสถานที่ใหม่" เพิ่มขึ้นมา)
    app.data.gyms.forEach((g) => {
      if (g.name.toLowerCase() === t) exact = true;
      const isCur = g.name === cur.gym;
      const name = h('span', { style: 'display:flex;align-items:center' }, [isCur ? h('span', { class: 'ck', text: '✓' }) : null, h('span', { text: g.name, style: `color:${gymColor(app, g.name)}${isCur ? '' : ';padding-left:24px'}` })]);
      res.appendChild(h('button', { class: 'opt', type: 'button', 'data-gym': g.name, onclick: () => choose(g.name) }, [name, h('small', { text: g.n + ' ครั้ง' })]));
    });
    if (raw && !exact) res.appendChild(h('button', { class: 'opt new', type: 'button', id: 'newgym', text: `+ เพิ่มสถานที่ใหม่ “${raw}”`, onclick: () => choose(raw.slice(0, 60)) }));
  }
  q.addEventListener('input', render);
  render();
  win.setTimeout(() => q.focus(), 50);
  return m;
}

/* ---------- 06, 07: เพิ่มท่า ---------- */
export function openAddSheet(app) {
  const { h, win } = app;
  const m = openModal(app);
  const sheet = m.sheet;

  function stepType() {
    sheet.replaceChildren();
    sheet.classList.remove('tall');
    sheet.style.display = '';
    sheet.appendChild(h('h2', { text: 'เพิ่มท่า' }));
    sheet.appendChild(h('div', { class: 'types' }, [
      h('button', { class: 'ty', type: 'button', 'data-kind': 'strength', onclick: () => stepPick('strength') }, [h('span', { style: 'font-size:28px', text: '🏋️' }), 'เวท', h('small', { text: 'ครั้ง × น้ำหนัก' })]),
      h('button', { class: 'ty', type: 'button', 'data-kind': 'cardio', onclick: () => stepPick('cardio') }, [h('span', { style: 'font-size:28px', text: '🏃' }), 'คาร์ดิโอ', h('small', { text: 'เวลา + HR เฉลี่ย' })])
    ]));
  }

  function stepPick(kind) {
    sheet.replaceChildren();
    sheet.classList.add('tall');
    sheet.style.display = 'flex';
    sheet.style.flexDirection = 'column';
    sheet.appendChild(h('h2', { text: kind === 'cardio' ? 'คาร์ดิโอ' : 'ท่าเวท' }));
    const q = h('input', { class: 'srch', id: 'exq', type: 'text', placeholder: 'ค้นหา หรือพิมพ์ชื่อท่าใหม่', autocomplete: 'off' });
    const res = h('div', { style: 'overflow:auto;flex:1;min-height:0' });
    sheet.appendChild(q);
    sheet.appendChild(res);
    const render = () => {
      res.replaceChildren();
      const raw = q.value.trim();
      const t = raw.toLowerCase();
      let exact = false;
      app.data.exercises.filter((e) => e.kind === kind && (!t || e.name.toLowerCase().includes(t))).forEach((e) => {
        if (e.name.toLowerCase() === t) exact = true;
        res.appendChild(h('button', { class: 'opt', type: 'button', 'data-ex': e.name, onclick: () => pick(e.name, false) }, [e.name, e.n ? h('small', { text: e.n + ' ครั้ง' }) : null]));
      });
      if (raw && !exact) res.appendChild(h('button', { class: 'opt new', type: 'button', id: 'newex', text: `+ สร้างท่าใหม่ “${raw}”`, onclick: () => pick(raw.slice(0, 80), true) }));
    };
    q.addEventListener('input', render);
    render();
    win.setTimeout(() => q.focus(), 50);

    function pick(name, isNew) {
      m.close();
      if (isNew && !app.data.exercises.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
        app.data.exercises.push({ name, desc: '', kind, n: 0 });
        app.persist();
        app.q.enqueue({ t: 'add', name, kind });
      }
      app.addItem(name, kind);
    }
  }
  stepType();
  return m;
}
