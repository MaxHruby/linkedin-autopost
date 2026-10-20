// Kontaktní listy pro rychlou vizuální kontrolu: out/contact-*.png
import { chromium } from 'playwright-core';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = resolve(import.meta.dirname);
const pngs = readdirSync(resolve(dir, 'out')).filter((n) => /^post-.*\.png$/.test(n)).sort();
const groups = {};
for (const n of pngs) (groups[n.replace(/-\d\d\.png$/, '').replace(/-01\.png$/, '')] ||= []).push(n);
const names = Object.keys(groups);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (let s = 0; s < names.length; s += 3) {
  const part = names.slice(s, s + 3);
  const html = `<body style="margin:0;background:#888;font:14px sans-serif">${part.map((g) => `<div style="padding:6px"><div style="color:#fff">${g}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${groups[g].map((f) => `<img src="${pathToFileURL(resolve(dir, 'out', f)).href}" width="210">`).join('')}</div></div>`).join('')}</body>`;
  const p = resolve(dir, 'out', `contact-${s / 3 + 1}.html`);
  writeFileSync(p, html);
  await page.goto(pathToFileURL(p).href);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(dir, 'out', `contact-${s / 3 + 1}.png`), fullPage: true });
}
await browser.close();
console.log(names.length, 'postů');
