import { svg } from './util.js';
import { validApiUrl } from './api.js';

export function renderSettings(app, first = false) {
  const { h, doc, api } = app;
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
    app.authBad = false;
    app.q.resume();
    app.updateBadge();
    app.moreError = false;
    app.showHome();
    app.refresh();
  }

  const back = first && !api.configured() ? null : h('button', { class: 'bk', type: 'button', 'aria-label': 'ย้อนกลับ', onclick: () => app.showHome() }, [svg(doc, 24, 'M15 5l-7 7 7 7', '#F2F4F7')]);
  root.appendChild(h('div', { class: 'stk' }, [h('div', { class: 'r1' }, [back, h('div', { style: 'font-size:17px;font-weight:600;padding-left:4px', text: 'ตั้งค่าการเชื่อมต่อ' })])]));
  root.appendChild(h('div', { class: 'set' }, [
    h('p', { class: 'note2', text: 'ใส่ URL ของ Apps Script Web App และ token (ตั้งไว้ใน Script Property “API_TOKEN”) ค่าทั้งสองเก็บในเครื่องนี้เท่านั้น ไม่ถูกส่งไปที่อื่นนอกจากเซิร์ฟเวอร์ของคุณ' }),
    h('label', { class: 'fld' }, ['API URL', urlIn]),
    h('label', { class: 'fld' }, ['API token', tokIn]),
    res,
    h('button', { class: 'btn ghost', type: 'button', id: 's-test', text: 'ทดสอบการเชื่อมต่อ', onclick: test }),
    h('button', { class: 'btn', type: 'button', id: 's-save', text: 'บันทึก', onclick: save })
  ]));
}
