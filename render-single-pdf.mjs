// One PDF per slide of post 1 -> out/pdf-jednotlive/
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = resolve(import.meta.dirname);
const out = resolve(dir, 'out', 'pdf-jednotlive');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto(pathToFileURL(resolve(dir, 'post-1-audit-25-eshopu.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const n = await page.locator('.slide').count();
for (let i = 0; i < n; i++) {
  await page.evaluate((k) => document.querySelectorAll('.slide').forEach((s, j) => { s.style.display = j === k ? 'flex' : 'none'; }), i);
  await page.pdf({ path: resolve(out, `post-1-slide-${String(i + 1).padStart(2, '0')}.pdf`), width: '1080px', height: '1350px', printBackground: true });
}
await browser.close();
console.log(n);
