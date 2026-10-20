// Renders every post-*.html: one PNG per .slide + one PDF (LinkedIn carousel upload).
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = resolve(import.meta.dirname);
const out = resolve(dir, 'out');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
for (const f of readdirSync(dir).filter((n) => /^post-.*\.html$/.test(n))) {
  await page.goto(pathToFileURL(resolve(dir, f)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const name = basename(f, '.html');
  const slides = await page.locator('.slide').all();
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: resolve(out, `${name}-${String(i + 1).padStart(2, '0')}.png`) });
  }
  if (slides.length > 1) await page.pdf({ path: resolve(out, `${name}.pdf`), width: '1080px', height: '1350px', printBackground: true });
  console.log(name, slides.length);
}
await browser.close();
