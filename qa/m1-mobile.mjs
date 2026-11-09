// TAO-36 / M1 web + H5 check.
// Serves the preview build, opens it with iPhone- and Android-sized touch profiles, and verifies:
//   - the station and shop render on a phone, portrait and landscape, with no horizontal scroll
//   - the reward video (local test ad) plays and pays the reward
//   - ?adsblocked=1 hides the ad button and leaves the coin option
//   - the remove-ads developer switch is saved (break ads off, reward video stays)
//   - the first tap creates an AudioContext (mobile audio unlock)
// Screenshots go to qa/tao-36/screens. Usage: node qa/m1-mobile.mjs [--dir dist] [--out qa/tao-36/screens]
import { chromium, devices } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
const ROOT = resolve(arg('--dir', 'dist'));
const OUT = resolve(arg('--out', 'qa/tao-36/screens'));
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
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
async function launch() {
  try { return await chromium.launch({ headless: true }); }
  catch {
    try { return await chromium.launch({ headless: true, channel: 'chrome' }); }
    catch { return await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); }
  }
}

const results = [];
const check = (ok, label, detail = '') => { results.push({ ok, label, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? ' · ' + detail : '')); };

async function mobileContext(browser, deviceName, landscape = false) {
  const d = devices[deviceName];
  // Playwright's descriptor is the portrait web viewport (390x664 for iPhone 13). A real phone in
  // landscape uses the full screen width (844x390), so use that to exercise the landscape layout.
  const physical = deviceName === 'iPhone 13' ? { width: 844, height: 390 } : { width: 851, height: 393 };
  const vp = landscape ? physical : d.viewport;
  const context = await browser.newContext({ ...d, viewport: vp, locale: 'zh-CN' });
  await context.addInitScript(() => {
    try { localStorage.setItem('parcelwood.age', 'ok'); } catch {}
    // Count AudioContext construction so the mobile unlock can be verified after the first tap.
    const Real = window.AudioContext || window.webkitAudioContext;
    window.__audioMade = 0;
    if (Real) {
      const Wrapped = function (...a) { window.__audioMade++; return new Real(...a); };
      Wrapped.prototype = Real.prototype;
      window.AudioContext = Wrapped;
      window.webkitAudioContext = Wrapped;
    }
    // Stand in for the native share sheet so the Web Share path can be checked in Chromium.
    window.__shareCalls = [];
    try { Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__shareCalls.push(data); } }); } catch {}
  });
  return context;
}

async function dismissCoach(page) {
  const skip = page.locator('#coach-skip');
  if (await skip.count()) { try { await skip.click({ timeout: 1000 }); } catch {} }
  await page.waitForTimeout(150);
}

async function dismissModals(page) {
  for (let i = 0; i < 3; i++) {
    const close = page.locator('#modal-root [data-close]').first();
    if (await close.count()) { try { await close.click({ timeout: 1000 }); } catch {} }
    else if (await page.locator('#mb').count()) { try { await page.locator('#mb').click({ position: { x: 5, y: 5 }, timeout: 1000 }); } catch {} }
    await page.waitForTimeout(120);
  }
}

async function runDevice(browser, base, label, deviceName, landscape) {
  const context = await mobileContext(browser, deviceName, landscape);
  const page = await context.newPage();
  const suffix = landscape ? '-landscape' : '-portrait';
  await page.goto(base + '?devlv=2', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await dismissCoach(page);
  await dismissModals(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, label + ' no horizontal scroll' + suffix, 'scrollWidth=' + await page.evaluate(() => document.documentElement.scrollWidth) + ' innerWidth=' + await page.evaluate(() => innerWidth));
  await page.screenshot({ path: join(OUT, label + '-station' + suffix + '.png') });

  if (!landscape) {
    // The first tap must create the audio context (mobile autoplay unlock).
    await page.locator('body').click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(100);
    const audio = await page.evaluate(() => window.__audioMade);
    check(audio > 0, label + ' audio unlocked on first tap', 'AudioContext made=' + audio);

    await dismissModals(page);
    await page.locator('[data-view="shop"]').click();
    await page.waitForTimeout(250);
    const adButton = page.locator('[data-ad-watch="mystery"]');
    check(await adButton.count() > 0, label + ' reward video button on shop');
    const coinButton = page.locator('[data-ad-coins="mystery"]');
    check(await coinButton.count() > 0, label + ' coin alternative on shop');
    await page.screenshot({ path: join(OUT, label + '-shop-rewards-portrait.png') });

    await dismissModals(page);
    await page.locator('[data-view="station"]').click();
    await page.waitForTimeout(150);
    const before = await page.locator('#app .shelf .slot').count();
    await dismissModals(page);
    await page.locator('[data-view="shop"]').click();
    await page.waitForTimeout(150);
    await adButton.click();
    await page.waitForTimeout(400);
    check(await page.locator('.web-test-ad').count() > 0, label + ' test ad overlay plays');
    await page.screenshot({ path: join(OUT, label + '-test-ad-portrait.png') });
    await page.waitForTimeout(5200);
    const toast = await page.locator('#toast-root').innerText().catch(() => '');
    await dismissModals(page);
    await page.locator('[data-view="station"]').click();
    await page.waitForTimeout(150);
    const after = await page.locator('#app .shelf .slot').count();
    check(after >= before + 1, label + ' test ad pays a misdelivered parcel', 'shelf ' + before + ' -> ' + after + (toast ? ' · ' + toast.replace(/\s+/g, ' ') : ''));
    await page.screenshot({ path: join(OUT, label + '-reward-granted-portrait.png') });

    // Remove-ads developer switch: saved, rewarded ads still present.
    await dismissModals(page);
    await page.locator('[data-view="shop"]').click();
    await page.waitForTimeout(150);
    const sw = page.locator('#dev-noads');
    if (await sw.count()) {
      await sw.check();
      await page.waitForTimeout(150);
      const saved = await page.evaluate(() => localStorage.getItem('parcelwood.noads'));
      check(saved === '1', label + ' remove-ads dev switch is saved', 'parcelwood.noads=' + saved);
      check(await page.locator('[data-ad-watch="mystery"]').count() > 0, label + ' remove-ads keeps reward videos');
      await page.screenshot({ path: join(OUT, label + '-noads-dev-portrait.png') });
      await sw.uncheck();
    } else {
      check(false, label + ' remove-ads dev switch present');
    }

    // Web Share: finish the daily puzzle (3 guesses, win or lose) and use its share button.
    await dismissModals(page);
    await page.locator('[data-view="town"]').click();
    await page.waitForTimeout(200);
    for (let i = 0; i < 3; i++) {
      const card = page.locator('#daily [data-dpeek]:not([disabled])').first();
      if (!(await card.count())) break;
      await card.click();
      await page.waitForTimeout(100);
      const guess = page.locator('#modal-root [data-daily]').first();
      if (await guess.count()) { await guess.click(); await page.waitForTimeout(150); }
      await dismissModals(page);
    }
    check(await page.locator('#daily-share').count() > 0, label + ' daily share button appears after the puzzle');
    if (await page.locator('#daily-share').count()) {
      await page.locator('#daily-share').click();
      await page.waitForTimeout(200);
      const shares = await page.evaluate(() => (window.__shareCalls || []).length);
      check(shares > 0, label + ' Web Share opens the native share sheet', 'share calls=' + shares);
      await page.screenshot({ path: join(OUT, label + '-daily-share-portrait.png') });
    }
    await page.close();

    // Ad blocker simulation in a fresh context (the single-tab guard owns one tab per context).
    const blockedContext = await mobileContext(browser, deviceName, false);
    const blocked = await blockedContext.newPage();
    await blocked.goto(base + '?devlv=2&adsblocked=1', { waitUntil: 'networkidle' });
    await dismissCoach(blocked);
    await dismissModals(blocked);
    await blocked.locator('[data-view="shop"]').click();
    await blocked.waitForTimeout(250);
    check(await blocked.locator('[data-ad-watch]').count() === 0, label + ' blocked ads hide every ad button');
    check(await blocked.locator('[data-ad-coins="mystery"]').count() === 1, label + ' blocked ads keep the coin option');
    await blocked.screenshot({ path: join(OUT, label + '-ads-blocked-portrait.png') });
    await blockedContext.close();

  } else {
    // Landscape: the left rail layout must fit.
    const rail = await page.evaluate(() => {
      const nav = document.querySelector('.nav');
      return nav ? getComputedStyle(nav).top : '';
    });
    check(rail === '0px', label + ' landscape uses the left rail', 'nav top=' + rail);
    await dismissModals(page);
    await page.locator('[data-view="shop"]').click();
    await page.waitForTimeout(200);
    check(await page.locator('[data-ad-watch="mystery"]').count() > 0, label + ' landscape shop shows reward video');
    await page.screenshot({ path: join(OUT, label + '-shop-landscape.png') });
  }
  await context.close();
}

// --base URL checks an already-deployed preview instead of serving a local build.
const deployed = arg('--base', '');
const started = deployed ? null : await serve(ROOT);
const base = deployed || started.base;
const browser = await launch();
try {
  await runDevice(browser, base, 'iphone', 'iPhone 13', false);
  await runDevice(browser, base, 'iphone', 'iPhone 13', true);
  await runDevice(browser, base, 'android', 'Pixel 5', false);
  await runDevice(browser, base, 'android', 'Pixel 5', true);
} finally {
  await browser.close();
  if (started) started.server.close();
}

const failed = results.filter(r => !r.ok);
console.log('\nScreenshots: ' + OUT);
if (failed.length) { console.error('\n' + failed.length + ' check(s) failed.'); process.exit(1); }
console.log('All M1 mobile checks passed (' + results.length + ').');
