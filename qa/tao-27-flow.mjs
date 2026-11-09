// TAO-27 acceptance: new-player flow timing, old-save flow, audio (music / mute / SDK muteAudio).
// Serves ../dist-crazygames-preview (mock ads) or a release dir with a fake CrazyGames SDK.
// Playwright bundled Chromium only; browser/context closed in finally.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : f; };
const ROOT = resolve(arg('--dir', 'dist-crazygames-preview'));
const OUT = resolve(arg('--out', 'qa/tao-27'));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
function serve(dir) {
  return new Promise(res => {
    const server = createServer((req, res2) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(dir, p));
      if (!f.startsWith(dir + '/') || !existsSync(f) || !statSync(f).isFile()) { res2.writeHead(404); res2.end('nf'); return; }
      res2.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(f).pipe(res2);
    });
    server.listen(0, '127.0.0.1', () => res({ server, base: 'http://127.0.0.1:' + server.address().port + '/' }));
  });
}
const FAKE_SDK = `
window.__cgMuteListeners = []; window.__cgCalls = [];
window.CrazyGames = { SDK: {
  environment: 'local',
  init: function () { window.__cgCalls.push('init'); return Promise.resolve(); },
  ad: { requestAd: function (t, cb) { if (cb && cb.adError) cb.adError({ code: 'unfilled' }); }, hasAdblock: function () { return Promise.resolve(false); } },
  game: { gameplayStart: function () {}, gameplayStop: function () {}, loadingStart: function () {}, loadingStop: function () {}, happytime: function () {},
    settings: { muteAudio: false }, addSettingsChangeListener: function (cb) { window.__cgMuteListeners.push(cb); } },
  data: { getItem: k => localStorage.getItem('cg:' + k), setItem: (k, v) => localStorage.setItem('cg:' + k, v), removeItem: k => localStorage.removeItem('cg:' + k) },
  user: { systemInfo: { locale: 'en-US' } },
} };`;
const INSTRUMENT = `
  window.__oscStarts = { total: 0, since: 0 };
  try {
    const oStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...a) { window.__oscStarts.total++; window.__oscStarts.since++; return oStart.apply(this, a); };
  } catch (e) {}
  window.__htmlErrs = [];
  window.addEventListener('pageerror', e => window.__htmlErrs.push(String(e && e.message || e)));
`;
const resetSince = page => page.evaluate(() => { window.__oscStarts.since = 0; });
const since = page => page.evaluate(async () => { const a = await new Promise(r => setTimeout(r, 1500)); const v1 = window.__oscStarts.since; await new Promise(r => setTimeout(r, 1500)); return { w1: v1, w2: window.__oscStarts.since }; });
const sinceMax = page => (async () => { const r = await since(page); return Math.max(r.w1, r.w2); })();

async function closeGuide(page) {
  for (let i = 0; i < 4; i++) {
    if (!(await page.locator('#modal-root .modal').count()).valueOf()) break;
    const btn = page.locator('#modal-root .modal [data-close], #modal-root .modal button').first();
    if (await btn.count()) await btn.click({ force: true, timeout: 2000 }).catch(() => {});
    else await page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; });
    await page.waitForTimeout(120);
  }
}
async function clickTarget(page, sel, force = true) {
  const el = page.locator(sel).first();
  await el.click({ force: true, timeout: 3000 }).catch(e => { throw new Error('click ' + sel + ': ' + e.message); });
}
const results = {};
const serverInfo = BASE => BASE;
async function newPlayer(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.route('https://sdk.crazygames.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK }));
  await page.addInitScript(INSTRUMENT);
  const consoleErrs = []; page.on('pageerror', e => consoleErrs.push(String(e.message))); page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app [data-parcel]'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  mkdirSync(join(OUT, 'flow'), { recursive: true });
  await page.screenshot({ path: join(OUT, 'flow/new-player-0-first-screen.png') });
  // Nothing plays before the first user gesture
  results.oscBeforeGesture = await page.evaluate(() => window.__oscStarts.total);
  // A guided first-time player follows the onboarding coach: every coach step highlights one button; a click on it is
  // the only input needed. Count real mouse clicks from this moment to the finished reveal.
  let clicks = 0;
  const t0 = Date.now();
  let revealed = false; const coachSteps = [];
  for (let i = 0; i < 10 && !revealed; i++) {
    const step = await page.evaluate(() => { const el = document.querySelector('.coach-target'); if (!el) return null; return { id: el.id, dp: el.getAttribute('data-parcel') || '', gs: el.getAttribute('data-gs') || '' }; });
    if (!step) { coachSteps.push('(no coach target)'); break; }
    coachSteps.push(step.id || 'parcel:' + (step.dp || step.gs));
    await page.locator('.coach-target').first().click({ force: true, timeout: 3000 }).catch(() => {});
    clicks++;
    await page.waitForTimeout(1400);
    if (clicks === 1) results.oscAfterFirstClick = await page.evaluate(() => window.__oscStarts.total);
    revealed = await page.evaluate(() => !!document.querySelector('.result-scene') || !!document.querySelector('#next-parcel'));
  }
  await page.screenshot({ path: join(OUT, 'flow/new-player-1-reveal.png') });
  const elapsed = (Date.now() - t0) / 1000;
  results.newPlayer = { revealed, clicks, coachSteps, seconds: Math.round(elapsed * 10) / 10, consoleErrors: consoleErrs };
  results.firstScreenShown = true;
  // ---- audio on the same session ----
  if (revealed) {
    for (let i = 0; i < 4; i++) {
      if (await page.locator('#coach-skip').count()) await clickTarget(page, '#coach-skip');
      else if (await page.locator('#back-shelf').count()) await clickTarget(page, '#back-shelf');
      else break;
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(300);
    // music runs without extra input after this first click
    await resetSince(page);
    const musicBefore = (await since(page)).w1 + (await since(page)).w2;
    // mute button: scheduling pauses, then resumes on unmute
    await clickTarget(page, '#mute');
    await page.waitForTimeout(300);
    await resetSince(page);
    const mutedPlateau = await sinceMax(page);
    await clickTarget(page, '#mute');
    await page.waitForTimeout(300);
    await resetSince(page);
    const musicAfterUnmute = await sinceMax(page);
    const muteLabel = await page.evaluate(() => { const m = document.getElementById('mute'); return m ? (m.getAttribute('aria-label') || m.textContent) : null; });
    // SDK muteAudio: the fake SDK fires the settings change with muteAudio=true
    await resetSince(page);
    await page.evaluate(() => { window.CrazyGames.SDK.game.settings.muteAudio = true; window.__cgMuteListeners.forEach(cb => { try { cb(); } catch (e) {} }); });
    await page.waitForTimeout(500);
    await resetSince(page);
    const sdkMutedPlateau = await sinceMax(page);
    await page.evaluate(() => { window.CrazyGames.SDK.game.settings.muteAudio = false; window.__cgMuteListeners.forEach(cb => { try { cb(); } catch (e) {} }); });
    await page.waitForTimeout(500);
    await resetSince(page);
    const sdkUnmutedResumes = await sinceMax(page);
    results.audio = { musicBefore, mutedPlateau, musicAfterUnmute, sdkMutedPlateau, sdkUnmutedResumes, listeners: await page.evaluate(() => window.__cgMuteListeners.length), muteLabel };
  }
  await page.screenshot({ path: join(OUT, 'flow/new-player-final.png') });
  await ctx.close();
}

async function oldSave(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.route('https://sdk.crazygames.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK }));
  await page.addInitScript(INSTRUMENT);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app > *'), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await closeGuide(page);
  const seeded = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        const save = JSON.parse(localStorage.getItem(key));
        if (save && Array.isArray(save.parcels) && save.town) {
          save.town.rep = 120; save.town.level = 3; save.parcels = save.parcels || [];
          localStorage.setItem(key, JSON.stringify(save)); return true;
        }
      } catch { }
    }
    return false;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app [data-parcel]'), null, { timeout: 20000 }).catch(() => {});
  const modalTxt = await page.evaluate(() => { const m = document.querySelector('#modal-root .modal'); return m ? (m.textContent || '').trim().slice(0, 120) : null; });
  const stationVisible = await page.evaluate(() => !!document.querySelector('.nav') && document.querySelectorAll('[data-parcel]').length > 0);
  if (await page.locator('#modal-root .modal').count()) await closeGuide(page);
  await page.screenshot({ path: join(OUT, 'flow/old-save-station.png') });
  // an experienced player can still open and reveal a parcel
  let revealed = false;
  if (await page.locator('[data-parcel]').count()) {
    await page.locator('[data-parcel]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    await clickTarget(page, '#go-open').catch(() => {});
    for (let i = 0; i < 4 && !revealed; i++) {
      if (i) { const btn2 = page.locator('#sheet-root button:visible').first(); if (await btn2.count()) await btn2.click({ force: true }).catch(() => {}); }
      await page.waitForTimeout(700);
      if (await page.locator('#sheet-root .sheet').count()) revealed = true;
    }
  }
  await page.screenshot({ path: join(OUT, 'flow/old-save-reveal.png') });
  results.oldSave = { seeded, modalAfterReload: modalTxt, stationVisible, revealed };
  await ctx.close();
}
const si = await serve(ROOT);
const isRelease = existsSync(join(ROOT, 'index.html')) && readFileSync(join(ROOT, 'index.html'), 'utf8').includes('sdk.crazygames.com');
const browser = await chromium.launch({ headless: true });
try {
  await newPlayer(browser, si.base);
  await oldSave(browser, si.base);
  console.log(JSON.stringify(results, null, 1));
  writeFileSync(join(OUT, 'flow-report.json'), JSON.stringify(results, null, 1) + '\n');
  const ok = results.newPlayer && results.newPlayer.revealed && results.newPlayer.clicks <= 6 && results.newPlayer.seconds <= 30 &&
    results.oldSave && results.oldSave.revealed && results.oldSave.stationVisible &&
    (results.oscBeforeGesture || 0) === 0 && results.oscAfterFirstClick > 0 &&
    results.audio && results.audio.musicBefore > 0 && results.audio.mutedPlateau === 0 && results.audio.musicAfterUnmute > 0 &&
    results.audio.sdkMutedPlateau === 0 && results.audio.sdkUnmutedResumes > 0;
  console.log('\nFlow+Audio: ' + (ok ? 'PASS' : 'FAIL'));
  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
  si.server.close();
}
