// TAO-164 M3.3 live check: all 14 station decorations at 320/390/1440 (no overlaps), event and week
// banners, banner fallback, dark mode, and Mr. Dube in the coach bubble.
// Usage: QA_BASE=http://localhost:4173 node qa/tao-164/probe.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.QA_BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
const OUT = join(import.meta.dirname, 'screens');
const RESULT = join(import.meta.dirname, 'result.json');
mkdirSync(OUT, { recursive: true });
const results = [];
const R = (id, view, req, pass, evidence) => {
  const row = { id, view, req, pass: !!pass, evidence: String(evidence).replace(/\s+/g, ' ').slice(0, 500) };
  results.push(row);
  console.log((row.pass ? 'PASS' : 'FAIL') + ' | ' + id + ' | ' + view + ' | ' + req + ' | ' + row.evidence);
  writeFileSync(RESULT, JSON.stringify(results, null, 2));
};

const DECOR = [
  'lantern', 'sprout', 'kite', 'chime', 'cactus', 'clock', 'globe', 'terrarium', 'carousel', 'ferris',
  'scale', 'garland', 'horn', 'trolley',
];
const HINTS = ['town', 'album', 'shop', 'daily', 'rush', 'week'];

async function launch() {
  try { return await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); }
  catch { return await chromium.launch({ headless: true }); }
}

async function seed(page) {
  await page.waitForFunction(() => Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('"parcels"')), null, { timeout: 10000 }).catch(() => {});
  const seeded = await page.evaluate(([decor, hints]) => {
    const key = Object.keys(localStorage).find(k => !k.startsWith('parcelwood.mock.') && (localStorage.getItem(k) || '').includes('"parcels"'));
    if (!key) return null;
    const s = JSON.parse(localStorage.getItem(key));
    s.town = { ...s.town, rep: 900, level: 8 };
    s.introSeen = true; s.guideSeen = true; s.hintsSeen = hints;
    s.firstGoals = { started: true, done: [], off: true };
    s.decor = { owned: decor, hidden: [] };
    s.coins = 9999;
    return { key, json: JSON.stringify(s) };
  }, [DECOR, HINTS]);
  if (!seeded) return null;
  // Write the seed before the app boots, so an in-flight save from the first visit cannot overwrite it.
  await page.addInitScript(([key, json]) => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('parcelwood.mock.')) localStorage.removeItem(k);
    localStorage.removeItem('parcelwood.saveMeta');
    localStorage.setItem(key, json);
  }, [seeded.key, seeded.json]);
  return seeded.key;
}

async function dismiss(page) {
  for (let i = 0; i < 8; i++) {
    const btn = page.locator('#sheet-close:visible, #back-shelf:visible, #modal-root .modal-back [data-close]:visible').last();
    if (!(await btn.count())) return;
    await btn.click({ timeout: 700 }).catch(() => {});
    await page.waitForTimeout(180);
  }
}

async function goStation(page) {
  await dismiss(page);
  await page.evaluate(() => { const b = document.querySelector('[data-view="station"]'); if (b) b.click(); });
  await page.waitForSelector('.facade', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
}

function rects(page) {
  return page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    const facade = document.querySelector('.facade');
    const imgs = [...document.querySelectorAll('.facade img.deco')];
    return {
      facade: facade ? box(facade) : null,
      decor: imgs.map(i => ({ cls: i.className, src: i.getAttribute('src'), natural: [i.naturalWidth, i.naturalHeight], ...box(i) })),
      sign: document.querySelector('.facade .sign span') ? box(document.querySelector('.facade .sign span')) : null,
      open: document.querySelector('#decor-open') ? box(document.querySelector('#decor-open')) : null,
    };
  });
}

function overlap(a, b) {
  const x = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return { x, y };
}

const browser = await launch();
try {
  // 1. All decor at three sizes.
  for (const v of [{ n: '320', w: 320, h: 568 }, { n: '390', w: 390, h: 844 }, { n: '1440', w: 1440, h: 900 }]) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, colorScheme: 'light' });
    await ctx.addInitScript(() => { localStorage.setItem('parcelwood.age', 'ok'); localStorage.setItem('parcelStation.lang', 'en'); });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    await seed(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(900);
    await goStation(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.facade img.deco')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
    const data = await rects(page);
    R('Q13-count', v.n, 'all 14 decor are drawn', data.decor.length === 14, 'decor=' + data.decor.length + ' loaded=' + data.decor.filter(d => d.natural[0] > 0).length);
    R('Q13-facade', v.n, 'all decor loaded at 256px', data.decor.every(d => d.natural[0] === 256 && d.natural[1] === 256), data.decor.map(d => d.natural.join('x')).join(','));
    const bad = [];
    for (let i = 0; i < data.decor.length; i++) {
      const a = data.decor[i];
      if (!data.facade) continue;
      if (a.x < data.facade.x - 1 || a.y < data.facade.y - 1 || a.right > data.facade.right + 1 || a.bottom > data.facade.bottom + 1) bad.push('outside:' + a.cls);
      for (let j = i + 1; j < data.decor.length; j++) {
        const o = overlap(a, data.decor[j]);
        if (o.x > 4 && o.y > 4) bad.push(a.cls + '~' + data.decor[j].cls + '=' + o.x.toFixed(1) + 'x' + o.y.toFixed(1));
      }
      if (data.sign) { const o = overlap(a, data.sign); if (o.x > 4 && o.y > 4) bad.push('sign~' + a.cls); }
      if (data.open) { const o = overlap(a, data.open); if (o.x > 4 && o.y > 4) bad.push('open~' + a.cls); }
    }
    R('Q13-overlap', v.n, 'no two decor boxes overlap by more than 4 px', bad.length === 0, bad.join('; ') || 'clean');
    await page.locator('.panel.counter').screenshot({ path: join(OUT, 'station-decor-' + v.n + '.png') });
    await ctx.close();
  }

  // 2. Banners, banner fallback and dark mode.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'light' });
    await ctx.addInitScript(() => { localStorage.setItem('parcelwood.age', 'ok'); localStorage.setItem('parcelStation.lang', 'en'); });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(900);
    await seed(page); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(900);
    await goStation(page);
    const ev = page.locator('.event-card .ev-banner').first();
    const wk = page.locator('.week-card .week-banner').first();
    R('Q10-event', '390', 'event banner image shown', await ev.count() === 1, await ev.getAttribute('src').catch(() => 'none'));
    R('Q10-week', '390', 'Station Week banner shown', await wk.count() === 1, await wk.getAttribute('src').catch(() => 'none'));
    if (await ev.count()) {
      await page.locator('.event-card').scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await page.waitForFunction(() => { const i = document.querySelector('.event-card .ev-banner'); return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
      const info = await ev.evaluate(i => { const r = i.getBoundingClientRect(); return { nat: [i.naturalWidth, i.naturalHeight], box: [r.width, r.height] }; });
      R('Q10-size', '390', 'banner 750x250 and rendered <=120 px tall', info.nat[0] === 750 && info.nat[1] === 250 && info.box[1] <= 120, JSON.stringify(info));
      await page.locator('.event-card').screenshot({ path: join(OUT, 'banner-event.png') });
    }
    if (await wk.count()) { await page.locator('.week-card').scrollIntoViewIfNeeded(); await page.locator('.week-card').screenshot({ path: join(OUT, 'banner-week.png') }); }
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await ctx.addInitScript(() => { localStorage.setItem('parcelwood.age', 'ok'); localStorage.setItem('parcelStation.lang', 'en'); });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(900);
    await seed(page); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(900);
    await goStation(page);
    await page.locator('.event-card').scrollIntoViewIfNeeded();
    await page.locator('.event-card').screenshot({ path: join(OUT, 'dark-banner-event.png') });
    await page.locator('.panel.counter').screenshot({ path: join(OUT, 'dark-station-decor.png') });
    R('Q14-dark', '390', 'dark-mode banner and station render', await page.locator('.event-card .ev-banner').count() === 1, 'screenshots saved');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'light' });
    await ctx.addInitScript(() => { localStorage.setItem('parcelwood.age', 'ok'); localStorage.setItem('parcelStation.lang', 'en'); });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(900);
    await seed(page); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(900);
    await goStation(page);
    await page.locator('.event-card').scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    // A missing / failed banner file in the deploy (the same 404 path DevTools blocking produces).
    await page.evaluate(() => { const i = document.querySelector('.event-card img.ev-banner'); if (i) i.src = 'ui/banner-missing.webp'; });
    await page.waitForTimeout(1000);
    const evBanner = await page.locator('.event-card img.ev-banner').count();
    const evRow = await page.locator('.event-card .ev-body').count();
    R('Q11-fallback', '390', 'blocked banner falls back to the old icon row', evBanner === 0 && evRow === 1, 'banner=' + evBanner + ' row=' + evRow);
    await page.locator('.event-card').screenshot({ path: join(OUT, 'banner-fallback.png') }).catch(() => {});
    await ctx.close();
  }

  // 3. Dube in the coach bubble at phone, short landscape and 320x480.
  for (const v of [{ n: '390x844', w: 390, h: 844 }, { n: '320x480', w: 320, h: 480 }, { n: '568x320', w: 568, h: 320 }]) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, colorScheme: 'light' });
    await ctx.addInitScript(() => { localStorage.setItem('parcelwood.age', 'ok'); localStorage.setItem('parcelStation.lang', 'en'); });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(1200);
    const img = page.locator('#coach-root img.coach-guide').first();
    const count = await img.count();
    const src = count ? await img.getAttribute('src') : 'none';
    R('Q12-guide', v.n, 'Dube points in the coach bubble', count === 1 && /guide-point\.webp$/.test(src), 'src=' + src);
    if (count) {
      const info = await img.evaluate(i => { const r = i.getBoundingClientRect(); return { box: [Math.round(r.width), Math.round(r.height)], nat: [i.naturalWidth, i.naturalHeight] }; });
      R('Q12-guide-size', v.n, 'guide picture 56 px (40 px on small/short)', info.box[0] === (v.w <= 360 || v.h <= 520 ? 40 : 56) && info.nat[0] === 256, JSON.stringify(info));
      const cover = await page.evaluate(() => {
        const b = document.querySelector('#coach-root .coach-bubble');
        const t = document.querySelector('.coach-target');
        if (!b || !t) return { ok: false, why: 'missing bubble or target' };
        const a = b.getBoundingClientRect(), c = t.getBoundingClientRect();
        const x = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const y = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        return { ok: !(x > 4 && y > 4), rect: [a.x, a.y, a.width, a.height].map(Math.round), target: [c.x, c.y, c.width, c.height].map(Math.round) };
      });
      R('Q12-no-cover', v.n, 'coach bubble does not cover its target', cover.ok, JSON.stringify(cover));
      await page.screenshot({ path: join(OUT, 'guide-' + v.n + '.png') });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.pass);
console.log('\nSUMMARY', results.length - failed.length + '/' + results.length, 'passed');
if (failed.length) { console.log('FAILED:', failed.map(f => f.id + '@' + f.view + ' ' + f.evidence).join(' || ')); process.exitCode = 1; }
