// TAO-101 M3.1 QA: neighbour portraits on the street, in requests, stories, thanks, gifts and urgent parcels.
// Uses the same conventions as qa/tao-59/qa.mjs: Playwright's bundled Chromium, own static server, screenshots
// next to this file. Playwright is resolved from ../node_modules (see qa/cg-layout.mjs).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import fs from 'node:fs';

const ROOT = resolve(join(import.meta.dirname, '../../dist'));
const OUT = join(import.meta.dirname, 'screens');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest.webmanifest',
};

// the dev-tools build of the web app, served like the Vercel preview serves /
function serve(dir) {
  return new Promise(resolveServer => {
    const server = createServer((req, res) => {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.)+/, '');
      let file = join(dir, p);
      if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

const results = [];
const R = (req, pass, evidence) => { results.push({ req, pass: !!pass, evidence: String(evidence) }); console.log((pass ? 'PASS' : 'FAIL') + ' | ' + req + ' | ' + evidence); };
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, name + '.png'), fullPage: false }); console.log('shot: ' + name + '.png'); };

// close the boot popups (age gate already handled by localStorage, level-ups from ?devlv follow)
const dismissModals = async (page) => {
  for (let i = 0; i < 10; i++) {
    if (!(await page.locator('#modal-root .modal-back').count())) return;
    const close = page.locator('#modal-root .modal-back [data-close]').last();
    const any = page.locator('#modal-root .modal-back button:visible').last();
    try { await (await close.count() ? close : any).click({ timeout: 800 }); } catch { return; }
    await page.waitForTimeout(300);
  }
};

const streetFaces = (page) => page.evaluate(() => {
  return [...document.querySelectorAll('.houses .who img.face')].map(img => ({
    src: img.getAttribute('src'), alt: img.getAttribute('alt'), aria: img.getAttribute('aria-hidden'),
    ok: img.complete && img.naturalWidth > 0, w: Math.round(img.getBoundingClientRect().width),
  }));
});

// dismiss boot popups, then go to the Town page where the street lives; level-up popups chain on a
// ?devlv boot, so the click retries while a modal still covers the nav
const goStreet = async (page) => {
  for (let i = 0; i < 12; i++) {
    await dismissModals(page);
    try { await page.click('[data-view="town"]', { timeout: 4000 }); break; } catch { continue; }
  }
  await page.waitForSelector('.houses .who img.face', { timeout: 30000 });
};

// the dev panel buttons live on the shop page in a dev-tools build; the day buttons reload the page
const devClick = async (page, id) => {
  await dismissModals(page);
  await page.click('[data-view="shop"]');
  await page.click('#' + id);
  if (/^dev-day/.test(id)) await page.waitForLoadState('load', { timeout: 60000 });
  else await page.waitForTimeout(500);
};

// turn the owned list into spares: every owned item gets a second copy (gifts are given from repeats).
// A game tick can re-save between the edit and the reload, so the result is verified and retried.
const ownedMin = (page) => page.evaluate(() => {
  // the game save is the only non-parcelwood.* key whose value holds the parcels list
  const key = Object.keys(localStorage).find(k => !k.startsWith('parcelwood.') && (localStorage.getItem(k) || '').includes('"parcels"'));
  if (!key) return -1;
  const own = JSON.parse(localStorage.getItem(key)).owned || {};
  const vals = Object.values(own);
  return vals.length ? Math.min(...vals) : 0;
});
const seedSpares = async (page) => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => !k.startsWith('parcelwood.') && (localStorage.getItem(k) || '').includes('"parcels"'));
      if (!key) return;
      const s = JSON.parse(localStorage.getItem(key));
      Object.keys(s.owned || {}).forEach(id => { s.owned[id] = Math.max(s.owned[id] || 0, 2); });
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    if (await ownedMin(page) >= 2) return true;
  }
  return false;
};

// QA_BASE=<url> runs the same checks against a live preview (e.g. the Vercel deployment);
// without it the script serves the local dev-tools build from dist/ (VITE_DEVTOOLS=1 npm run build).
const server = await serve(ROOT);
let BASE = 'http://127.0.0.1:' + server.address().port + '/';
if (process.env.QA_BASE) { server.close(); BASE = process.env.QA_BASE.replace(/\/$/, '') + '/'; }
console.log('QA base: ' + BASE);
async function launch() {
  try { return await chromium.launch({ headless: true }); }
  catch { try { return await chromium.launch({ headless: true, channel: 'chrome' }); }
    catch { return await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); } }
}
let browser;
try {
  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('parcelStation.lang', 'zh'); localStorage.setItem('parcelwood.age', 'ok'); });
  const page = await ctx.newPage();

  // 1. the street at Lv7: 7 houses, 7 different normal portraits, all load, alt=""
  await page.goto(BASE + '?devlv=7', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500); // let the boot settle (level-up popups can arrive late)
  await goStreet(page);
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.houses .who img.face')];
    return imgs.length > 0 && imgs.every(i => i.complete);
  }, { timeout: 60000 });
  let faces = await streetFaces(page);
  const bySrc = new Set(faces.map(f => f.src));
  R('street shows 7 neighbour portraits at devlv=7', faces.length === 7, faces.map(f => f.src).join(', '));
  R('each portrait file is distinct (no shared smiley)', bySrc.size === 7, 'distinct=' + bySrc.size);
  R('all portraits load (naturalWidth>0)', faces.every(f => f.ok), faces.map(f => f.ok).join(','));
  R('portraits are decorative for screen readers (alt="", aria-hidden)', faces.every(f => f.alt === '' && f.aria === 'true'), 'alt/aria ok');
  R('portrait circle size stays ~60px in the house', faces.every(f => f.w >= 40 && f.w <= 90), faces.map(f => f.w).join(','));
  await shot(page, '01-street-portraits-lv7');

  // 2. tap a house: the story modal shows that neighbour's normal portrait
  const houseBtn = page.locator('.houses .who[data-res]').first();
  await houseBtn.click();
  await page.waitForSelector('#modal-root .mface img.face', { timeout: 10000 });
  const modalFace = await page.evaluate(() => {
    const i = document.querySelector('#modal-root .mface img.face');
    return { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 };
  });
  R('story modal shows the tapped neighbour normal portrait', /-normal\.webp$/.test(modalFace.src) && modalFace.ok, modalFace.src);
  await shot(page, '02-story-modal-normal');
  await dismissModals(page);

  // 3. a gift makes the neighbour happy (unlock all first, then double the owned list into spares)
  for (let i = 0; i < 3 && await ownedMin(page) === 0; i++) { await devClick(page, 'dev-unlock'); await page.waitForTimeout(600); }
  console.log('owned after dev-unlock:', await ownedMin(page));
  const seeded = await seedSpares(page);
  await goStreet(page);
  if (!seeded) {
    R('gift modal shows the happy portrait', false, 'spare seeding did not stick (owned min < 2)');
  } else {
    const gift = page.locator('[data-gift]:not([disabled])').first();
    await gift.click();
    await page.waitForSelector('[data-gift-item]', { timeout: 10000 });
    await shot(page, '03-gift-picker');
    await page.locator('[data-gift-item]').first().click();
    await page.waitForSelector('#modal-root .mface.happy img.face', { timeout: 10000 });
    await page.waitForFunction(() => {
      const i = document.querySelector('#modal-root .mface.happy img.face');
      return i && i.complete && i.naturalWidth > 0;
    }, { timeout: 10000 });
    const happyFace = await page.evaluate(() => {
      const i = document.querySelector('#modal-root .mface.happy img.face');
      return { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 };
    });
    R('gift modal shows the happy portrait', /-happy\.webp$/.test(happyFace.src) && happyFace.ok, happyFace.src);
    await shot(page, '04-gift-happy');
    await dismissModals(page);
  }

  // 4. next day: an urgent parcel arrives, that neighbour turns worried on the street and in the parcel sheet
  await devClick(page, 'dev-day-next');
  await goStreet(page);
  faces = await streetFaces(page);
  const worriedOnStreet = faces.filter(f => /-worried\.webp$/.test(f.src));
  R('after the day tick a neighbour shows the worried portrait on the street', worriedOnStreet.length >= 1, faces.map(f => f.src).join(', '));
  await shot(page, '05-street-worried');
  if (worriedOnStreet.length) {
    const id = worriedOnStreet[0].src.match(/residents\/([a-z]+)-worried/)[1];
    await dismissModals(page);
    await page.click('[data-view="station"]');
    const slot = page.locator('.slot.urgent').first();
    if (await slot.count()) {
      await slot.click();
      await page.waitForSelector('#sheet-root .mface img.face', { timeout: 10000 });
      await page.waitForFunction(() => {
        const i = document.querySelector('#sheet-root .mface img.face');
        return i && i.complete && i.naturalWidth > 0;
      }, { timeout: 10000 });
      const sheetFace = await page.evaluate(() => {
        const i = document.querySelector('#sheet-root .mface img.face');
        return { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, who: (document.querySelector('#go-return .small') || {}).textContent };
      });
      R('urgent parcel sheet shows the worried portrait', /-worried\.webp$/.test(sheetFace.src) && sheetFace.ok, sheetFace.src + ' (' + (sheetFace.who || '') + ')');
      await shot(page, '06-urgent-sheet-worried');
      const back = page.locator('#sheet-close');
      if (await back.count()) await back.click();
    } else {
      R('urgent parcel is on the shelf to open', false, 'no .slot.urgent found');
    }
  }

  // 5. request modal (askrow) shows the requester's normal portrait
  await goStreet(page);
  const reqBtn = page.locator('[data-req]').first();
  if (await reqBtn.count()) {
    await reqBtn.click();
    await page.waitForSelector('#modal-root .mface img.face, #sheet-root .mface img.face', { timeout: 10000 });
    await page.waitForFunction(() => {
      const i = document.querySelector('#modal-root .mface img.face, #sheet-root .mface img.face');
      return i && i.complete && i.naturalWidth > 0;
    }, { timeout: 10000 });
    const reqFace = await page.evaluate(() => {
      const i = document.querySelector('#modal-root .mface img.face, #sheet-root .mface img.face');
      return { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 };
    });
    R('request modal shows the requester normal portrait', /-normal\.webp$/.test(reqFace.src) && reqFace.ok, reqFace.src);
    await shot(page, '07-request-normal');
    await dismissModals(page);
  } else {
    R('request modal shows the requester normal portrait', false, 'no [data-req] bubble on the street');
  }

  // 6. the save survives a reload (portraits do not touch saves; a reload keeps progress)
  const coinsBefore = await page.evaluate(() => {
    const raw = Object.keys(localStorage).filter(k => !k.startsWith('parcelwood.')).map(k => localStorage.getItem(k)).find(v => v.includes('"parcels"'));
    return raw ? JSON.parse(raw).coins : null;
  });
  await page.reload({ waitUntil: 'load' });
  await goStreet(page);
  const coinsAfter = await page.evaluate(() => {
    const raw = Object.keys(localStorage).filter(k => !k.startsWith('parcelwood.')).map(k => localStorage.getItem(k)).find(v => v.includes('"parcels"'));
    return raw ? JSON.parse(raw).coins : null;
  });
  R('save keeps coins across reload', coinsBefore !== null && coinsBefore === coinsAfter, coinsBefore + ' -> ' + coinsAfter);

  // 7. portrait budget: total bytes of the 21 files in the build
  const totalKB = readdirSync(join(ROOT, 'residents')).filter(f => f.endsWith('.webp'))
    .reduce((t, f) => t + statSync(join(ROOT, 'residents', f)).size, 0) / 1024;
  R('all 21 portraits together stay under 0.5 MB', totalKB < 512, totalKB.toFixed(0) + ' kB for 21 files');

  fs.writeFileSync(join(import.meta.dirname, 'result.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.pass);
  console.log('\n' + (failed.length ? 'FAILED: ' + failed.length + ' of ' + results.length : 'ALL ' + results.length + ' CHECKS PASS'));
  process.exitCode = failed.length ? 1 : 0;
} finally {
  if (browser) await browser.close();
  if (!process.env.QA_BASE) server.close();
}
