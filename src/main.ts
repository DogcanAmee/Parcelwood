import './styles.css';
import './fonts';
import { startApp } from './ui/app';
import { webPlatform } from './platform/web';
import type { Platform } from './platform/types';
import { createH5Ads } from './web/ads';
import { createWebShare } from './web/share';
import { createWebTime } from './web/time';
import { createBackend } from './auth';
import { startSingleTab } from './ui/tabGuard';
import type { LockManagerLike } from './platform/tabLock';

// With VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY set (see .env.example), sign-in and cloud saves use Supabase.
// Without them, a local mock stands in, so the game runs with no account anywhere.
const backend = createBackend(
  { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
  webPlatform.kv,
  window.location.origin + window.location.pathname,
);

// Dev tools (unlock all, demo luck, resets) exist in `npm run dev` and in test previews built with VITE_DEVTOOLS=1.
// Never set VITE_DEVTOOLS for a release build.
// Only one tab at a time plays and saves; a second tab offers "Play here" to move the game over (src/ui/tabGuard.ts).
const devTools = import.meta.env.DEV || import.meta.env.VITE_DEVTOOLS === '1';

// M1 test ads. With no publisher id the adapter shows a local test ad (no network, no account, no cost).
// A publisher id switches to Google's H5 Games Ads tag in test mode (`data-adbreak-test="on"`).
// QA switches: ?adsblocked=1 pretends an ad blocker is on; ?ads=local forces the local test ad.
const params = new URLSearchParams(window.location.search);
const ads = createH5Ads({
  clientId: import.meta.env.VITE_ADSENSE_CLIENT,
  local: params.get('ads') === 'local' || !import.meta.env.VITE_ADSENSE_CLIENT,
  blocked: params.get('adsblocked') === '1' || params.get('ads') === 'off',
});
const share = createWebShare();

startSingleTab(webPlatform, (navigator as Navigator & { locks?: LockManagerLike }).locks, platform => {
  const time = createWebTime({ kv: platform.kv, devTools });
  const web: Platform = { ...platform, ads, share, time };
  let stop = () => {};
  void (async () => {
    if (devTools) { const m = await import('./debug/clock'); m.installDevClock(platform.kv); }
    stop = startApp(web, devTools, backend);
  })();
  return () => stop();
});

// Offline play and "add to home screen" for the web build. Off in dev, so edits always show.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* still playable online */ }); });
}
