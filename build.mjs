// Z posts/*.json vyrobí HTML slidy (post-<id>.html). Pak: node render.mjs (PNG + PDF).
// Typy slidů: cover, point, list, statement, compare, cta. Zvýraznění v textu: *tohle*.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = (s) => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');
const plain = (s) => esc(s).replace(/\*(.+?)\*/g, '<b>$1</b>');
const size = (s, tiers) => tiers.find(([max]) => String(s).length <= max)[1];

const BRAND = '<span><span class="dot"></span><b>Max Hrubý</b> · Automatizace, AI a weby</span>';

function slide(s, i, n, post) {
  const dark = s.dark || s.type === 'cta' ? false : s.dark;
  const cls = `slide${s.dark ? ' dark' : ''}`;
  const top = `<div class="top">${BRAND}<span>${n > 1 ? `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}` : esc(post.label || '')}</span></div>`;
  const bot = (l, r) => `<div class="bot"><span>${esc(l)}</span><span>${esc(r || 'mhruby.eu')}</span></div>`;
  let body = '';
  let foot = [post.label || 'Max Hrubý', 'mhruby.eu'];

  if (s.type === 'cover') {
    body = `<div class="main">
      <span class="tag" style="align-self:flex-start;margin-bottom:44px">${esc(s.kicker)}</span>
      <h1 style="font-size:${size(s.title, [[40, 124], [62, 108], [90, 94], [999, 80]])}px">${rich(s.title)}</h1>
      <p class="lead" style="margin-top:44px">${plain(s.sub)}</p></div>`;
    foot = [n > 1 ? 'Listujte dál' : post.label, 'mhruby.eu'];
  } else if (s.type === 'point') {
    body = `<div class="main top-aligned" style="justify-content:center;padding-top:0">
      <div class="bignum" style="font-size:260px">${esc(s.n)}</div>
      <h2 style="margin-top:44px;font-size:${size(s.h, [[34, 84], [60, 72], [999, 62]])}px">${rich(s.h)}</h2>
      <p class="lead" style="margin-top:36px">${plain(s.p)}</p></div>`;
    foot = [s.foot || post.label, 'mhruby.eu'];
  } else if (s.type === 'list') {
    body = `<div class="main" style="justify-content:${s.items.length <= 3 ? 'center' : 'flex-start'};padding-top:${s.items.length <= 3 ? 0 : 52}px">
      <h2 style="font-size:${size(s.title, [[40, 84], [70, 72], [999, 64]])}px;margin-bottom:44px">${rich(s.title)}</h2>
      <div>${s.items.map((it, k) => `<div class="item"><div class="n">${k + 1}</div><div><h3>${plain(it.h)}</h3><p>${plain(it.p)}</p></div></div>`).join('')}</div></div>`;
    foot = [s.foot || post.label, 'mhruby.eu'];
  } else if (s.type === 'statement') {
    body = `<div class="main">
      <h2 style="font-size:${size(s.title, [[40, 92], [70, 80], [110, 70], [999, 62]])}px">${rich(s.title)}</h2>
      ${(Array.isArray(s.body) ? s.body : [s.body]).filter(Boolean).map((b, k) => `<p class="lead" style="margin-top:${k ? 28 : 48}px">${plain(b)}</p>`).join('')}</div>`;
    foot = [s.foot || post.label, 'mhruby.eu'];
  } else if (s.type === 'compare') {
    const col = (c, good) => `<div class="col"><div class="cap"${good ? '' : ' style="color:var(--muted)"'}><span class="x" style="background:${good ? 'var(--accent)' : 'var(--muted-2)'}"></span>${esc(c.label)}</div>
      <div class="panel${good ? ' good' : ''}">${c.items.map((t) => `<div class="pt">${plain(t)}</div>`).join('')}</div></div>`;
    body = `<div class="main" style="justify-content:flex-start;padding-top:52px">
      <h2 style="font-size:${size(s.title, [[40, 84], [999, 70]])}px;margin-bottom:48px">${rich(s.title)}</h2>
      <div style="display:flex;gap:28px;align-items:stretch">${col(s.left, false)}${col(s.right, true)}</div></div>`;
    foot = [s.foot || post.label, 'mhruby.eu'];
  } else if (s.type === 'cta') {
    body = `<div class="main">
      <h2 style="font-size:${size(s.title, [[40, 88], [999, 74]])}px">${rich(s.title)}</h2>
      ${s.lines.map((l, k) => `<p class="lead" style="margin-top:${k ? 28 : 44}px">${plain(l)}</p>`).join('')}
      ${s.chip ? `<p class="lead" style="margin-top:40px">Napište slovo <b style="background:var(--accent);padding:0 14px">${esc(s.chip)}</b>.</p>` : ''}
      <div class="rule" style="margin:52px 0 32px"></div>
      <div style="display:flex;align-items:center;gap:30px">
        <div style="width:124px;height:124px;border-radius:50%;background:var(--bg-2) url(../public/img/max-cut.webp) center top/cover;border:2px solid var(--ink)"></div>
        <div><div style="font-family:var(--display);font-size:48px;font-weight:600;letter-spacing:-.02em">Max Hrubý</div><div class="p muted" style="font-size:30px">Automatizace, AI agenti a weby · SiteSpot</div></div>
      </div></div>`;
    foot = [post.label || 'Max Hrubý', s.foot || 'mhruby.eu'];
  } else throw new Error(`Neznámý typ slidu: ${s.type}`);

  return `<section class="${cls}">${top}${body}${bot(foot[0], foot[1])}</section>`;
}

const css = `
.item{display:grid;grid-template-columns:104px 1fr;gap:26px;padding:30px 0;border-top:2px solid var(--ink)}
.item:last-child{border-bottom:2px solid var(--ink)}
.item .n{font-family:var(--display);font-weight:600;font-size:84px;line-height:.9;color:var(--accent)}
.item h3{font-family:var(--display);font-weight:600;font-size:46px;line-height:1.1;letter-spacing:-.02em}
.item p{font-size:31px;line-height:1.4;color:var(--ink-2);margin-top:12px}
.col{flex:1;display:flex;flex-direction:column}
.cap{font-weight:700;font-size:22px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:20px;display:flex;align-items:center;gap:12px}
.x{width:14px;height:14px;display:inline-block}
.panel{flex:1;border:2px solid var(--line);border-radius:6px;padding:30px 28px;display:flex;flex-direction:column;gap:26px}
.panel.good{border:2px solid var(--ink);background:var(--surface);box-shadow:8px 8px 0 var(--ink)}
.pt{font-size:31px;line-height:1.38;color:var(--ink-2)}
.panel:not(.good) .pt{color:var(--muted)}
`;

for (const f of readdirSync(resolve(dir, 'posts')).filter((x) => x.endsWith('.json'))) {
  const post = JSON.parse(readFileSync(resolve(dir, 'posts', f), 'utf8'));
  const n = post.slides.length;
  const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><title>${esc(post.id)}</title><link rel="stylesheet" href="style.css"><style>${css}</style></head>
<body>
${post.slides.map((s, i) => slide(s, i, n, post)).join('\n')}
</body></html>
`;
  writeFileSync(resolve(dir, `post-${post.id}.html`), html);
  console.log(`post-${post.id}.html (${n} slidů)`);
}
