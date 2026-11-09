import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

// QA_BASE=https://<preview-host> node qa/tao-86/qa.mjs
const BASE = process.env.QA_BASE || 'http://localhost:4173';
const SHOT = 'qa/tao-86/screens';
mkdirSync(SHOT, { recursive: true });

const browser = await chromium.launch({ headless: true, ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}) });
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function closeModals(page) {
  for (let i = 0; i < 30; i++) {
    const b = page.locator('#modal-root .modal-back button:visible').first();
    if (await b.count().catch(() => 0)) { await b.click().catch(() => {}); await page.waitForTimeout(250); continue; }
    if (await page.locator('.week-card').count()) break;
    await page.waitForTimeout(400);
  }
}

try {
  {
    const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      localStorage.setItem('parcelStation.lang', 'zh');
      localStorage.setItem('parcelwood.age', 'ok');
    });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const page = await ctx.newPage();
    await page.goto(BASE + '/?devlv=4&devday=1', { waitUntil: 'load', timeout: 60000 });
    await closeModals(page);
    const card = page.locator('.week-card');
    await card.scrollIntoViewIfNeeded().catch(() => {});
    const text = await card.innerText();
    check('preview loads Station Week with dev tools', text.includes('驿站一周'), text.split('\n')[0]);
    check('devday=1 still opens the weekend window', text.includes('周末活动开放中'), text.split('\n').slice(0, 4).join(' / '));
    await page.screenshot({ path: SHOT + '/01-week-card-open.png', fullPage: false });

    await page.locator('.week-card').scrollIntoViewIfNeeded().catch(() => {});
    await page.locator('#week-open').click();
    await page.waitForSelector('.wk', { timeout: 30000 });
    await page.locator('[data-w="start"]').first().click();
    for (let i = 0; i < 600; i++) {
      if (await page.locator('.wk-end').count()) break;
      if (await page.locator('.wk-stamp').count()) { await page.locator('[data-w="skip"]').first().click(); continue; }
      if (await page.locator('.wk-parcel').count()) { await page.locator('.wk-parcel').first().click(); await page.locator('.wk-route[data-w="sell"]').first().click(); continue; }
      if (await page.locator('[data-w="end"]').count()) {
        const e = page.locator('[data-w="end"]').first();
        await e.click();
        await page.waitForTimeout(150);
        if (await page.locator('[data-w="end"]').count()) await e.click().catch(() => {});
        continue;
      }
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);
    check('a full run reaches the end screen', await page.locator('.wk-end').count() > 0);
    await page.screenshot({ path: SHOT + '/02-week-end.png', fullPage: false });

    await page.locator('.wk [data-w="share"]').first().click();
    await page.waitForTimeout(800);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + String(e));
    check('share copies a result', clip.includes('Parcelwood') || clip.includes('驿站一周'), JSON.stringify(clip).slice(0, 160));
    check('share text has no devlv', !clip.includes('devlv'), clip);
    check('share text has no devday', !clip.includes('devday'), clip);
    check('share URL is the clean page address', clip.includes(BASE + '/') && !clip.includes(BASE + '/?'), clip);
  }

  {
    const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      localStorage.setItem('parcelStation.lang', 'zh');
      localStorage.setItem('parcelwood.age', 'ok');
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/?devlv=4', { waitUntil: 'load', timeout: 60000 });
    await closeModals(page);
    const before = await page.locator('.week-card').innerText();
    check('the real weekday starts closed', before.includes('周末奖励周五开放'), before.split('\n').slice(0, 4).join(' / '));
    await page.evaluate(() => {
      const real = Date.now;
      Date.now = () => real() + 3 * 86400000;
    });
    await page.locator('.nav [data-view="station"]').click().catch(() => {});
    await page.waitForTimeout(400);
    const afterJump = await page.locator('.week-card').innerText();
    check('changing Date.now does not open the weekend early', afterJump.includes('周末奖励周五开放'), afterJump.split('\n').slice(0, 4).join(' / '));
    await page.screenshot({ path: SHOT + '/03-device-clock-jump-still-closed.png', fullPage: false });
  }
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) process.exit(1);
