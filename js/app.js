import { makeH, uid } from './util.js';
import { isoToday, nowHM } from './date.js';
import { createQueue } from './queue.js';
import { createTimer } from './timer.js';
import { hasData } from './stats.js';
import { seedGymColors, bumpGym } from './gyms.js';
import { renderHome } from './home.js';
import { renderSession } from './session.js';
import { renderSettings } from './settings.js';
import { scrollDelta } from './viewport.js';

const BADGE_TEXT = { idle: 'บันทึกแล้ว', pending: 'กำลังบันทึก…', offline: 'ออฟไลน์ · รอซิงค์', auth: 'ต้องตั้งค่า token' };
const defaults = () => ({ exercises: [], gyms: [], lastGym: '', sessions: [], total: 0, srvCount: 0, logUrl: '' });
const PAGE = 10;

export function createApp({ win, api, storage, opts = {} }) {
  const doc = win.document;
  const h = makeH(doc);
  const app = {
    win, doc, h, api, storage, opts,
    root: doc.getElementById('app'),
    data: Object.assign(defaults(), storage.get('gl_boot', {})),
    cur: null,
    view: 'home',
    authBad: false,
    loadingMore: false,
    moreError: false,
    lastCache: storage.get('gl_last', {}),
    pending: new Map(),
    homeScroll: 0
  };
  const debounceMs = opts.debounceMs ?? 600;
  app.timer = createTimer({ storage, now: opts.now });
  app.q = createQueue({ api, storage, retryMs: opts.retryMs ?? 8000, onChange: () => app.updateBadge() });

  app.persist = () => storage.set('gl_boot', app.data);
  app.reloadPage = () => win.location.reload(); // แยกเป็นฟังก์ชันไว้ให้ทดสอบ

  // ช่องกรอกทั่วไป (เช่น หน้าตั้งค่า) ต้องไม่ถูกคีย์บอร์ดบัง — การ์ดท่าและแผ่นล่างมีตัวจัดการของตัวเองแล้ว
  app.ensureFieldVisible = (el) => {
    if (!el || !el.getBoundingClientRect || !el.closest || el.closest('.modal, .ex')) return;
    const vv = win.visualViewport;
    const bottom = vv ? vv.offsetTop + vv.height : win.innerHeight;
    const stk = doc.querySelector('.stk');
    const d = scrollDelta(el.getBoundingClientRect(), stk ? stk.getBoundingClientRect().bottom : 0, bottom);
    if (d) win.scrollBy({ top: d, behavior: 'smooth' });
  };
  app.status = () => (app.authBad ? { state: 'auth', n: app.q.length } : app.q.status());

  /* ---------- สถานะซิงก์ ---------- */
  app.badgeEl = (withText) => {
    const el = h('button', { class: 'bd', 'data-badge': withText ? 'text' : 'dot', type: 'button', 'aria-label': 'สถานะบันทึก', onclick: () => app.status().state === 'auth' && app.showSettings() }, [
      h('span', { class: 'dot' }),
      withText ? h('span', { class: 'bt', text: BADGE_TEXT.idle }) : null
    ]);
    return el;
  };
  app.updateBadge = () => {
    const s = app.status();
    doc.querySelectorAll('[data-badge]').forEach((el) => {
      el.className = 'bd st-' + s.state;
      const t = el.querySelector('.bt');
      const text = BADGE_TEXT[s.state] + (s.state === 'offline' ? ' ' + s.n : '');
      if (t) t.textContent = text;
      el.setAttribute('aria-label', 'สถานะบันทึก: ' + text);
    });
    doc.querySelectorAll('[data-hint]').forEach((el) => {
      el.hidden = !(s.state === 'offline' || s.state === 'auth');
      el.textContent = s.state === 'auth' ? 'ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ — แตะจุดสถานะเพื่อตั้งค่า' : 'ออฟไลน์? ข้อมูลเก็บในเครื่องก่อน แล้วส่งเมื่อมีสัญญาณ';
    });
  };

  /* ---------- โหลดข้อมูล ---------- */
  function apiFail(e) {
    if (e && (e.code === 'unauthorized' || e.code === 'not-configured')) app.authBad = true;
    app.updateBadge();
  }

  app.refresh = async () => {
    try {
      const b = await api.call('bootstrap');
      app.authBad = false;
      const d = app.data;
      d.exercises = b.exercises;
      d.gyms = b.gyms;
      d.logUrl = b.logUrl || b.sheetUrl || '';
      seedGymColors(app, b.gyms);
      if (!app.q.length && !app.cur) {
        d.sessions = b.sessions;
        d.srvCount = b.sessions.length;
        d.total = b.total;
        d.lastGym = b.lastGym || d.lastGym;
      } else {
        d.total = Math.max(d.total, b.total);
      }
      app.persist();
      app.updateBadge();
      if (app.view === 'home') renderHome(app);
    } catch (e) {
      apiFail(e);
    }
  };

  app.loadMore = async () => {
    const d = app.data;
    if (app.loadingMore || app.moreError || d.sessions.length >= d.total) return;
    app.loadingMore = true;
    try {
      const r = await api.call('sessions', [d.srvCount, PAGE]);
      app.authBad = false;
      const have = new Set(d.sessions.map((s) => s.id));
      r.sessions.forEach((s) => {
        if (!have.has(s.id)) d.sessions.push(s);
      });
      d.srvCount += r.sessions.length;
      d.total = r.total;
      if (!r.sessions.length) d.total = d.sessions.length; // ไม่มีเพิ่มแล้ว กันวนไม่รู้จบ
      app.persist();
    } catch (e) {
      app.moreError = true;
      apiFail(e);
    }
    app.loadingMore = false;
    if (app.view === 'home') renderHome(app);
  };
  app.retryMore = () => {
    app.moreError = false;
    renderHome(app);
    app.loadMore();
  };

  /* ---------- ครั้งล่าสุดของท่า ---------- */
  function localLast(name, exclude) {
    const key = name.toLowerCase();
    let best = null;
    app.data.sessions.forEach((s) => {
      if (s.id === exclude) return;
      s.items.forEach((it) => {
        if (it.name.toLowerCase() !== key || it.kind === 'cardio') return;
        if (!it.sets.some((x) => String(x.r) !== '' || String(x.w) !== '')) return;
        const k = s.date + ' ' + s.time;
        if (!best || k > best.k) best = { k, date: s.date, sets: it.sets };
      });
    });
    return best;
  }
  app.getLast = (name, cb) => {
    const key = name.toLowerCase();
    const loc = localLast(name, app.cur && app.cur.id);
    let served = false;
    if (loc) { served = true; cb(loc); }
    else if (app.lastCache[key]) { served = true; cb(app.lastCache[key]); }
    api.call('last', [name, app.cur ? app.cur.id : '']).then((res) => {
      if (res) {
        app.lastCache[key] = res;
        storage.set('gl_last', app.lastCache);
        if (!loc && !served) cb(res);
      }
    }, apiFail);
  };

  /* ---------- เซสชัน ---------- */
  app.metaOf = (s) => ({ id: s.id, date: s.date, time: s.time, gym: s.gym || '' });

  app.startNew = () => {
    app.homeScroll = win.scrollY || 0;
    app.cur = { id: uid(), date: isoToday(), time: nowHM(), gym: app.data.lastGym || '', items: [] };
    renderSession(app);
  };
  app.openSession = (s) => {
    app.homeScroll = win.scrollY || 0;
    app.cur = s;
    renderSession(app);
  };

  app.persistSession = (s) => {
    const d = app.data;
    if (d.sessions.indexOf(s) < 0 && s.items.some(hasData)) {
      d.sessions.unshift(s);
      d.total += 1;
      d.srvCount += 0;
      if (s.gym) { d.lastGym = s.gym; bumpGym(app, s.gym, 1); }
    }
    app.persist();
  };

  app.scheduleSave = (it) => {
    const sess = app.cur;
    const k = sess.id + '|' + it.name.toLowerCase();
    if (app.pending.has(k)) win.clearTimeout(app.pending.get(k).t);
    const fire = () => {
      app.pending.delete(k);
      if (!hasData(it) && app.data.sessions.indexOf(sess) < 0) return;
      app.persistSession(sess);
      app.q.enqueue({
        t: 'save',
        meta: app.metaOf(sess),
        ex: { name: it.name, kind: it.kind, sets: JSON.parse(JSON.stringify(it.sets)), min: it.min ?? '', hr: it.hr ?? '', note: it.note || '' }
      });
    };
    app.pending.set(k, { t: win.setTimeout(fire, debounceMs), fire });
  };
  app.cancelSave = (sess, it) => {
    const k = sess.id + '|' + it.name.toLowerCase();
    const p = app.pending.get(k);
    if (p) { win.clearTimeout(p.t); app.pending.delete(k); }
  };
  app.flushSaves = () => {
    [...app.pending.values()].forEach((p) => {
      win.clearTimeout(p.t);
      p.fire();
    });
  };

  app.sortSessions = () => {
    app.data.sessions.sort((a, b) => {
      const x = a.date + ' ' + a.time, y = b.date + ' ' + b.time;
      return x < y ? 1 : x > y ? -1 : 0;
    });
  };

  // เปลี่ยนวันที่/เวลา/สถานที่ของเซสชันที่เปิดอยู่
  app.metaChanged = (prevGym) => {
    const cur = app.cur;
    const saved = app.data.sessions.indexOf(cur) >= 0;
    if (saved) {
      if (prevGym !== cur.gym) {
        bumpGym(app, prevGym, -1);
        bumpGym(app, cur.gym, 1);
        if (cur.gym) app.data.lastGym = cur.gym;
      }
      app.sortSessions();
      app.persist();
      app.q.enqueue({ t: 'meta', meta: app.metaOf(cur) });
    } else {
      cur.items.forEach((it) => hasData(it) && app.scheduleSave(it));
    }
    if (app.refreshChips) app.refreshChips();
  };

  app.leave = () => {
    app.flushSaves();
    const cur = app.cur;
    cur.items = cur.items.filter((it) => {
      if (hasData(it)) return true;
      app.q.enqueue({ t: 'del', id: cur.id, name: it.name });
      return false;
    });
    const idx = app.data.sessions.indexOf(cur);
    if (!cur.items.length && idx >= 0) {
      app.data.sessions.splice(idx, 1);
      app.data.total = Math.max(0, app.data.total - 1);
      if (cur.gym) bumpGym(app, cur.gym, -1);
    }
    app.persist();
    app.cur = null;
    if (app.stopTick) app.stopTick();
    renderHome(app);
    win.scrollTo && win.scrollTo(0, app.homeScroll);
  };

  app.showHome = () => renderHome(app);
  app.showSettings = () => renderSettings(app);

  /* ---------- เริ่มต้น ---------- */
  app.start = () => {
    doc.addEventListener('focusin', (e) => {
      if (!/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return;
      [0, 250, 600].forEach((ms) => win.setTimeout(() => doc.contains(e.target) && app.ensureFieldVisible(e.target), ms)); // รอคีย์บอร์ดเลื่อนขึ้น
    });
    win.addEventListener('online', () => app.q.setOnline(true));
    win.addEventListener('offline', () => app.q.setOnline(false));
    win.addEventListener('pagehide', app.flushSaves);
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) app.flushSaves();
      else app.q.flush();
    });
    const vv = win.visualViewport;
    if (vv) {
      const sync = () => {
        const kb = Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop));
        doc.documentElement.style.setProperty('--kb', kb + 'px');
        if (app.view === 'session' && app.activeVisible) app.activeVisible(); // คีย์บอร์ดเพิ่งเด้ง/หุบ → จัดตำแหน่งช่องที่กรอกใหม่
        else if (app.view === 'settings') app.ensureFieldVisible(doc.activeElement);
      };
      vv.addEventListener('resize', sync);
      vv.addEventListener('scroll', sync);
    }
    if (!api.configured()) {
      renderSettings(app, true);
      return;
    }
    renderHome(app);
    app.q.flush();
    app.refresh();
  };

  return app;
}
