import { isoToBE } from './date.js';
import { svg, empty, clone } from './util.js';
import { gymColor } from './gyms.js';
import { hasData, lastText, restText, summary, deltaText, dropFlags, autoWeight, setFilled } from './stats.js';
import { openMetaSheet, openAddSheet } from './sheets.js';
import { fmtHMS } from './timer.js';
import { scrollDelta } from './viewport.js';

const exInfo = (app, name) => app.data.exercises.find((x) => x.name.toLowerCase() === name.toLowerCase()) || {};
const descOf = (app, name) => exInfo(app, name).desc || '';

export function newItem(name, kind) {
  return { name, kind, sets: kind === 'cardio' ? [] : [0, 1, 2, 3].map(() => ({ r: '', w: '' })), min: '', hr: '', note: '' };
}

/* ---------- การ์ดท่า ---------- */
function delBtn(app, it, card) {
  const { h } = app;
  let armed = false, t;
  const b = h('button', { class: 'del', type: 'button', text: 'ลบท่า' });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      b.className = 'del arm';
      b.textContent = 'แตะอีกครั้งเพื่อลบ';
      t = app.win.setTimeout(() => {
        armed = false;
        b.className = 'del';
        b.textContent = 'ลบท่า';
      }, 3000);
      return;
    }
    app.win.clearTimeout(t);
    const cur = app.cur;
    cur.items.splice(cur.items.indexOf(it), 1);
    app.cancelSave(cur, it);
    app.q.enqueue({ t: 'del', id: cur.id, name: it.name });
    if (!cur.items.length) {
      const i = app.data.sessions.indexOf(cur);
      if (i >= 0) {
        app.data.sessions.splice(i, 1);
        app.data.total = Math.max(0, app.data.total - 1);
      }
    }
    if (app.activeIt === it) app.activeIt = null;
    app.persist();
    card.remove();
    app.afterItemsChanged();
  });
  return b;
}

function exCard(app, it) {
  const { h, win } = app;
  const card = h('div', { class: 'ex', 'data-name': it.name });
  card._it = it;
  const lastEl = h('div', { class: 'last', hidden: true });
  const desc = descOf(app, it.name);
  card.appendChild(h('div', { class: 'h' }, [
    h('div', {}, [
      h('div', { class: 'noRow' }, [h('span', { class: 'no', text: 'ท่าที่ ?' }), h('span', { class: 'tapedit', text: 'แตะเพื่อแก้ไข' })]),
      h('div', { class: 'nm', text: it.name }),
      it.kind === 'cardio' ? null : lastEl,
      it.kind === 'cardio' ? null : h('div', { class: 'rest', text: restText(it.name, exInfo(app, it.name).rest) })
    ]),
    delBtn(app, it, card)
  ]));
  if (desc) card.appendChild(h('div', { class: 'desc', text: desc }));

  // การ์ดที่ย่ออยู่: แตะที่ไหนก็ได้เพื่อขยาย (ช่องกรอกในการ์ดที่ย่อไม่รับการแตะ); เลื่อนโฟกัสด้วยคีย์บอร์ดจริงก็ขยายให้
  card.addEventListener('click', () => card.classList.contains('collapsed') && app.setActive(it, true));
  card.addEventListener('focusin', () => card.classList.contains('collapsed') && app.setActive(it, true));
  // ช่องที่กำลังกรอกต้องไม่ถูกคีย์บอร์ด/dock บัง: เลื่อนซ้ำหลายจังหวะระหว่างคีย์บอร์ดเลื่อนขึ้น
  const onFocus = (e) => [0, 250, 600].forEach((ms) => win.setTimeout(() => app.doc.contains(e.target) && app.ensureVisible(card, e.target), ms));

  if (it.kind === 'cardio') {
    card.appendChild(h('div', { class: 'cd' }, [
      h('label', {}, ['เวลา (นาที)', h('input', { class: 'c', 'data-f': 'min', inputmode: 'decimal', value: it.min, placeholder: '30', onfocus: onFocus, oninput: (e) => { it.min = e.target.value; app.scheduleSave(it); } })]),
      h('label', {}, ['HR เฉลี่ย', h('input', { class: 'c', 'data-f': 'hr', inputmode: 'numeric', value: it.hr, placeholder: '130', onfocus: onFocus, oninput: (e) => { it.hr = e.target.value; app.scheduleSave(it); } })])
    ]));
  } else {
    const state = { last: null };
    const box = h('div', { class: 'scroll' });
    const sumEl = h('div', { class: 'sum' });
    let rIn = [], wIn = [], autoW = [];

    const paint = () => {
      const drops = dropFlags(it.sets);
      it.sets.forEach((s, i) => {
        rIn[i].classList.toggle('p', empty(s.r));
        wIn[i].classList.toggle('p', empty(s.w));
        wIn[i].classList.toggle('d', drops[i]);
      });
      const sm = summary(it, state.last);
      sumEl.replaceChildren(sm.text);
      if (sm.delta !== null) {
        sumEl.appendChild(app.doc.createTextNode(' '));
        sumEl.appendChild(h('b', { class: sm.delta < 0 ? 'neg' : '', text: deltaText(sm.delta) }));
      }
    };

    const draw = () => {
      box.replaceChildren();
      rIn = []; wIn = []; autoW = [];
      const grid = h('div', { class: 'g', style: `grid-template-columns:34px repeat(${it.sets.length},minmax(52px,1fr))` });
      grid.appendChild(h('div'));
      it.sets.forEach((s, i) => grid.appendChild(h('div', { class: 'sn', text: 'Set ' + (i + 1) })));
      grid.appendChild(h('div', { class: 'lb', text: 'Reps' }));
      it.sets.forEach((s, i) => {
        const lp = state.last && state.last.sets[i];
        const inp = h('input', {
          class: 'c', 'data-r': i, inputmode: 'numeric', enterkeyhint: 'next', autocomplete: 'off', value: s.r,
          placeholder: lp && !empty(lp.r) ? String(lp.r) : '', 'aria-label': `Reps เซ็ต ${i + 1}`, onfocus: onFocus,
          oninput: (e) => {
            s.r = e.target.value;
            if (!empty(s.r) && empty(s.w)) {
              const fill = autoWeight(it.sets, i, state.last);
              if (fill !== '') { s.w = fill; wIn[i].value = fill; autoW[i] = true; }
            } else if (empty(s.r) && autoW[i]) {
              s.w = ''; wIn[i].value = ''; autoW[i] = false;
            }
            paint();
            app.scheduleSave(it);
          }
        });
        rIn.push(inp);
        grid.appendChild(inp);
      });
      grid.appendChild(h('div', { class: 'lb', text: 'kg' }));
      it.sets.forEach((s, i) => {
        const lp = state.last && state.last.sets[i];
        const inp = h('input', {
          class: 'c w', 'data-w': i, inputmode: 'decimal', enterkeyhint: 'next', autocomplete: 'off', value: s.w,
          placeholder: lp && !empty(lp.w) ? String(lp.w) : '', 'aria-label': `kg เซ็ต ${i + 1}`, onfocus: onFocus,
          oninput: (e) => { s.w = e.target.value; autoW[i] = false; paint(); app.scheduleSave(it); }
        });
        wIn.push(inp);
        grid.appendChild(inp);
      });
      box.appendChild(grid);
      paint();
    };
    draw();
    card.appendChild(box);
    card.appendChild(h('div', { class: 'tools2' }, [
      sumEl,
      h('button', { class: 'sm', type: 'button', 'data-act': 'minus', text: '− Set', onclick: () => { if (it.sets.length > 1) { it.sets.pop(); draw(); app.scheduleSave(it); } } }),
      h('button', { class: 'sm', type: 'button', 'data-act': 'plus', text: '+ Set', onclick: () => { it.sets.push({ r: '', w: '' }); draw(); app.scheduleSave(it); } })
    ]));

    app.getLast(it.name, (l) => {
      state.last = l;
      lastEl.textContent = lastText(l);
      lastEl.hidden = false;
      // ท่าใหม่ที่ยังไม่กรอก: ปรับจำนวนเซ็ตตามครั้งก่อน
      if (!hasData(it) && l.sets.length && l.sets.length !== it.sets.length) it.sets = l.sets.map(() => ({ r: '', w: '' }));
      draw();
    });
  }
  const grow = (el) => { el.style.height = 'auto'; el.style.height = Math.max(62, el.scrollHeight + 2) + 'px'; };
  const note = h('textarea', { class: 'note', rows: '2', placeholder: 'คำอธิบาย / โน้ต (เครื่อง, ความรู้สึก)', 'aria-label': 'โน้ต', onfocus: onFocus, oninput: (e) => { it.note = e.target.value; grow(e.target); app.scheduleSave(it); } });
  note.value = it.note || '';
  if (note.value) win.setTimeout(() => grow(note), 0);
  card.appendChild(note);
  return card;
}

/* ---------- หน้าบันทึก ---------- */
export function renderSession(app) {
  const { h, doc, win, cur } = app;
  app.view = 'session';
  if (app.unwatch) app.unwatch();
  if (app.stopTick) app.stopTick();
  const root = app.root;
  root.className = 'sess';
  root.replaceChildren();

  /* แถบบน sticky */
  const chipDate = h('button', { class: 'chip', type: 'button', 'data-chip': 'date' });
  const chipTime = h('button', { class: 'chip', type: 'button', 'data-chip': 'time' });
  const chipGym = h('button', { class: 'chip gc', type: 'button', 'data-chip': 'gym' });
  [chipDate, chipTime, chipGym].forEach((c) => c.addEventListener('click', () => openMetaSheet(app)));
  app.refreshChips = () => {
    chipDate.textContent = isoToBE(app.cur.date);
    chipTime.textContent = app.cur.time;
    chipGym.textContent = app.cur.gym || 'สถานที่';
    chipGym.style.color = app.cur.gym ? gymColor(app, app.cur.gym) : '';
    chipGym.classList.toggle('dim0', !app.cur.gym);
  };
  app.refreshChips();
  root.appendChild(h('div', { class: 'stk' }, [
    h('div', { class: 'r1' }, [
      h('button', { class: 'bk', type: 'button', 'aria-label': 'ย้อนกลับ', onclick: app.leave }, [svg(doc, 24, 'M15 5l-7 7 7 7', '#F2F4F7')]),
      chipDate, chipTime, chipGym,
      h('div', { class: 'sdot' }, [app.badgeEl(false)])
    ])
  ]));

  /* รายการท่า */
  const wrap = h('div', { id: 'exs' });
  root.appendChild(wrap);
  const emptyMsg = h('div', { class: 'empty', text: 'กด “+ เพิ่มท่า” เพื่อเริ่มบันทึก' });
  /* ย่อ/ขยายการ์ด: ขยายทีละใบ (ใบที่กำลังทำ) ใบอื่นย่อเหลือชื่อ + ตารางเซ็ต */
  app.activeIt = null;
  const cardsEl = () => [...wrap.querySelectorAll('.ex')];
  const renumber = () => cardsEl().forEach((c, i) => { c.querySelector('.no').textContent = 'ท่าที่ ' + (i + 1); });
  const applyCollapse = () => cardsEl().forEach((c) => {
    const on = c._it === app.activeIt;
    c.classList.toggle('collapsed', !on);
    c.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
  const barBottom = () => { const s = doc.querySelector('.stk'); return s ? s.getBoundingClientRect().bottom : 0; };
  app.setActive = (it, scroll) => {
    app.activeIt = it;
    applyCollapse();
    if (!scroll) return;
    // รอให้ใบอื่นย่อเสร็จก่อน แล้วค่อยเลื่อนให้ใบนี้ชิดใต้แถบบน
    win.setTimeout(() => {
      const c = cardsEl().find((x) => x._it === it);
      if (c) win.scrollBy({ top: Math.round(c.getBoundingClientRect().top - (barBottom() + 8)), behavior: 'smooth' });
    }, 0);
  };
  // เลื่อนหน้าให้ช่องที่กรอกอยู่มองเห็นครบ เหนือคีย์บอร์ดและ dock จับเวลา
  app.ensureVisible = (card, target) => {
    const vv = win.visualViewport;
    const viewBottom = vv ? vv.offsetTop + vv.height : win.innerHeight;
    const dk = doc.getElementById('dock');
    const dockTop = dk && !dk.hidden ? dk.getBoundingClientRect().top : viewBottom;
    let r = target.getBoundingClientRect();
    if (card && target.classList.contains('c')) {
      const g = card.querySelector('.scroll'), t = card.querySelector('.tools2'); // ตารางเซ็ต + ปุ่ม/สรุปใต้ตาราง
      if (g && t) r = { top: g.getBoundingClientRect().top, bottom: t.getBoundingClientRect().bottom };
    }
    const d = scrollDelta(r, barBottom(), Math.min(viewBottom, dockTop));
    if (d) win.scrollBy({ top: d, behavior: 'smooth' });
  };
  app.activeVisible = () => {
    const el = doc.activeElement;
    const card = el && el.closest ? el.closest('.ex') : null;
    if (card && !card.classList.contains('collapsed')) app.ensureVisible(card, el);
  };

  cur.items.forEach((it) => wrap.appendChild(exCard(app, it)));
  app.activeIt = cur.items.length ? cur.items[cur.items.length - 1] : null; // เปิดเซสชันเดิม: ขยายใบสุดท้าย (ที่มักทำต่อ)
  applyCollapse();
  renumber();
  root.appendChild(h('div', { class: 'hint', 'data-hint': '1', hidden: true }));
  root.appendChild(h('button', { class: 'addbtn', type: 'button', id: 'addbtn', text: '+ เพิ่มท่า', onclick: () => openAddSheet(app) }));

  /* dock จับเวลา (ซ่อนถ้ามีแต่คาร์ดิโอ) */
  const tv = doc.createTextNode('');
  const dt = h('div', { class: 'dt2' }, [h('span', { class: 'l', text: 'จับเวลาพัก' }), tv]);
  const go = h('button', { class: 'db go big', type: 'button', id: 'restgo', onclick: () => { app.timer.start(); paintTimer(); } });
  const stop = h('button', { class: 'db stop', type: 'button', id: 'reststop', 'aria-label': 'หยุดจับเวลา', text: '■', onclick: () => { app.timer.stop(); paintTimer(); } });
  const dock = h('div', { class: 'dock', id: 'dock' }, [h('div', { class: 'dock-in' }, [h('div', { class: 'dr' }, [dt, go, stop])])]);
  root.appendChild(dock);
  function paintTimer() {
    const run = app.timer.running;
    tv.nodeValue = fmtHMS(app.timer.elapsed());
    dt.classList.toggle('idle', !run);
    go.textContent = run ? 'เริ่มพักใหม่' : 'เริ่มพัก';
    stop.hidden = !run;
  }
  paintTimer();
  const tick = win.setInterval(paintTimer, 250);
  app.stopTick = () => { win.clearInterval(tick); app.stopTick = null; };
  app.paintTimer = paintTimer;

  app.afterItemsChanged = () => {
    const items = app.cur.items;
    if (!items.length && !emptyMsg.parentNode) wrap.appendChild(emptyMsg);
    if (items.length && emptyMsg.parentNode) emptyMsg.remove();
    dock.hidden = !!(items.length && items.every((i) => i.kind === 'cardio'));
    root.classList.toggle('nodock', dock.hidden);
    renumber();
  };
  app.afterItemsChanged();

  app.addItem = (name, kind) => {
    const dup = app.cur.items.find((i) => i.name.toLowerCase() === name.toLowerCase());
    let it = dup;
    if (!dup) {
      it = newItem(name, kind);
      app.cur.items.push(it);
      wrap.appendChild(exCard(app, it));
      app.afterItemsChanged();
    }
    const card = cardsEl().find((c) => c._it === it);
    // ไม่เปิดคีย์บอร์ดเอง: ปล่อยให้ผู้ใช้แตะช่องที่ต้องการกรอก
    const ae = doc.activeElement;
    if (ae && ae !== doc.body && ae.blur) ae.blur();
    app.setActive(it, true);
    if (card) card.classList.add('flash');
  };
  win.scrollTo && win.scrollTo(0, 0);
  app.updateBadge();
}
