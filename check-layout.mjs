// Kontrola přetékání: vypíše slidy, kde obsah zasahuje do patičky nebo přetéká.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = resolve(import.meta.dirname);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
let bad = 0;
for (const f of readdirSync(dir).filter((n) => /^post-.*\.html$/.test(n))) {
  await page.goto(pathToFileURL(resolve(dir, f)).href);
  await page.evaluate(() => document.fonts.ready);
  const res = await page.evaluate(() => [...document.querySelectorAll('.slide')].map((s, i) => {
    const main = s.querySelector('.main'); const bot = s.querySelector('.bot');
    const botTop = bot.getBoundingClientRect().top;
    let maxBottom = 0;
    for (const el of main.querySelectorAll('*')) maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom);
    const overflowX = [...s.querySelectorAll('*')].some((el) => el.getBoundingClientRect().right > s.getBoundingClientRect().right + 1);
    return { i: i + 1, gap: Math.round(botTop - maxBottom), overflowX, mainOver: main.scrollHeight > main.clientHeight + 2 };
  }));
  for (const r of res) if (r.gap < 16 || r.overflowX || r.mainOver) { bad++; console.log(`${f} slide ${r.i}: mezera k patičce ${r.gap}px${r.overflowX ? ', přetéká do strany' : ''}${r.mainOver ? ', přetéká' : ''}`); }
}
await browser.close();
console.log(bad ? `${bad} slidů k opravě` : 'Všechny slidy v pořádku');
