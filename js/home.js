import { isoToBE } from './date.js';
import { svg } from './util.js';
import { gymColor } from './gyms.js';

function watchSentinel(app, el) {
  if (app.unwatch) app.unwatch();
  const win = app.win;
  if ('IntersectionObserver' in win) {
    const io = new win.IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) app.loadMore();
    }, { rootMargin: '300px' });
    io.observe(el);
    app.unwatch = () => io.disconnect();
  } else {
    const fn = () => {
      if (app.view !== 'home') return;
      if (el.getBoundingClientRect().top < win.innerHeight + 300) app.loadMore();
    };
    win.addEventListener('scroll', fn);
    app.unwatch = () => win.removeEventListener('scroll', fn);
  }
}

function sessionCard(app, s) {
  const { h } = app;
  const card = h('button', { class: 'sc', type: 'button', 'data-id': s.id, onclick: () => app.openSession(s) });
  const gy = s.gym ? h('div', { class: 'gy', text: s.gym }) : null;
  if (gy) gy.style.color = gymColor(app, s.gym);
  card.appendChild(h('div', { class: 'hd' }, [h('div', { class: 'dt', text: isoToBE(s.date) + (s.time ? '  ' + s.time : '') }), gy]));
  s.items.forEach((it) => {
    if (it.kind === 'cardio') {
      const txt = (String(it.min ?? '') !== '' ? it.min + ' นาที' : '') + (String(it.hr ?? '') !== '' ? ((it.min !== '' ? ' · ' : '') + 'HR ' + it.hr) : '');
      card.appendChild(h('div', { class: 'mini one' }, [h('div', { class: 'n', text: it.name }), h('div', { class: 'v', text: txt })]));
    } else {
      const row = h('div', { class: 'mini' });
      row.appendChild(h('div', { class: 'n', text: it.name }));
      row.appendChild(h('div', { class: 'v', text: it.sets.map((x) => (x.r === '' ? '–' : x.r)).join(' · ') }));
      row.appendChild(h('div', { class: 'w', text: it.sets.map((x) => (x.w === '' ? '–' : x.w)).join(' · ') }));
      card.appendChild(row);
    }
  });
  return card;
}

export function renderHome(app) {
  const { h, doc, data } = app;
  if (app.pendingReload) { // มีเวอร์ชันใหม่รออยู่ (ตอนอยู่หน้าบันทึกเลยยังไม่ได้รีโหลด) → รีโหลดตอนนี้
    app.pendingReload = false;
    app.reloadPage();
    return;
  }
  app.view = 'home';
  app.refreshChips = null;
  if (app.stopTick) app.stopTick();
  const root = app.root;
  root.className = '';
  root.replaceChildren();

  const sheetIcon = svg(doc, 20, ['M3 9h14M9 3v14'], '#C8F169');
  const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  ['x:3', 'y:3', 'width:14', 'height:14', 'rx:2'].forEach((kv) => rect.setAttribute(...kv.split(':')));
  sheetIcon.insertBefore(rect, sheetIcon.firstChild);
  const arrow = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrow.setAttribute('d', 'M15 21h6v-6M21 21l-7-7');
  arrow.setAttribute('stroke', '#F2F4F7');
  sheetIcon.appendChild(arrow);
  sheetIcon.setAttribute('stroke-width', '2');

  const shBtn = data.logUrl
    ? h('a', { class: 'shbtn', href: data.logUrl, target: '_blank', rel: 'noopener', 'aria-label': 'เปิดแท็บ Log ใน Google Sheet' }, [sheetIcon])
    : h('span', { class: 'shbtn', 'aria-label': 'เปิดแท็บ Log ใน Google Sheet', style: 'opacity:.4' }, [sheetIcon]);

  root.appendChild(h('div', { class: 'top' }, [
    h('h1', { text: 'บันทึก' }),
    h('div', { style: 'display:flex;align-items:center;gap:12px' }, [app.badgeEl(true), shBtn])
  ]));
  root.appendChild(h('button', { class: 'cta', type: 'button', text: '+ เริ่มฝึกใหม่', onclick: app.startNew }));

  if (!data.sessions.length) root.appendChild(h('div', { class: 'empty', text: 'ยังไม่มีบันทึกในแอปนี้ กด “เริ่มฝึกใหม่”' }));
  data.sessions.forEach((s) => root.appendChild(sessionCard(app, s)));

  const n = data.sessions.length;
  const total = Math.max(data.total, n);
  if (n < total) {
    if (app.moreError) {
      root.appendChild(h('button', { class: 'ld', type: 'button', id: 'loader', text: 'โหลดไม่สำเร็จ · แตะเพื่อลองใหม่', onclick: app.retryMore }));
    } else {
      const ld = h('div', { class: 'ld', id: 'loader' }, [h('span', { class: 'spin' }), h('span', { text: `แสดง ${n} จาก ${total} เซสชัน · เลื่อนลงเพื่อโหลดเพิ่ม` })]);
      root.appendChild(ld);
      watchSentinel(app, ld);
    }
  } else if (total > 0) {
    root.appendChild(h('div', { class: 'ld', id: 'loader', text: `แสดงครบ ${total} เซสชัน` }));
  }

  root.appendChild(data.logUrl
    ? h('a', { class: 'shlink', href: data.logUrl, target: '_blank', rel: 'noopener' }, ['ดูทั้งหมดใน Google Sheet ', h('span', { style: 'color:#C8F169', text: '↗' })])
    : h('div', { class: 'shlink dis' }, ['ดูทั้งหมดใน Google Sheet ', h('span', { text: '↗' })]));
  root.appendChild(h('button', { class: 'link', type: 'button', text: 'ตั้งค่าการเชื่อมต่อ', onclick: app.showSettings }));
  app.updateBadge();
}
