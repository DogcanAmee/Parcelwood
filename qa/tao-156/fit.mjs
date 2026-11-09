// TAO-156 B3: the 6-series fit at 320 / 390 / 1440. Runs the local dev-tools web build by default
// (VITE_DEVTOOLS=1 npm run build), or a live preview with QA_BASE=https://... .
// Seeds a Lv8 save with all six series unlocked, then measures album tabs, album cards, street shops and
// the parcel crates, and writes screenshots plus result.json.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(join(import.meta.dirname, '../../dist'));
const OUT = join(import.meta.dirname, 'screens');
const RESULT = join(import.meta.dirname, 'result.json');
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serve(dir) {
  return new Promise(resolveServer => {
    const server = createServer((req, res) => {
      let pathname = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.)+/, '');
      let file = join(dir, pathname);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

async function launch() {
  try { return await chromium.launch({ headless: true }); }
  catch { try { return await chromium.launch({ headless: true, channel: 'chrome' }); }
    catch { return await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); } }
}

const results = [];
const R = (view, req, pass, evidence) => {
  const row = { view, req, pass: !!pass, evidence: String(evidence).replace(/\s+/g, ' ').slice(0, 500) };
  results.push(row);
  console.log((row.pass ? 'PASS' : 'FAIL') + ' | ' + view + ' | ' + req + ' | ' + row.evidence);
  writeFileSync(RESULT, JSON.stringify(results, null, 2));
};

const dismissModals = async page => {
  for (let i = 0; i < 10; i++) {
    if (!(await page.locator('#modal-root .modal-back').count())) return;
    const close = page.locator('#modal-root .modal-back [data-close]').last();
    const any = page.locator('#modal-root .modal-back button:visible').last();
    try { await (await close.count() ? close : any).click({ timeout: 800 }); } catch { return; }
    await page.waitForTimeout(250);
  }
};

const goView = async (page, view) => {
  for (let i = 0; i < 12; i++) {
    await dismissModals(page);
    const btn = page.locator(`[data-view="${view}"]`).first();
    if (!(await btn.count())) return false;
    await btn.evaluate(el => el.click());
    await page.waitForTimeout(350);
    if (await page.locator(`[data-view="${view}"]`).first().getAttribute('aria-current')) return true;
  }
  return false;
};

const seed = page => page.evaluate(() => {
  // A direct device save is a top-level object with v:1 and town. The account mirror is { state: {...} }, so skip it.
  const entries = Object.keys(localStorage).map(k => ({ k, raw: localStorage.getItem(k) || '' }));
  const found = entries.map(x => {
    try { return { ...x, obj: JSON.parse(x.raw) }; } catch { return { ...x, obj: null }; }
  }).filter(x => x.obj && x.obj.v === 1 && x.obj.town);
  found.sort((a, b) => b.raw.length - a.raw.length);
  if (!found.length) return null;
  const { k, obj } = found[0];
  const lost = ['tied-parcel', 'sealed-letter', 'wax-stamp', 'postal-key', 'return-to-sender-tag', 'mail-pouch', 'pocket-watch', 'paper-crane'];
  const owned = { ...(obj.owned || {}) };
  for (const id of lost) owned[id] = Math.max(1, owned[id] || 0);
  const s = {
    ...obj,
    introSeen: true, guideSeen: true,
    hintsSeen: ['town', 'album', 'shop', 'daily', 'rush', 'week'],
    firstGoals: { started: true, done: [], off: true },
    stats: { ...(obj.stats || {}), opened: Math.max(100, obj.stats?.opened || 0) },
    town: { ...obj.town, rep: 900, level: 7 },
    unlocked: ['snacks', 'toys', 'souvenirs', 'garden', 'market'],
    completed: [],
    owned,
  };
  localStorage.setItem(k, JSON.stringify(s));
  return { keyLength: k.length, owned };
});

const rect = el => el.getBoundingClientRect();

async function measureAlbum(page) {
  return page.evaluate(() => {
    const book = document.querySelector('.scene.book');
    const marks = document.querySelector('.marks');
    const pageEl = document.querySelector('.page');
    const sbook = document.querySelector('.sbook');
    const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
    const tabs = [...document.querySelectorAll('.marks [data-tab]')].map(x => ({ id: x.dataset.tab, ...r(x) }));
    return {
      vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth,
      book: r(book), marks: r(marks), page: r(pageEl), sbook: r(sbook), tabs,
      seriesTabs: tabs.filter(t => t.id !== 'rush'),
      cards: document.querySelectorAll('.sbook .stk-slot').length,
      pageScrollWidth: pageEl.scrollWidth, pageClientWidth: pageEl.clientWidth,
      marksScrollWidth: marks.scrollWidth, marksClientWidth: marks.clientWidth,
    };
  });
}

async function measureStreet(page) {
  return page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
    const street = document.querySelector('.street');
    const shops = [...document.querySelectorAll('.street .shop')].map(r);
    return {
      vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth,
      street: street ? r(street) : null, shops,
      rows: [...new Set(shops.map(s => s.top))].length,
      streetScrollWidth: street ? street.scrollWidth : 0, streetClientWidth: street ? street.clientWidth : 0,
    };
  });
}

async function measureParcel(page) {
  return page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
    const crates = document.querySelector('.pick.crates');
    const open = document.querySelector('#go-open');
    return {
      vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth,
      crates: crates ? r(crates) : null, crateCount: document.querySelectorAll('.pick.crates .crate').length,
      open: open ? r(open) : null,
      cratesScrollWidth: crates ? crates.scrollWidth : 0, cratesClientWidth: crates ? crates.clientWidth : 0,
      docH: document.documentElement.scrollHeight,
    };
  });
}

const server = await serve(ROOT);
let BASE = 'http://127.0.0.1:' + server.address().port + '/';
if (process.env.QA_BASE) { server.close(); BASE = process.env.QA_BASE.replace(/\/$/, '') + '/'; }
console.log('QA base: ' + BASE);

const VIEWS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '1440x900', width: 1440, height: 900 },
];

let browser;
try {
  browser = await launch();
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      localStorage.setItem('parcelStation.lang', 'en');
      if (!localStorage.getItem('parcelwood.age')) localStorage.setItem('parcelwood.age', 'ok');
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    try {
      // A Lv7 save at 900 reputation gets exactly one Lv8 popup. This works on the production-mode web build too.
      await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1500);
      await dismissModals(page);
      if (!(await seed(page))) throw new Error('no direct device save key found');
      await page.reload({ waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1800);
      if (await page.locator('#level-up').count()) {
        const txt = (await page.locator('#modal-root').innerText()).replace(/\s+/g, ' ');
        R(v.name, 'Lv8 level-up popup names the Lost Letter Office', txt.includes('Lv 8') && txt.includes('Lost Letter Office'), txt.slice(0, 300));
        await page.screenshot({ path: join(OUT, 'level-up-' + v.name + '.png'), fullPage: true });
      } else {
        R(v.name, 'Lv8 level-up popup names the Lost Letter Office', false, 'no #level-up popup after a Lv7 save at 900 reputation');
      }
      await dismissModals(page);
      const skip = page.locator('#coach-skip');
      if (await skip.count()) { await skip.evaluate(el => el.click()); await page.waitForTimeout(200); }
      await dismissModals(page);

      if (!(await goView(page, 'album'))) throw new Error('album nav not reachable');
      await page.locator('.marks [data-tab="lost-letter-office"]').evaluate(el => el.click());
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, 'album-' + v.name + '.png'), fullPage: true });
      const a = await measureAlbum(page);
      R(v.name, 'six series tabs on the album', a.seriesTabs.length === 6 && a.seriesTabs.every(t => t.width > 0),
        a.seriesTabs.map(t => t.id + '@' + t.left + '-' + t.right).join(', '));
      R(v.name, 'album has no horizontal overflow', a.docW <= a.vw + 1 && a.marksScrollWidth <= a.marksClientWidth + 1 && a.pageScrollWidth <= a.pageClientWidth + 1,
        'doc=' + a.docW + '/' + a.vw + ' marks=' + a.marksScrollWidth + '/' + a.marksClientWidth + ' page=' + a.pageScrollWidth + '/' + a.pageClientWidth);
      R(v.name, 'album tabs stay inside the book', a.seriesTabs.every(t => t.left >= a.book.left - 1 && t.right <= a.book.right + 1),
        'book=' + a.book.left + '..' + a.book.right + ' tabs=' + a.seriesTabs.map(t => t.left + '..' + t.right).join(', '));
      R(v.name, 'new series page shows 8 cards', a.cards === 8, 'cards=' + a.cards);

      if (!(await goView(page, 'station'))) throw new Error('station nav not reachable');
      await page.waitForFunction(() => document.querySelectorAll('.street .shop').length === 6, null, { timeout: 15000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, 'street-' + v.name + '.png'), fullPage: true });
      const st = await measureStreet(page);
      R(v.name, 'street shows 6 shops, no horizontal overflow', st.shops.length === 6 && st.docW <= st.vw + 1 && st.streetScrollWidth <= st.streetClientWidth + 1,
        'shops=' + st.shops.length + ' rows=' + st.rows + ' doc=' + st.docW + '/' + st.vw + ' street=' + st.streetScrollWidth + '/' + st.streetClientWidth);
      R(v.name, '6 shops fit inside the street panel', st.shops.every(s => s.left >= st.street.left - 1 && s.right <= st.street.right + 1),
        'street=' + st.street.left + '..' + st.street.right + ' shops=' + st.shops.map(s => s.left + '..' + s.right).join(', '));

      const slot = page.locator('.shelf .slot:not(.empty):not(.urgent)').first();
      await slot.waitFor({ state: 'attached', timeout: 20000 });
      await slot.evaluate(el => el.click());
      await page.waitForSelector('#go-open', { timeout: 20000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, 'parcel-' + v.name + '.png'), fullPage: true });
      const p = await measureParcel(page);
      R(v.name, 'guess crates hold 6 series without horizontal overflow', p.crateCount === 6 && p.docW <= p.vw + 1 && p.cratesScrollWidth <= p.cratesClientWidth + 1,
        'crates=' + p.crateCount + ' doc=' + p.docW + '/' + p.vw + ' crates=' + p.cratesScrollWidth + '/' + p.cratesClientWidth);
      R(v.name, 'Open button reachable with at most one screen of scroll', p.open && p.open.bottom <= p.vh * 2 + 1,
        'open=' + (p.open ? p.open.top + '..' + p.open.bottom : 'missing') + ' vh=' + p.vh + ' docH=' + p.docH);
    } catch (e) {
      await page.screenshot({ path: join(OUT, 'fail-' + v.name + '.png'), fullPage: true }).catch(() => {});
      const dbg = await page.evaluate(() => ({
        view: document.querySelector('[aria-current="page"]')?.getAttribute('data-view'),
        shops: document.querySelectorAll('.street .shop').length,
        navs: [...document.querySelectorAll('[data-view]')].map(x => x.getAttribute('data-view')),
        modal: document.querySelector('#modal-root')?.textContent?.slice(0, 120) || '',
        body: (document.body.innerText || '').slice(0, 240),
      })).catch(err => ({ err: err.message }));
      R(v.name, 'fit checks ran', false, e.message.split('\n')[0] + ' | ' + JSON.stringify(dbg));
    }
    await ctx.close();
  }
  const failed = results.filter(r => !r.pass);
  console.log('\n' + (failed.length ? 'FAILED: ' + failed.length + ' of ' + results.length : 'ALL ' + results.length + ' CHECKS PASS'));
  process.exitCode = failed.length ? 1 : 0;
} finally {
  if (browser) await browser.close();
}
