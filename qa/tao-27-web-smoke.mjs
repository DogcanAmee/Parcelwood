// TAO-27: web (main site) build smoke. Browser-bundled Chromium only; closed in finally.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };
const dir = process.argv[2] || 'dist';
const OUT = process.argv[3] || 'qa/tao-27';
const server = createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html'; const f=normalize(join(dir,p)); if(!f.startsWith(dir)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[extname(f)]||'text/plain'}); createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port+'/';
const b = await chromium.launch({headless:true});
const results = [];
try {
  const ctx = await b.newContext({ viewport: {width:1280,height:720}, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  mkdirSync(join(OUT, 'web-smoke'), { recursive: true });
  const ageShown = await page.evaluate(() => !!document.querySelector('#age-gate') || document.body.textContent.toLowerCase().includes('age') || document.body.textContent.includes('年份'));
  await page.screenshot({ path: join(OUT, 'web-smoke/0-first.png') });
  if (await page.locator('#age-gate, #age-m, #age-y').count()) {
    await page.locator('#age-m').selectOption('6').catch(() => {});
    await page.locator('#age-y').selectOption('2000').catch(() => {});
    await page.locator('#age-go').click().catch(()=>{});
  }
  await page.waitForFunction(() => document.querySelector('#app [data-parcel]') || document.querySelector('.nav'), null, { timeout: 20000 });
  await page.waitForTimeout(900);
  const parcels = await page.locator('#app [data-parcel]').count();
  const nav = await page.locator('#nav-in button[data-view]').count();
  await page.screenshot({ path: join(OUT, 'web-smoke/1-station.png') });
  // open a parcel quickly
  let opened = false;
  if (parcels) {
    await page.locator('#app [data-parcel]').first().click({ force: true });
    await page.waitForTimeout(500);
    opened = await page.locator('#sheet-root .sheet').count() > 0;
  }
  await page.screenshot({ path: join(OUT, 'web-smoke/2-inspect.png') });
  const mutedBtn = await page.locator('#mute').count();
  results.push({ check: 'age screen shown', ok: !!ageShown });
  results.push({ check: 'station renders with parcels', ok: parcels > 0 && nav > 0, detail: parcels + ' parcels, ' + nav + ' nav buttons' });
  results.push({ check: 'inspect sheet opens', ok: opened });
  results.push({ check: 'mute button present', ok: mutedBtn > 0 });
  results.push({ check: 'no console/page errors', ok: errs.length === 0, detail: errs.slice(0,3).join(' | ') });
  await ctx.close();
} finally { await b.close(); server.close(); }
console.log(results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.check + (r.detail ? ' · ' + r.detail : '')).join('\n'));
writeFileSync(join(OUT, 'web-smoke-report.json'), JSON.stringify(results, null, 1) + '\n');
console.log('\nWeb smoke: ' + (results.every(r => r.ok) ? 'PASS' : 'FAIL'));
if (!results.every(r => r.ok)) process.exitCode = 1;
