// TAO-153 C0 live preview check: injects a small save with one request letter, opens the request popup at
// 320x460, 320x568 and 568x320, screenshots it and checks that the whole popup is reachable.
// Usage: QA_BASE=https://... node qa/tao-153/live-preview.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.QA_BASE || process.argv[2] || '').replace(/\/$/, '') + '/';
if (!BASE || BASE === '/') { console.error('Set QA_BASE to a preview URL'); process.exit(2); }
const OUT = join(import.meta.dirname, 'screens');
const RESULT = join(import.meta.dirname, 'live-result.json');
mkdirSync(OUT, { recursive: true });

const results = [];
const R = (view, req, pass, evidence) => {
  const row = { view, req, pass: !!pass, evidence: String(evidence).replace(/\s+/g, ' ').slice(0, 400) };
  results.push(row);
  console.log((row.pass ? 'PASS' : 'FAIL') + ' | ' + view + ' | ' + req + ' | ' + row.evidence);
  writeFileSync(RESULT, JSON.stringify(results, null, 2));
};

async function launch() {
  try { return await chromium.launch({ headless: true }); }
  catch { try { return await chromium.launch({ headless: true, channel: 'chrome' }); }
    catch { return await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); } }
}

const dismissModals = async page => {
  for (let i = 0; i < 10; i++) {
    if (!(await page.locator('#modal-root .modal-back').count())) return;
    const close = page.locator('#modal-root .modal-back [data-close]').last();
    const any = page.locator('#modal-root .modal-back button:visible').last();
    try { await (await close.count() ? close : any).click({ timeout: 800 }); } catch { return; }
    await page.waitForTimeout(250);
  }
};

const seed = page => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => (localStorage.getItem(k) || '').includes('"parcels"'));
  if (!key) return null;
  const s = JSON.parse(localStorage.getItem(key));
  const d = new Date();
  const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  s.town = { ...s.town, rep: 999999, level: 7 };
  s.introSeen = true; s.guideSeen = true; s.hintsSeen = [];
  s.firstGoals = { started: true, done: [], off: true };
  s.owned = { popcorn: 2 };
  s.board = {
    day,
    tasks: [{ kind: 'wish', by: 'theo', need: 1, got: 0, arg: null, claimed: false, clues: [{ k: 'snd', v: 'rustle' }] }],
    made: [day], bonus: false, stamps: 0,
  };
  localStorage.setItem(key, JSON.stringify(s));
  return key;
});

async function goTown(page) {
  for (let i = 0; i < 12; i++) {
    await dismissModals(page);
    try { await page.click('[data-view="town"]', { timeout: 3000 }); return true; } catch { /* popup covers nav */ }
  }
  return false;
}

async function measure(page) {
  return await page.evaluate(() => {
    const back = document.querySelector('#modal-root .modal-back');
    const modal = back.querySelector('.modal');
    const pick = modal.querySelector('.pickgrid');
    const close = modal.querySelector('[data-close]');
    back.scrollTop = 0;
    const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
    const before = { modal: r(modal), pick: r(pick), close: r(close) };
    back.scrollTop = back.scrollHeight;
    const cr = r(close), cx = (cr.left + cr.right) / 2, cy = (cr.top + cr.bottom) / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth, scrollHeight: back.scrollHeight, clientHeight: back.clientHeight, before, afterScroll: { close: cr, hitInside: !!(hit && close.contains(hit)) } };
  });
}

const VIEWS = [
  { name: '320x460', width: 320, height: 460 },
  { name: '320x568', width: 320, height: 568 },
  { name: '568x320', width: 568, height: 320 },
];

let browser;
try {
  browser = await launch();
  console.log('Live QA base: ' + BASE);
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      localStorage.setItem('parcelwood.age', 'ok');
      localStorage.setItem('parcelStation.lang', 'en');
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    try {
      await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1800);
      await dismissModals(page);
      const key = await seed(page);
      if (!key) throw new Error('no local save key found');
      await page.reload({ waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1800);
      if (!(await goTown(page))) throw new Error('town nav not reachable');
      const req = page.locator('[data-req]').first();
      await req.waitFor({ state: 'attached', timeout: 20000 });
      await req.evaluate(el => el.click());
      await page.waitForSelector('#modal-root .modal-back .pickgrid', { timeout: 15000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, 'request-live-' + v.name + '.png') });
      const m = await measure(page);
      R(v.name, 'modal top is on screen', m.before.modal.top >= 0, 'top=' + m.before.modal.top + ' vh=' + m.vh);
      R(v.name, 'whole popup fits in the visible viewport', m.before.modal.top >= 0 && m.before.modal.bottom <= m.vh + 1,
        'modal=' + m.before.modal.top + '..' + m.before.modal.bottom + ' vh=' + m.vh + ' pickgrid=' + m.before.pick.top + '..' + m.before.pick.bottom);
      R(v.name, 'close button on screen and tappable', m.before.close.bottom <= m.vh + 1 && m.afterScroll.close.bottom <= m.vh + 1 && m.afterScroll.hitInside,
        'close=' + m.before.close.top + '..' + m.before.close.bottom + ' scroll=' + m.scrollHeight + '/' + m.clientHeight + ' hit=' + m.afterScroll.hitInside);
      R(v.name, 'no horizontal overflow', m.docW <= m.vw + 1, 'doc=' + m.docW + ' vw=' + m.vw);
    } catch (e) {
      await page.screenshot({ path: join(OUT, 'request-live-' + v.name + '-fail.png') }).catch(() => {});
      const dbg = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => (localStorage.getItem(k) || '').includes('"parcels"'));
        const s = key ? JSON.parse(localStorage.getItem(key)) : null;
        return { key, view: document.querySelector('[aria-current="page"]')?.getAttribute('data-view'), reqs: document.querySelectorAll('[data-req]').length,
          tasks: s?.board?.tasks?.map(t => t.kind + ':' + t.by), boardDay: s?.board?.day, day: s?.day, owned: s?.owned, town: s?.town?.level,
          modal: document.querySelectorAll('#modal-root .modal').length, body: (document.body.innerText || '').slice(0, 160) };
      }).catch(err => ({ err: err.message }));
      R(v.name, 'request popup opens', false, e.message.split('\n')[0] + ' | ' + JSON.stringify(dbg));
    }
    await ctx.close();
  }
  const failed = results.filter(r => !r.pass);
  console.log('\n' + (failed.length ? 'FAILED: ' + failed.length + ' of ' + results.length : 'ALL ' + results.length + ' CHECKS PASS'));
  process.exitCode = failed.length ? 1 : 0;
} finally {
  if (browser) await browser.close();
}
