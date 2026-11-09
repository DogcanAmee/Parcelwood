// TAO-54 QA: M1 onboarding on a live preview or a local build.
// Checks words under the bottom buttons, one-tap currency help, the three goals after the first parcel,
// the one-time tips for Town / Album / Shop / new systems, and the labels on the action buttons.
// Usage: node qa/tao-54.mjs [--base https://...] [--out qa/tao-54/screens]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
const BASE_ARG = arg('--base', '');
const DIR = resolve(arg('--dir', 'dist'));
const OUT = resolve(arg('--out', 'qa/tao-54/screens'));
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serve(dir) {
  return new Promise(done => {
    const server = createServer((req, res) => {
      let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = normalize(join(dir, pathname));
      if (!file.startsWith(dir + '/') || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => done({ server, base: 'http://127.0.0.1:' + server.address().port + '/' }));
  });
}

const results = [];
const check = (ok, label, detail = '') => { results.push({ ok, label, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? '  ·  ' + detail : '')); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, name), fullPage: false }); console.log('SHOT ' + name); };

async function boot(browser, base, viewport, locale = 'en-US') {
  const context = await browser.newContext({ viewport, locale });
  await context.addInitScript(() => { try { localStorage.setItem('parcelwood.age', 'ok'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await wait(500);
  return { context, page, errors };
}

async function closeModal(page) {
  const close = page.locator('#modal-root [data-close]').first();
  if (await close.count()) { await close.click(); await wait(250); }
}

async function firstParcel(page) {
  const parcel = page.locator('[data-guide="parcel"]').first();
  if (!(await parcel.count())) return false;
  await parcel.click();
  await wait(300);
  const shake = page.locator('[data-tool="shake"]');
  if (await shake.count()) { await shake.click(); await wait(250); }
  const open = page.locator('#go-open');
  if (await open.count()) { await open.click(); await wait(250); }
  const skip = page.locator('#skip');
  if (await skip.count()) { await skip.click(); await wait(1800); }
  const back = page.locator('#back-shelf');
  if (await back.count()) { await back.click(); await wait(500); }
  return true;
}

async function hintsFlow(page, prefix) {
  const names = [['town', 'town'], ['album', 'album'], ['shop', 'shop']];
  for (const [view, name] of names) {
    await page.locator(`#nav-in [data-view="${view}"]`).click();
    await wait(450);
    const bubble = page.locator('#hint-root .coach-bubble');
    const shown = await bubble.count() > 0;
    check(shown, `${name}: first visit shows a tip`);
    if (shown) await shot(page, `${prefix}-${name}-hint.png`);
    if (await page.locator('#hint-skip').count()) { await page.locator('#hint-skip').click(); await wait(300); }
  }
  await page.locator('#nav-in [data-view="town"]').click();
  await wait(350);
  check(await page.locator('#hint-root .coach-bubble').count() === 0, 'town: the tip does not return on a later visit');
}

async function main() {
  let local = null;
  const base = BASE_ARG || (local = await serve(DIR)).base;
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  try {
    const { context, page, errors } = await boot(browser, base, { width: 390, height: 844 });
    const nav = await page.locator('#nav-in .nl').allTextContents();
    check(nav.join('|') === 'Station|Town|Album|Shop', 'bottom buttons have words', nav.join(', '));
    await shot(page, '01-station-nav.png');

    for (const kind of ['coin', 'shard', 'gem']) {
      await page.locator(`[data-money="${kind}"]`).click();
      await wait(250);
      check(await page.locator('#modal-root .modal').count() > 0, `${kind}: tap opens an explanation`);
      if (kind === 'coin') await shot(page, '02-currency-info.png');
      await closeModal(page);
    }

    const walked = await firstParcel(page);
    check(walked, 'first parcel walkthrough runs');
    const goals = page.locator('#next-goals');
    check(await goals.count() > 0, 'three short goals appear after the first parcel');
    if (await goals.count()) {
      check((await goals.textContent()).includes('Guess one series right'), 'the first goal asks for a series guess');
      await shot(page, '03-next-goals.png');
    }

    await hintsFlow(page, '04');
    check(errors.length === 0, 'no page errors on the fresh-save run', errors.join(' | '));

    await page.close();
    const devPage = await context.newPage();
    const devErrors = [];
    devPage.on('pageerror', e => devErrors.push(String(e)));
    await devPage.goto(`${base}?devlv=4`, { waitUntil: 'networkidle' });
    await wait(500);
    await closeModal(devPage);
    await wait(600);
    const firstTip = devPage.locator('#hint-root .coach-bubble');
    check(await firstTip.count() > 0, 'a new system shows a tip once after the level-up popup');
    if (await firstTip.count()) await shot(devPage, '06-new-feature-hint.png');
    if (await devPage.locator('#hint-skip').count()) { await devPage.locator('#hint-skip').click(); await wait(400); }
    const rush = devPage.locator('#nav-in [data-view="rush"]');
    check(await rush.count() > 0, 'Rush Hour appears at Lv4 in the preview');
    if (await rush.count()) await shot(devPage, '07-rush-unlocked.png');
    check(devErrors.length === 0, 'no page errors after the level jump', devErrors.join(' | '));
    await context.close();

    const wide = await boot(browser, base, { width: 1280, height: 800 });
    const overflow = await wide.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(!overflow, 'desktop: no horizontal scroll');
    await shot(wide.page, '05-desktop-nav.png');
    await wide.context.close();

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${OUT}`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
    if (local) local.server.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
