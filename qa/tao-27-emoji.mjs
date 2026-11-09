// Runtime emoji scan on the built CrazyGames release bundle: every page and state,
// counts system emoji in visible text and accessibility labels (icons install replaces them).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2' };
const dir = process.argv[2] || 'dist-crazygames';
const out = process.argv[3] || 'qa/tao-27';
const server = createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html'; const f=normalize(join(dir,p)); if(!f.startsWith(dir)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[extname(f)]||'text/plain'}); createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port+'/';
const FAKE_SDK = readFileSync('qa/cg-layout.mjs','utf8').match(/const FAKE_SDK = `([\s\S]*?)`;/)[1];
const b = await chromium.launch({headless:true});
const rows = [];
try {
  for (const [w,h] of [[1280,720],[420,900]]) {
    const ctx = await b.newContext({ viewport: {width:w,height:h}, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('https://sdk.crazygames.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SDK }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#nav-in button[data-view]'), null, { timeout: 20000 }).catch(()=>{});
    await page.waitForTimeout(500);
    await page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; document.getElementById('coach-root')?.remove(); document.body.classList.remove('coach-on'); });
    const scan = () => page.evaluate(() => {
      const EMOJI = /\p{Extended_Pictographic}/u;
      const hits = [];
      for (const el of document.body.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        for (const attr of ['aria-label','title']) {
          const v = el.getAttribute && el.getAttribute(attr);
          if (v && EMOJI.test(v)) hits.push(attr + ':' + v.trim().slice(0,30));
        }
        if (!el.closest('script,style,textarea')) {
          for (const n of el.childNodes) {
            if (n.nodeType === 3 && EMOJI.test(n.data)) hits.push('text:' + n.data.trim().slice(0,30));
          }
        }
      }
      return [...new Set(hits)];
    });
    for (const view of ['station','town','album','shop']) {
      await page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; });
      const nav = page.locator('#nav-in button[data-view="' + view + '"]').first();
      if (await nav.count()) { await nav.click({ force: true }); await page.waitForTimeout(150); }
      const hits = await scan();
      rows.push({ size: w + 'x' + h, state: view, emoji: hits });
      // open inspect sheet too
      if (view === 'station' && await page.locator('#app [data-parcel]').count()) {
        await page.locator('#app [data-parcel]').first().click({ force: true });
        await page.waitForTimeout(500);
        rows.push({ size: w + 'x' + h, state: 'inspect', emoji: await scan() });
        if (await page.locator('#sheet-root button:visible').count()) {
          await page.locator('#sheet-root button:visible').first().click({ force: true }); await page.waitForTimeout(300);
          rows.push({ size: w + 'x' + h, state: 'after-advance', emoji: await scan() });
        }
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    }
    await page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; });
    // help popup
    if (await page.locator('#help').count()) {
      await page.locator('#help').click({ force: true }); await page.waitForTimeout(250);
      rows.push({ size: w + 'x' + h, state: 'help', emoji: await scan() });
      await page.evaluate(() => { const m = document.getElementById('modal-root'); if (m) m.innerHTML = ''; });
    }
    rows.push({ size: w + 'x' + h, state: 'pageerrors', emoji: errs });
    await ctx.close();
  }
} finally { await b.close(); server.close(); }
const bad = rows.filter(r => (r.emoji && r.emoji.length));
console.log(rows.map(r => r.size + ' ' + r.state + '\t' + (r.emoji ? (r.emoji.length ? 'HITS ' + JSON.stringify(r.emoji.slice(0,5)) : '0') : '')).join('\n'));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'emoji-scan.json'), JSON.stringify(rows, null, 1) + '\n');
console.log('\nRuntime emoji scan: ' + (bad.length ? 'FAIL' : 'PASS'));
if (bad.length) process.exitCode = 1;
