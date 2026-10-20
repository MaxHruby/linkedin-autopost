// Publikuje posty z calendar.json na tvůj osobní LinkedIn přes oficiální LinkedIn API (zdarma).
// Běží v GitHub Actions (viz .github/workflows/publish.yml), takže nepotřebuješ zapnutý notebook.
//
//   node publish.mjs                 suchý běh: zkontroluje soubory, texty a data, nic neodesílá
//   node publish.mjs --whoami        ověří token a vypíše tvoje LINKEDIN_PERSON_URN (použij při nastavení)
//   node publish.mjs --send          publikuje posty, kterým už nastal čas a ještě nevyšly
//   node publish.mjs --send --only p1-audit-25-eshopu    publikuje konkrétní post hned (i mimo čas)
//
// Tajné hodnoty (nikdy do gitu ani do chatu): LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN.
// Lokálně je dej do linkedin/.env, v GitHubu do Secrets.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname);
const env = { ...process.env };
const envFile = resolve(dir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const API = env.LINKEDIN_API || 'https://api.linkedin.com'; // LINKEDIN_API jen pro testy proti falešnému serveru
const VERSION = env.LINKEDIN_VERSION || '202610';
const TOKEN = env.LINKEDIN_ACCESS_TOKEN;
const PERSON = env.LINKEDIN_PERSON_URN; // urn:li:person:xxxx
const args = process.argv.slice(2);
const send = args.includes('--send');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const MAX_LATE_HOURS = 24; // zameškaný post starší než tohle se sám nepublikuje (ochrana proti hromadnému vypuštění po výpadku)

const stateDir = resolve(dir, 'state');
const stateFile = resolve(stateDir, 'published.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const saveState = () => { mkdirSync(stateDir, { recursive: true }); writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n'); };

async function li(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Linkedin-Version': VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${text.slice(0, 700)}`);
  return { res, json: text ? JSON.parse(text) : null };
}

async function putFile(uploadUrl, file) {
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body: readFileSync(file) });
  if (!res.ok) throw new Error(`Nahrání souboru selhalo: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// Pole commentary používá LinkedIn "little text format": tyto znaky musí mít zpětné lomítko,
// jinak LinkedIn text za závorkou odřízne nebo změní.
const escapeCommentary = (t) => t.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);

// "2026-10-29 08:00" v dané časové zóně -> ISO v UTC (počítá se změnou letního času)
function zonedToUtc(str, tz) {
  const [d, t] = str.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const target = Date.UTC(y, mo - 1, da, h, mi);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date(guess)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]),
    );
    guess -= Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - target;
  }
  return new Date(guess);
}

async function waitAvailable(kind, urn) {
  for (let i = 0; i < 15; i++) {
    try {
      const { json } = await li(`/rest/${kind}/${encodeURIComponent(urn)}`);
      if (json.status === 'AVAILABLE') return;
      if (json.status === 'PROCESSING_FAILED') throw new Error(`LinkedIn nezpracoval ${urn} (PROCESSING_FAILED)`);
    } catch (e) {
      if (String(e.message).includes('PROCESSING_FAILED')) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function uploadMedia(p) {
  if (!p.document && !p.image) return null; // jen text
  if (p.document) {
    const { json } = await li('/rest/documents?action=initializeUpload', { method: 'POST', body: { initializeUploadRequest: { owner: PERSON } } });
    await putFile(json.value.uploadUrl, resolve(dir, p.document.path));
    await waitAvailable('documents', json.value.document);
    return { title: p.document.title, id: json.value.document };
  }
  const { json } = await li('/rest/images?action=initializeUpload', { method: 'POST', body: { initializeUploadRequest: { owner: PERSON } } });
  await putFile(json.value.uploadUrl, resolve(dir, p.image.path));
  await waitAvailable('images', json.value.image);
  return { id: json.value.image, ...(p.image.alt ? { altText: p.image.alt } : {}) };
}

async function publish(p) {
  const media = await uploadMedia(p);
  const { res } = await li('/rest/posts', {
    method: 'POST',
    body: {
      author: PERSON,
      commentary: escapeCommentary(p.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(media ? { content: { media } } : {}),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
  });
  const urn = res.headers.get('x-restli-id');
  state[p.id] = { urn, publishedAt: new Date().toISOString() };
  saveState(); // hned, aby se post při pozdější chybě nikdy nepublikoval dvakrát
  console.log(`PUBLIKOVÁNO: ${p.id} -> ${urn}`);
  if (p.firstComment && urn) {
    try {
      await li(`/rest/socialActions/${encodeURIComponent(urn)}/comments`, { method: 'POST', body: { actor: PERSON, message: { text: p.firstComment } } });
      console.log('  první komentář přidán');
    } catch (e) {
      console.log(`  VAROVÁNÍ: první komentář se nepodařilo přidat (post je venku): ${e.message}`);
    }
  }
}

if (args.includes('--whoami')) {
  if (!TOKEN) throw new Error('Chybí LINKEDIN_ACCESS_TOKEN');
  const res = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await res.json();
  if (!res.ok) throw new Error(`Token nefunguje: ${res.status} ${JSON.stringify(j)}`);
  console.log(`Přihlášen jako: ${j.name}\nLINKEDIN_PERSON_URN=urn:li:person:${j.sub}`);
  await new Promise((r) => setTimeout(r, 100)); // na Windows jinak končí hláškou z libuv
  process.exit(0);
}

// upozornění na blížící se expiraci tokenu (LinkedIn tokeny platí 60 dní)
if (env.LINKEDIN_TOKEN_EXPIRES) {
  const left = Math.ceil((new Date(env.LINKEDIN_TOKEN_EXPIRES) - Date.now()) / 86400000);
  console.log(`Token vyprší za ${left} dní (${env.LINKEDIN_TOKEN_EXPIRES}).`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `token_days_left=${left}\n`);
}

if (send && env.PUBLISHING_PAUSED === 'true') {
  console.log('Publikování je pozastaveno (proměnná PUBLISHING_PAUSED=true). Nic se nepublikuje.');
  process.exit(0);
}

const cal = JSON.parse(readFileSync(resolve(dir, 'calendar.json'), 'utf8'));
const now = new Date();
let problems = 0;
const plan = [];
for (const p of cal.posts.filter((x) => !only || x.id === only)) {
  const when = zonedToUtc(p.when, cal.timezone);
  const issues = [];
  const file = p.document?.path || p.image?.path;
  if (file && !existsSync(resolve(dir, file))) issues.push(`chybí soubor ${file}`);
  if (p.document && !p.document.title) issues.push('document potřebuje "title"');
  if (p.text.length > 3000) issues.push(`text má ${p.text.length} znaků (limit je 3000)`);
  const published = Boolean(state[p.id]);
  const late = (now - when) / 3600000;
  let status = 'čeká';
  if (published) status = 'už vyšlo';
  else if (p.hold) status = 'ZADRŽENO (hold)';
  else if (when <= now) status = late > MAX_LATE_HOURS && !only ? `ZAMEŠKÁNO o ${Math.round(late)} h (nepublikuje se samo, použij --only)` : 'K PUBLIKACI TEĎ';
  problems += issues.length;
  plan.push({ ...p, when, issues, status, published });
  console.log(`${p.id}  ${p.when} (${when.toISOString()})  ${p.document ? 'carousel/PDF' : p.image ? 'obrázek' : 'jen text'}, ${p.text.length} znaků${p.firstComment ? ', + první komentář' : ''}\n  stav: ${status}`);
  for (const i of issues) console.log(`  PROBLÉM: ${i}`);
}

if (env.GITHUB_STEP_SUMMARY) {
  const next = plan.filter((p) => !p.published).slice(0, 8);
  const rows = next.map((p) => `| ${p.when.toLocaleString('cs-CZ', { timeZone: cal.timezone })} | ${p.id} | ${p.status} |`);
  appendFileSync(env.GITHUB_STEP_SUMMARY, ['### Nejbližší posty', '', '| Kdy (Praha) | Post | Stav |', '|---|---|---|', ...rows, ''].join('\n'));
}

if (!send) {
  console.log(problems ? `\nSuchý běh: ${problems} problémů.` : '\nSuchý běh v pořádku. Nic se neodeslalo.');
  process.exit(problems ? 1 : 0);
}

const due = plan.filter((p) => !p.published && !p.hold && (only ? true : p.when <= now && (now - p.when) / 3600000 <= MAX_LATE_HOURS));
if (problems) throw new Error('Nejdřív oprav problémy výše.');
if (!due.length) { console.log('Nic k publikaci.'); process.exit(0); }
if (!TOKEN || !PERSON) throw new Error('Chybí LINKEDIN_ACCESS_TOKEN nebo LINKEDIN_PERSON_URN (viz README.md)');
for (const p of due) await publish(p);
