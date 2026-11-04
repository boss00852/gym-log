export function makeH(doc) {
  return function h(tag, attrs, kids) {
    const e = doc.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'value') e.value = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    (kids || []).forEach((c) => {
      if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return e;
  };
}

export function svg(doc, size, pathD, stroke, extra) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = doc.createElementNS(ns, 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', stroke);
  s.setAttribute('stroke-width', '2.2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  (Array.isArray(pathD) ? pathD : [pathD]).forEach((d) => {
    const p = doc.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    if (extra) p.setAttribute('stroke', extra);
    s.appendChild(p);
  });
  return s;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const empty = (v) => v === '' || v === null || v === undefined;
export const isNum = (v) => !empty(v) && !isNaN(Number(String(v).replace(',', '.')));
export const toNum = (v) => Number(String(v).replace(',', '.'));
export const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
