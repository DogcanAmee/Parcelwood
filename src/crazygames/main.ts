// Entry point of the CrazyGames build (crazygames/index.html). The web build's entry is src/main.ts.
// All ages: no age screen, no shop, no sign-in, no outside links, no requests to our servers, no service worker.
// CrazyGames hosts the files and serves the ads; the player's CrazyGames account (or the browser) keeps the save.
import '../styles.css';
import './crazygames.css';
import '../fonts';
import { startApp } from '../ui/app';
import { initSdk } from './sdk';
import { createCrazyGamesAds, detectAdblock, noAds } from './ads';
import { createMockAds } from './mockAds';
import { createCrazyGamesPlatform } from './platform';
import { CRAZYGAMES_CONFIG } from './config';

const MOCK = import.meta.env.VITE_CG_MOCK_ADS === '1';

// The CrazyGames stage is a fixed, scroll-free layout (src/crazygames/crazygames.css). The class is added before
// the first render so no unstyled/short-page flash appears.
document.body.classList.add('cg-stage');
document.documentElement.classList.add('cg-stage');

// The game sits in an iframe on CrazyGames: Space and the arrow keys must not scroll the host page.
// Only when nothing is focused, so buttons, the language menu and text fields keep their keys.
window.addEventListener('keydown', e => {
  const tgt = e.target as HTMLElement | null;
  if ((e.key === ' ' || e.key.startsWith('Arrow')) && (!tgt || tgt === document.body)) e.preventDefault();
});

function hideLoading() {
  const el = document.getElementById('cg-loading');
  if (!el) return;
  el.classList.add('cg-loading-done');
  window.setTimeout(() => el.remove(), 260);
}

(async () => {
  const sdk = MOCK ? null : await initSdk();
  // Tell CrazyGames the game is loading while the SDK starts; the inline screen covers the same time.
  if (sdk) { try { sdk.game.loadingStart?.(); } catch { /* the loading screen still covers a slow SDK */ } }
  const ads = MOCK ? createMockAds() : sdk ? createCrazyGamesAds(sdk, { adblock: await detectAdblock(sdk) }) : noAds;
  const platform = createCrazyGamesPlatform(sdk, ads, CRAZYGAMES_CONFIG);
  if (MOCK) document.body.classList.add('cg-test-build');
  // The dev panel exists only in `npm run dev:crazygames` and in the mock-ads preview; never in the upload build.
  const devTools = import.meta.env.DEV || (MOCK && import.meta.env.VITE_DEVTOOLS === '1');
  if (devTools) { const m = await import('../debug/clock'); m.installDevClock(platform.kv); }
  startApp(platform, devTools);
  // Let the first app frame paint before lifting the branded screen, then tell the SDK the game is ready.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (sdk) { try { sdk.game.loadingStop?.(); } catch { /* never block the game on a host call */ } }
    hideLoading();
  }));
})().catch(() => {
  // If boot fails, release the loading screen so the host page can show its own error instead of a stuck overlay.
  hideLoading();
});
