import { svg } from './util.js';
import { validApiUrl } from './api.js';
import { loadGsi } from './gsi.js';

const LOGIN_ERR = {
  unauthorized: 'บัญชี Google นี้ไม่ได้รับอนุญาต (ต้องเป็นบัญชีเจ้าของข้อมูลเท่านั้น)',
  network: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ (ตรวจ URL / อินเทอร์เน็ต)',
  'bad-response': 'เซิร์ฟเวอร์ตอบรูปแบบไม่ถูกต้อง (ตรวจว่า deploy เป็น “Anyone” และ URL ลงท้าย /exec)',
  'not-configured': 'กรอก API URL ก่อน'
};

export function renderSettings(app, first = false) {
  const { h, doc, api, win } = app;
  const clientId = (app.opts && app.opts.googleClientId) || '';
  app.view = 'settings';
  if (app.unwatch) app.unwatch();
  if (app.stopTick) app.stopTick();
  const root = app.root;
  root.className = '';
  root.replaceChildren();

  const urlIn = h('input', { class: 'in', id: 's-url', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://script.google.com/macros/s/…/exec', value: api.getUrl() });
  const tokIn = h('input', { class: 'in', id: 's-token', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: api.hasToken() ? '•••••• (บันทึกไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม)' : 'วาง API token ที่นี่' });
  const res = h('div', { class: 'res', id: 's-res', 'aria-live': 'polite' });
  const setRes = (cls, text) => { res.className = 'res ' + cls; res.textContent = text; };

  function done() {
    app.authBad = false;
    app.q.resume();
    app.updateBadge();
    app.moreError = false;
    app.showHome();
    app.refresh();
  }

  /* ---- เข้าสู่ระบบด้วย Google ---- */
  async function onCredential(resp) {
    const url = urlIn.value.trim();
    if (!validApiUrl(url)) { setRes('err', 'URL ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)'); return; }
    setRes('', 'กำลังเข้าสู่ระบบ…');
    try {
      const r = await api.login(resp && resp.credential, url);
      setRes('ok', 'เข้าสู่ระบบแล้ว: ' + (r.email || ''));
      done();
    } catch (e) {
      const m = e.code === 'server' && e.message === 'too-many-attempts' ? 'ลองถี่เกินไป รอประมาณ 10 นาทีแล้วลองใหม่'
        : e.code === 'server' && e.message === 'not-configured' ? 'ฝั่งเซิร์ฟเวอร์ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID'
        : e.code === 'server' && e.message === 'login-error' ? 'เซิร์ฟเวอร์ขัดข้องตอนตรวจบัญชี (ดูสาเหตุที่ Apps Script → Executions)'
        : LOGIN_ERR[e.code] || 'เข้าสู่ระบบไม่สำเร็จ';
      setRes('err', m);
    }
  }

  const gbox = h('div', { id: 'g-btn', class: 'gbtn' });
  const signedIn = api.hasToken();

  function mountGoogle() {
    if (!clientId) return;
    loadGsi(win).then((gid) => {
      gid.initialize({ client_id: clientId, callback: onCredential, auto_select: false, cancel_on_tap_outside: true });
      gid.renderButton(gbox, { type: 'standard', theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', width: 300, locale: 'th' });
    }).catch(() => setRes('err', 'โหลดปุ่มเข้าสู่ระบบ Google ไม่ได้ (ต้องมีอินเทอร์เน็ต) — ใช้ API token ด้านล่างแทนได้'));
  }

  /* ---- ทดสอบ / บันทึกด้วย token (ขั้นสูง) ---- */
  async function test() {
    const url = urlIn.value.trim();
    if (!validApiUrl(url)) { setRes('err', 'URL ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)'); return false; }
    setRes('', 'กำลังทดสอบ…');
    try {
      const r = await api.test(url, tokIn.value.trim() || app.storage.get('gl_token', ''));
      setRes('ok', `เชื่อมต่อสำเร็จ · พบ ${r.total} เซสชัน`);
      return true;
    } catch (e) {
      const msg = {
        unauthorized: 'token ไม่ถูกต้อง',
        network: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ (ตรวจ URL / อินเทอร์เน็ต)',
        'bad-response': 'เซิร์ฟเวอร์ตอบรูปแบบไม่ถูกต้อง (ตรวจว่า deploy เป็น “Anyone” และ URL ลงท้าย /exec)',
        'not-configured': 'กรอก URL และ token ก่อน',
        server: 'เซิร์ฟเวอร์รายงานข้อผิดพลาด: ' + (e.message || '')
      }[e.code] || 'ผิดพลาด';
      setRes('err', msg);
      return false;
    }
  }

  function save() {
    const url = urlIn.value.trim();
    if (!validApiUrl(url)) { setRes('err', 'URL ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)'); return; }
    if (!tokIn.value.trim() && !api.hasToken()) { setRes('err', 'กรอก token'); return; }
    api.save(url, tokIn.value.trim());
    done();
  }

  function logout() {
    api.logout();
    app.authBad = true;
    app.updateBadge();
    renderSettings(app, true);
  }

  const back = first && !api.configured() ? null : h('button', { class: 'bk', type: 'button', 'aria-label': 'ย้อนกลับ', onclick: () => app.showHome() }, [svg(doc, 24, 'M15 5l-7 7 7 7', '#F2F4F7')]);
  root.appendChild(h('div', { class: 'stk' }, [h('div', { class: 'r1' }, [back, h('div', { style: 'font-size:17px;font-weight:600;padding-left:4px', text: 'ตั้งค่าการเชื่อมต่อ' })])]));

  const tokenBox = h('div', {}, [
    h('p', { class: 'note2', text: 'ทางเลือกสำรอง: ใช้ API token (Script Property “API_TOKEN”) แทนการเข้าสู่ระบบด้วย Google ค่าเก็บในเครื่องนี้เท่านั้น' }),
    h('label', { class: 'fld' }, ['API token', tokIn]),
    h('button', { class: 'btn ghost', type: 'button', id: 's-test', text: 'ทดสอบการเชื่อมต่อ', onclick: test }),
    h('button', { class: 'btn', type: 'button', id: 's-save', text: 'บันทึก', onclick: save })
  ]);

  const parts = [
    h('p', { class: 'note2', text: clientId ? 'ใส่ URL ของ Apps Script Web App แล้วเข้าสู่ระบบด้วยบัญชี Google เจ้าของข้อมูล — ไม่ต้องคัดลอก token' : 'ใส่ URL ของ Apps Script Web App และ token (ตั้งไว้ใน Script Property “API_TOKEN”) ค่าทั้งสองเก็บในเครื่องนี้เท่านั้น ไม่ถูกส่งไปที่อื่นนอกจากเซิร์ฟเวอร์ของคุณ' }),
    h('label', { class: 'fld' }, ['API URL', urlIn])
  ];
  if (clientId) {
    if (signedIn) {
      const who = api.email();
      parts.push(h('div', { class: 'res ok', id: 's-who' }, [who ? 'เข้าสู่ระบบแล้ว: ' + who : 'เชื่อมต่อแล้ว (ใช้ API token)']));
      parts.push(h('button', { class: 'btn ghost', type: 'button', id: 's-logout', text: 'ออกจากระบบบนเครื่องนี้', onclick: logout }));
    }
    parts.push(gbox);
    parts.push(res);
    parts.push(h('details', { class: 'adv', id: 's-adv' }, [h('summary', { text: 'ขั้นสูง: ใช้ API token แทน' }), tokenBox]));
  } else {
    parts.push(res);
    parts.push(tokenBox);
  }
  root.appendChild(h('div', { class: 'set' }, parts));
  mountGoogle();
}
