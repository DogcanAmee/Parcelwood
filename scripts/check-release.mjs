// Release check for the two uploads (CrazyGames and Discord). Run after the builds:
//   npm run build:crazygames && npm run build:discord && npm run check:release
// Fails when a platform-only file, the dev panel or a web-only file slipped into an upload.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const problems = [];
const rows = [];

function assets(dir) {
  try { return readdirSync(join(dir, 'assets')); } catch { return []; }
}
function sizeOf(dir) {
  let total = 0;
  for (const f of assets(dir)) total += statSync(join(dir, 'assets', f)).size;
  return total;
}
/** Every .DS_Store under dir, including nested folders. */
function dsStoreFiles(dir) {
  const out = [];
  const walk = d => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === '.DS_Store') out.push(p);
    }
  };
  walk(dir);
  return out;
}
function zipEntries(zip) {
  try { return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch (e) { problems.push(`CrazyGames zip: cannot list ${zip}: ${e.message}`); return []; }
}
function checkZips() {
  let zips = [];
  try { zips = readdirSync('release').filter(f => f.endsWith('.zip')); } catch { return; }
  for (const name of zips) {
    const entries = zipEntries(join('release', name));
    const junk = entries.filter(f => /\.DS_Store$/.test(f));
    if (junk.length) problems.push(`CrazyGames zip ${name}: .DS_Store inside (${junk.slice(0, 3).join(', ')})`);
  }
}
function read(dir, file) {
  try { return readFileSync(join(dir, file), 'utf8'); } catch { return null; }
}
function bundleText(dir) {
  return assets(dir).filter(f => f.endsWith('.js')).map(f => read(dir, 'assets/' + f) || '').join('');
}
/** Fails when a platform's own dependency or marker is in another platform's upload. */
function checkTokens(name, dir, forbidden) {
  const all = bundleText(dir);
  if (!all) return;
  for (const { label, pattern } of forbidden) {
    if (pattern.test(all)) problems.push(`${name}: ${label} is in the bundle`);
  }
}
function check(name, dir, { html, sdk }) {
  const files = assets(dir);
  if (!files.length) { problems.push(`${name}: no build in ${dir} (run the build first)`); return; }
  // Rush Hour and Station Week ship on every build: both lazy chunks must be present.
  if (!files.some(f => /^week-.*\.js$/.test(f))) problems.push(`${name}: missing Station Week chunk`);
  if (read(dir, 'sw.js')) problems.push(`${name}: sw.js (web only)`);
  if (read(dir, 'manifest.webmanifest')) problems.push(`${name}: manifest.webmanifest (web only)`);
  const index = read(dir, html);
  if (!index) { problems.push(`${name}: missing ${html}`); return; }
  if (!sdk.test(index)) problems.push(`${name}: ${html} does not match the expected host page`);
  if (name === 'CrazyGames' && !index.includes('id="cg-loading"')) problems.push(`${name}: ${html} has no inline loading screen`);
  const all = bundleText(dir);
  if (/dev-unlock|dev-metrics|DEV CLOCK/.test(all)) problems.push(`${name}: developer panel or dev clock code is in the bundle`);
  rows.push([name, (sizeOf(dir) / 1024).toFixed(0) + ' kB', String(files.length) + ' files']);
}

const CG_ONLY = [
  { label: 'AdMob code', pattern: /admob/i },
  { label: 'Paddle code', pattern: /paddle/i },
  { label: 'RevenueCat code', pattern: /revenuecat/i },
  { label: 'Supabase code', pattern: /supabase/i },
];
const APP_ONLY = [
  { label: 'CrazyGames code', pattern: /sdk\.crazygames\.com|crazygames/i },
  { label: 'service worker registration', pattern: /serviceWorker|sw\.js/i },
];

const cgJunk = dsStoreFiles('dist-crazygames');
if (cgJunk.length) problems.push(`CrazyGames build: .DS_Store inside (${cgJunk.slice(0, 3).join(', ')})`);
const previewJunk = dsStoreFiles('dist-crazygames-preview');
if (previewJunk.length) problems.push(`CrazyGames preview build: .DS_Store inside (${previewJunk.slice(0, 3).join(', ')})`);
checkZips();

check('CrazyGames', 'dist-crazygames', { html: 'index.html', sdk: /sdk\.crazygames\.com/ });
checkTokens('CrazyGames', 'dist-crazygames', CG_ONLY);
check('Discord', 'discord/dist', { html: 'index.html', sdk: /discord/i });
// The phone build starts at M3. When dist-app exists, it must carry no host-site code or web service worker.
if (assets('dist-app').length) checkTokens('App', 'dist-app', APP_ONLY);

for (const [name, total, count] of rows) console.log(`${name.padEnd(12)} ${total.padStart(8)}  ${count}`);

// The same ten window sizes the platform asks for. The script serves the build itself and writes screenshots.
console.log('\nRunning the 10-size layout check ...');
try {
  execFileSync(process.execPath, ['qa/cg-layout.mjs', '--dir', 'dist-crazygames', '--out', 'qa/tao-24/screens', '--quiet'], { stdio: 'inherit' });
} catch (e) {
  problems.push('layout check failed (see the table above)');
}
if (problems.length) {
  console.error('\nRelease check failed:');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('\nRelease check passed.');
