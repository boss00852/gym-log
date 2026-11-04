// สร้างไอคอน PNG จาก SVG ด้วย Playwright (รันครั้งเดียว): node tools/make-icons.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const glyph = (s) => `
<g transform="translate(${s / 2} ${s / 2}) scale(${s / 512})" fill="none" stroke="#C8F169" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
  <path d="M-110 0H110"/>
  <path d="M-110 -70V70M-160 -48V48M-200 -22V22" />
  <path d="M110 -70V70M160 -48V48M200 -22V22" />
</g>`;
const svg = (s, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
<rect width="${s}" height="${s}" rx="${round ? s * 0.22 : 0}" fill="#12151A"/>${glyph(s)}</svg>`;

const targets = [
  ['icons/icon-192.png', 192, true],
  ['icons/icon-512.png', 512, true],
  ['icons/apple-touch-icon.png', 180, false], // iOS ตัดมุมเอง
  ['icons/icon-maskable-512.png', 512, false] // เต็มพื้นที่ เนื้อหาอยู่ในโซนปลอดภัยตรงกลาง
];
const b = await chromium.launch();
const p = await b.newPage();
for (const [file, s, round] of targets) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<body style="margin:0;background:transparent">${svg(s, round)}</body>`);
  await p.screenshot({ path: file, omitBackground: true });
}
await b.close();
console.log('ok');
