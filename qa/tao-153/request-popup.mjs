// TAO-153 C0: request-popup layout check at 320x460, 320x568 and 568x320.
// Runs the local dev-tools web build (VITE_DEVTOOLS=1 npm run build). The script starts its own static server.
// Each viewport gets a screenshot and a pass/fail row: modal top on screen, whole popup fits or scrolls to its
// close button, close button tappable, and no horizontal overflow.
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
  const row = { view, req, pass: !!pass, evidence: String(evidence).replace(/\s+/g, ' ').slice(0, 400) };
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
    try { await page.click(`[data-view="${view}"]`, { timeout: 3000 }); return true; } catch { /* a popup still covers the nav */ }
  }
  return false;
};

const devClick = async (page, id) => {
  if (!(await goView(page, 'shop'))) throw new Error('shop nav not reachable');
  await page.click('#' + id, { timeout: 8000 });
  if (/^dev-day/.test(id)) await page.waitForLoadState('load', { timeout: 60000 });
  else await page.waitForTimeout(600);
};

async function openRequest(page, base) {
  await page.goto(base + '?devlv=7', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1400);
  await dismissModals(page);
  await devClick(page, 'dev-unlock'); // two copies of every item, so the picker has spares
  await devClick(page, 'dev-day-next'); // a fresh board with request letters
  await page.waitForTimeout(1200);
  if (!(await goView(page, 'town'))) throw new Error('town nav not reachable');
  const req = page.locator('[data-req]').first();
  await req.waitFor({ state: 'attached', timeout: 30000 });
  // The street bubble wobbles forever and a short-landscape panel can cover its centre; a DOM click still
  // exercises the same delegated handler and keeps this check about the popup layout.
  await req.evaluate(el => el.click());
  await page.waitForSelector('#modal-root .modal-back .pickgrid', { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function measure(page) {
  return await page.evaluate(() => {
    const back = document.querySelector('#modal-root .modal-back');
    const modal = back.querySelector('.modal');
    const pick = modal.querySelector('.pickgrid');
    const close = modal.querySelector('[data-close]');
    back.scrollTop = 0;
    const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
    const before = { modal: r(modal), pick: r(pick), close: r(close) };
    back.scrollTop = back.scrollHeight;
    const cr = r(close);
    const cx = (cr.left + cr.right) / 2, cy = (cr.top + cr.bottom) / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      vw: innerWidth, vh: innerHeight,
      scrollTop: Math.round(back.scrollTop), scrollHeight: back.scrollHeight, clientHeight: back.clientHeight,
      docW: document.documentElement.scrollWidth,
      before,
      afterScroll: { close: cr, hitInside: !!(hit && close.contains(hit)) },
    };
  });
}

const server = await serve(ROOT);
let BASE = 'http://127.0.0.1:' + server.address().port + '/';
if (process.env.QA_BASE) { server.close(); BASE = process.env.QA_BASE.replace(/\/$/, '') + '/'; }
console.log('QA base: ' + BASE);

const VIEWS = [
  { name: '320x460', width: 320, height: 460 },
  { name: '320x568', width: 320, height: 568 },
  { name: '568x320', width: 568, height: 320 },
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
    page.setDefaultTimeout(20000);
    try {
      await openRequest(page, BASE);
      await page.screenshot({ path: join(OUT, 'request-' + v.name + '.png') });
      const m = await measure(page);
      const modalTop = m.before.modal.top;
      const fits = m.before.modal.top >= 0 && m.before.modal.bottom <= m.vh + 1;
      R(v.name, 'modal top is on screen', modalTop >= 0, 'top=' + modalTop + ' vh=' + m.vh);
      R(v.name, 'whole popup fits in the visible viewport', fits,
        'modal=' + m.before.modal.top + '..' + m.before.modal.bottom + ' vh=' + m.vh +
        ' pickgrid=' + m.before.pick.height + ' scroll=' + m.scrollHeight + '/' + m.clientHeight);
      R(v.name, 'close button on screen and tappable after scrolling', m.before.close.bottom <= m.vh + 1 && m.afterScroll.close.bottom <= m.vh + 1 && m.afterScroll.hitInside,
        'before=' + m.before.close.top + '..' + m.before.close.bottom + ' after=' + m.afterScroll.close.top + '..' + m.afterScroll.close.bottom + ' hit=' + m.afterScroll.hitInside);
      R(v.name, 'no horizontal overflow', m.docW <= m.vw + 1, 'doc=' + m.docW + ' vw=' + m.vw);
    } catch (e) {
      await page.screenshot({ path: join(OUT, 'request-' + v.name + '-fail.png') }).catch(() => {});
      const counts = await page.evaluate(() => ({
        view: document.querySelector('[aria-current="page"]')?.getAttribute('data-view'),
        reqs: document.querySelectorAll('[data-req]').length,
        modal: document.querySelectorAll('#modal-root .modal').length,
        text: (document.querySelector('#modal-root')?.textContent || '').slice(0, 120),
      })).catch(() => null);
      R(v.name, 'request popup opens', false, e.message.split('\n')[0] + ' | ' + JSON.stringify(counts));
    }
    await ctx.close();
  }
  const failed = results.filter(r => !r.pass);
  console.log('\n' + (failed.length ? 'FAILED: ' + failed.length + ' of ' + results.length : 'ALL ' + results.length + ' CHECKS PASS'));
  process.exitCode = failed.length ? 1 : 0;
} finally {
  if (browser) await browser.close();
  if (!process.env.QA_BASE) server.close();
}
