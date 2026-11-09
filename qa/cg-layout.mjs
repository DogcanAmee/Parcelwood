// TAO-24 / CrazyGames layout + input + loading check.
// Runs the ten CrazyGames QA window sizes at dpr=1, visits every page and tab, opens the inspect, unbox and reveal
// sheets and the main popups, and writes screenshots plus a pass/fail table.
//
// Usage:
//   node qa/cg-layout.mjs                         # serves ../dist-crazygames-preview (mock ads build)
//   node qa/cg-layout.mjs --dir dist-crazygames    # serves a release build (also tests the SDK loading calls)
//   node qa/cg-layout.mjs --base http://127.0.0.1:4173/ --out qa/tao-24/screens
//
// Playwright is resolved from qa/node_modules. Set PLAYWRIGHT_BROWSERS_PATH if the browsers live outside the
// default cache. The script starts its own static server, so no separate `npm run preview` is needed.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
const ROOT = resolve(arg('--dir', 'dist-crazygames-preview'));
const OUT = resolve(arg('--out', 'qa/tao-24/screens'));
const BASE_ARG = arg('--base', '');
const QUIET = argv.includes('--quiet');
const ALL_SIZES = [
  [800, 450], [821, 462], [907, 510], [1077, 606], [1080, 607],
  [1216, 684], [1280, 720], [1366, 768], [1536, 864], [1920, 1080],
];
const sizeArg = arg('--sizes', '');
const SIZES = sizeArg
  ? sizeArg.split(',').map(s => s.trim()).filter(Boolean).map(s => s.split('x').map(Number)).filter(a => a.length === 2 && a.every(Number.isFinite))
  : ALL_SIZES;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serve(dir) {
  return new Promise(resolveServer => {
    const server = createServer((req, res) => {
      let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = normalize(join(dir, pathname));
      if (!file.startsWith(dir + '/') || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolveServer({ server, base: 'http://127.0.0.1:' + server.address().port + '/' }));
  });
}

const FAKE_SDK = `
window.__cgCalls = [];
window.CrazyGames = { SDK: {
  environment: 'local',
  init: function () { window.__cgCalls.push('init'); return Promise.resolve(); },
  ad: {
    requestAd: function (type, cb) { if (cb && cb.adError) cb.adError({ code: 'unfilled' }); },
    hasAdblock: function () { return Promise.resolve(false); },
  },
  game: {
    gameplayStart: function () { window.__cgCalls.push('gameplayStart'); },
    gameplayStop: function () { window.__cgCalls.push('gameplayStop'); },
    loadingStart: function () { window.__cgCalls.push('loadingStart'); },
    loadingStop: function () { window.__cgCalls.push('loadingStop'); },
    happytime: function () {},
    settings: { muteAudio: false },
    addSettingsChangeListener: function () {},
  },
  data: {
    getItem: function (k) { return localStorage.getItem('cg:' + k); },
    setItem: function (k, v) { localStorage.setItem('cg:' + k, v); },
    removeItem: function (k) { localStorage.removeItem('cg:' + k); },
  },
  user: { systemInfo: { locale: 'en-US' } },
} };
`;

async function launch() {
  try { return await chromium.launch({ headless: true }); }
  catch {
    try { return await chromium.launch({ headless: true, channel: 'chrome' }); }
    catch { return await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); }
  }
}

const results = [];
const rows = [];
const reasons = (m) => {
  const out = [];
  if (m.sh > m.ih + 1) out.push('page scrolls vertically (' + m.sh + '>' + m.ih + ')');
  if (m.sw > m.iw + 1) out.push('page scrolls horizontally (' + m.sw + '>' + m.iw + ')');
  if (m.navH < m.ih - 1) out.push('nav does not fill the height (' + m.navH + '<' + m.ih + ')');
  if (m.buttons.length) out.push('buttons outside viewport: ' + m.buttons.slice(0, 4).join(' | '));
  if (m.small.length) out.push('text under 12px: ' + m.small.slice(0, 4).join(' | '));
  if (m.clipped.length) out.push('clipped containers: ' + m.clipped.slice(0, 3).join(' | '));
  return out;
};

async function measure(page) {
  return await page.evaluate(() => {
    const visible = el => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const label = el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26);
    const doc = document.documentElement;
    const nav = document.querySelector('.nav');
    const navRect = nav ? nav.getBoundingClientRect() : null;
    const buttons = [...document.querySelectorAll('button, [data-parcel]')].filter(visible).map(el => {
      const r = el.getBoundingClientRect();
      return (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) ? label(el) : null;
    }).filter(Boolean);
    const small = [...document.querySelectorAll('body *')].filter(visible).filter(el => {
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      return size > 0 && size < 12 && (el.textContent || '').trim() && !el.closest('.sr') && cs.position !== 'absolute';
    }).map(el => label(el) + ' (' + getComputedStyle(el).fontSize + ')');
    const clipped = [...document.querySelectorAll('.panel, .scene, .sheet, .sheet-inner, .modal, .modal-back, .stage-page, .col-main, .col-side')]
      .filter(visible).filter(el => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
      .map(el => String(el.className).split(' ').slice(0, 2).join('.') + ' ' + el.scrollHeight + '/' + el.clientHeight + (el.scrollWidth > el.clientWidth + 2 ? ' x' + el.scrollWidth + '/' + el.clientWidth : ''));
    return {
      sh: doc.scrollHeight, sw: doc.scrollWidth, ih: innerHeight, iw: innerWidth,
      navH: navRect ? Math.round(navRect.height) : 0,
      buttons, small, clipped,
    };
  });
}

const FULL_SHOT_SIZES = new Set(['800x450', '907x510', '1920x1080']);
async function snapshot(page, sizeLabel, state, m) {
  const bad = reasons(m);
  const safe = state.replace(/[^\w.-]+/g, '-');
  const dir = join(OUT, sizeLabel);
  // Screenshots: every state at the three critical sizes, and the four default pages at every size.
  if (FULL_SHOT_SIZES.has(sizeLabel) || !state.includes(':')) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, safe + '.jpg'), type: 'jpeg', quality: 78 });
  }
  results.push({ size: sizeLabel, state, ok: bad.length === 0, bad, m });
  rows.push([sizeLabel, state, bad.length ? 'FAIL' : 'PASS', bad.join('; ')]);
}

async function closePopups(page) {
  for (let i = 0; i < 4; i++) {
    const close = page.locator('#modal-root [data-close], #modal-root .modal button').first();
    if (await close.count()) { await close.click().catch(() => {}); await page.waitForTimeout(120); }
    else { await page.evaluate(() => { const mb = document.getElementById('mb'); if (mb) mb.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await page.waitForTimeout(120); }
  }
}

async function clearModals(page) {
  await page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; });
}

async function openParcel(page) {
  const parcel = page.locator('#app [data-parcel]').first();
  if (!(await parcel.count())) return false;
  await parcel.click({ force: true, timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(400);
  const series = page.locator('[data-gs]').first();
  if (await series.count()) { await series.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(160); }
  const open = page.locator('#go-open').first();
  if (!(await open.count())) return false;
  await open.click({ force: true, timeout: 2000 }).catch(() => {});
  return true;
}

async function layoutSuite(browser, base, isReleaseBuild) {
  const fcpValues = [];
  for (const [w, h] of SIZES) {
    const sizeLabel = w + 'x' + h;
    if (!QUIET) process.stderr.write('size ' + sizeLabel + ' ...\n');
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-US' });
    const page = await context.newPage();
    if (isReleaseBuild) await page.route('https://sdk.crazygames.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}' });
    await page.waitForFunction(() => performance.getEntriesByType('paint').length > 0, null, { timeout: 3000 }).catch(() => {});
    const loadingSeen = await page.evaluate(() => !!document.getElementById('cg-loading'));
    await page.waitForFunction(() => document.querySelector('#app > *') || document.querySelector('#age-gate'), null, { timeout: 15000 }).catch(() => {});
    const fcp = await page.evaluate(() => { const all = performance.getEntriesByType('paint'); const e = all.find(x => x.name === 'first-contentful-paint') || all.find(x => x.name === 'first-paint'); return e ? Math.round(e.startTime) : null; });
    if (fcp !== null) fcpValues.push({ size: sizeLabel, fcp, loadingSeen });
    await page.waitForTimeout(500);
    // The first-run guide is a popup too: measure it before clearing the modal layer.
    if (await page.locator('#modal-root .modal').count()) {
      await snapshot(page, sizeLabel, 'popup-guide', await measure(page));
    }
    await clearModals(page);

    const states = [];
    for (const view of ['station', 'town', 'album', 'shop']) {
      await clearModals(page);
      const nav = page.locator('#nav-in button[data-view="' + view + '"]').first();
      if (await nav.count()) { await nav.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(80); }
      const tabs = page.locator('.stage-tabs button');
      const n = await tabs.count();
      if (!n) states.push({ name: view, click: null });
      else for (let i = 0; i < n; i++) {
        const tab = tabs.nth(i);
        const label = ((await tab.textContent()) || '').trim() || String(i + 1);
        states.push({ name: view + ': ' + label, click: async () => { await clearModals(page); await tab.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(70); } });
      }
    }
    for (const state of states) {
      if (!QUIET) process.stderr.write('  view ' + state.name + '\n');
      if (state.click) await state.click();
      await snapshot(page, sizeLabel, state.name, await measure(page));
    }

    // Inspect -> unbox -> reveal.
    await clearModals(page);
    await page.locator('#nav-in button[data-view="station"]').first().click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(120);
    if (await openParcel(page)) {
      await page.waitForTimeout(250); await snapshot(page, sizeLabel, 'inspect', await measure(page));
      await page.waitForTimeout(150); await snapshot(page, sizeLabel, 'unbox', await measure(page));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      const skip = page.locator('#skip');
      if (await skip.count()) { await skip.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); }
      if (await page.locator('#sheet-root .sheet').count()) await snapshot(page, sizeLabel, 'reveal', await measure(page));
      const back = page.locator('#back-shelf');
      if (await back.count()) { await back.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(200); }
    }

    // Main popups: help and odds.
    await clearModals(page);
    await page.locator('#nav-in button[data-view="station"]').first().click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(120);
    const help = page.locator('#help');
    if (await help.count()) {
      await help.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(160);
      await snapshot(page, sizeLabel, 'popup-help', await measure(page));
      await clearModals(page);
    }
    await clearModals(page);
    const oddsTab = page.locator('[data-stagetab="station:odds"]').first();
    if (await oddsTab.count()) {
      await oddsTab.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(120);
      const odds = page.locator('#open-odds').first();
      if (await odds.count()) {
        await odds.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(160);
        if (await page.locator('#modal-root .modal').count()) await snapshot(page, sizeLabel, 'popup-odds', await measure(page));
      }
    }
    await clearModals(page);

    // Long-list popups: a neighbouring story card and the street repairs card.
    const albumNav = page.locator('#nav-in button[data-view="album"]').first();
    if (await albumNav.count()) {
      await albumNav.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(160);
      // The revealed item may belong to a series other than the default bookmark: try each unlocked series.
      const marks = page.locator('.bmark[data-tab]:not([disabled])');
      for (let i = 0; i < await marks.count(); i++) {
        if (await page.locator('.stk-slot.have').count()) break;
        await marks.nth(i).click({ force: true, timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(80);
      }
      const owned = page.locator('.stk-slot.have').first();
      if (await owned.count()) {
        await owned.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(160);
        if (await page.locator('#modal-root .modal').count()) await snapshot(page, sizeLabel, 'popup-item', await measure(page));
        await clearModals(page);
      }
    }
    const streetTab = page.locator('[data-stagetab="town:street"]').first();
    const townNav = page.locator('#nav-in button[data-view="town"]').first();
    if (await townNav.count()) {
      await clearModals(page);
      await townNav.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(120);
      if (await streetTab.count()) {
        await streetTab.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(120);
        const streetBtn = page.locator('#street-btn').first();
        if (await streetBtn.count()) {
          await streetBtn.click({ force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(160);
          if (await page.locator('#modal-root .modal').count()) await snapshot(page, sizeLabel, 'popup-street', await measure(page));
        }
      }
    }
    await context.close();
  }
  return fcpValues;
}

async function keyboardCheck(browser, base, isReleaseBuild) {
  const context = await browser.newContext({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await context.newPage();
  if (isReleaseBuild) await page.route('https://sdk.crazygames.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}' });
  await page.waitForFunction(() => document.getElementById('app') && document.querySelector('#app > *'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await clearModals(page);
  const seeded = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        const save = JSON.parse(localStorage.getItem(key));
        if (save && Array.isArray(save.parcels) && save.town) {
          save.town.rep = 30; save.town.level = 2;
          localStorage.setItem(key, JSON.stringify(save));
          return true;
        }
      } catch { /* not the save */ }
    }
    return false;
  });
  if (!seeded) { await context.close(); return { ok: false, why: 'no save found to seed Lv2' }; }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#nav-in button[data-view="rush"]'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  await clearModals(page);
  const rush = page.locator('#nav-in button[data-view="rush"]').first();
  if (!(await rush.count())) { await context.close(); return { ok: false, why: 'Rush button not shown at Lv2' }; }
  await rush.click();
  await page.waitForSelector('.rh', { timeout: 10000 });
  await page.locator('[data-rh="start"]').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(150);
  const selected = await page.locator('[data-series="snacks"]').getAttribute('aria-pressed');
  const rushLayout = await page.evaluate(() => {
    const rh = document.querySelector('.rh');
    const out = [...document.querySelectorAll('.rh button')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1); }).length;
    return { pageOk: document.documentElement.scrollHeight <= innerHeight + 1, overlayOk: !!rh && rh.scrollHeight <= rh.clientHeight + 2, out };
  });
  const shotDir = join(OUT, '907x510'); mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: join(shotDir, 'keyboard-digit1.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const escapedPauses = await page.locator('[data-rh="resume"]').count();
  await page.screenshot({ path: join(shotDir, 'keyboard-escape-does-nothing.png') });
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(250);
  const pPauses = await page.locator('[data-rh="resume"]').count();
  await page.screenshot({ path: join(shotDir, 'keyboard-p-pauses.png') });
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(250);
  const pResumes = await page.locator('[data-rh="resume"]').count();
  await context.close();
  const ok = selected === 'true' && escapedPauses === 0 && pPauses > 0 && pResumes === 0 && rushLayout.pageOk && rushLayout.overlayOk && rushLayout.out === 0;
  return { ok, selected, escapedPauses, pPauses, pResumes, rushLayout };
}

async function loadingCheck(browser, base, isReleaseBuild, fcpValues) {
  const context = await browser.newContext({ viewport: { width: 907, height: 510 }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await context.newPage();
  if (isReleaseBuild) await page.route('https://sdk.crazygames.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => performance.getEntriesByType('paint').length > 0, null, { timeout: 3000 }).catch(() => {});
  const loadingVisible = await page.evaluate(() => {
    const el = document.getElementById('cg-loading');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
  const fcp = await page.evaluate(() => { const all = performance.getEntriesByType('paint'); const e = all.find(x => x.name === 'first-contentful-paint') || all.find(x => x.name === 'first-paint'); return e ? Math.round(e.startTime) : null; });
  await page.waitForFunction(() => !document.getElementById('cg-loading'), null, { timeout: 12000 }).catch(() => {});
  const calls = isReleaseBuild ? await page.evaluate(() => window.__cgCalls || []) : [];
  await context.close();
  const start = calls.indexOf('loadingStart'), stop = calls.lastIndexOf('loadingStop');
  const sdkOk = !isReleaseBuild || (start >= 0 && stop > start);
  const whiteOk = fcp !== null && fcp < 300 && loadingVisible;
  return { ok: whiteOk && sdkOk, loadingVisible, fcp, calls, sdkOk };
}

const serverInfo = BASE_ARG ? { server: null, base: BASE_ARG } : await serve(ROOT);
const isReleaseBuild = existsSync(join(ROOT, 'index.html')) && readFileSync(join(ROOT, 'index.html'), 'utf8').includes('sdk.crazygames.com');
const browser = await launch();
try {
  mkdirSync(OUT, { recursive: true });
  const fcpValues = await layoutSuite(browser, serverInfo.base, isReleaseBuild);
  const keyboard = await keyboardCheck(browser, serverInfo.base, isReleaseBuild);
  const loading = await loadingCheck(browser, serverInfo.base, isReleaseBuild, fcpValues);

  const failed = results.filter(r => !r.ok);
  console.log('\nCrazyGames 10-size layout check (' + SIZES.length + ' sizes, dpr=1)\n');
  console.log('SIZE        STATE                         RESULT  DETAIL');
  console.log('-'.repeat(100));
  if (!QUIET) for (const r of rows) console.log(r[0].padEnd(12) + r[1].padEnd(30) + r[2].padEnd(8) + r[3]);
  if (QUIET) for (const r of rows.filter(x => x[2] === 'FAIL')) console.log(r[0].padEnd(12) + r[1].padEnd(30) + r[2].padEnd(8) + r[3]);
  console.log('-'.repeat(100));
  console.log('Layout: ' + (results.length - failed.length) + '/' + results.length + ' states pass');
  console.log('Keyboard: ' + (keyboard.ok ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(keyboard));
  console.log('Loading:  ' + (loading.ok ? 'PASS' : 'FAIL') + ' ' + JSON.stringify({ fcp: loading.fcp, loadingVisible: loading.loadingVisible, sdkOk: loading.sdkOk, calls: loading.calls }));
  console.log('Screenshots: ' + OUT);

  writeFileSync(join(OUT, 'report.txt'), rows.map(r => r.join('\t')).join('\n') + '\n\nKeyboard\t' + JSON.stringify(keyboard) + '\nLoading\t' + JSON.stringify(loading) + '\n');
  if (failed.length || !keyboard.ok || !loading.ok) {
    console.error('\nResult: FAIL');
    process.exitCode = 1;
  } else {
    console.log('\nResult: PASS');
  }
} finally {
  await browser.close();
  if (serverInfo.server) serverInfo.server.close();
}
