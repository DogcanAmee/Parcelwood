// Entry for the Discord Activity build (npm run build:discord). The web build (src/main.ts) does not import this file.
//
// Inside Discord (the page has a frame_id) with a client id and Supabase key: real Discord sign-in, cloud saves
// and Discord purchases. Anywhere else: a local mock of Discord and of our server, for development and previews.
// A release build opened outside Discord only says where to play, unless VITE_DISCORD_PREVIEW=1.
import '../src/styles.css';
import '../src/fonts';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { startApp } from '../src/ui/app';
import { webPlatform } from '../src/platform/web';
import { DISCORD_FEATURES, type Platform } from '../src/platform/types';
import { readDiscordConfig } from '../src/discord/config';
import { createDiscordBackend } from '../src/discord/backend';
import { startScreen } from '../src/discord/notice';
import type { DiscordSdkLike } from '../src/discord/sdk';

const cfg = readDiscordConfig(import.meta.env);
const inDiscord = new URLSearchParams(window.location.search).has('frame_id');
const devTools = import.meta.env.DEV || import.meta.env.VITE_DEVTOOLS === '1';
const preview = import.meta.env.DEV || import.meta.env.VITE_DISCORD_PREVIEW === '1';
// ?mobile in a preview shows what phone players see (no purchases).
const mockPlatform = new URLSearchParams(window.location.search).has('mobile') ? 'mobile' : 'desktop';

async function main() {
  let sdk: DiscordSdkLike | null = null;
  if (inDiscord) {
    if (!cfg.clientId || !cfg.supabaseKey) {
      // A release build without its settings would silently fall back to the mock: refuse instead.
      if (!preview) { startScreen('setup'); return; }
    } else {
      const real = new DiscordSDK(cfg.clientId);
      await real.ready();
      sdk = real;
    }
  } else if (!preview) {
    startScreen('outside'); return;
  }
  const backend = createDiscordBackend(sdk, cfg, webPlatform.kv, window.location.origin, { platform: mockPlatform });
  await backend.store.start();
  if (devTools) { const m = await import('../src/debug/clock'); m.installDevClock(webPlatform.kv); }
  // One platform object per entry. The shared UI reads its flags, store and auth through this interface.
  const platform: Platform = {
    ...webPlatform,
    id: 'discord',
    features: DISCORD_FEATURES,
    store: backend.store,
  };
  startApp(platform, devTools, backend);
}

main().catch(() => startScreen('error'));
