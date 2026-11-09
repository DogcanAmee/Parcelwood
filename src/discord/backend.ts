// Puts the Discord build together: sign-in, cloud saves and the shop, real or mock.
import type { Backend } from '../auth';
import { createMockSaveStore } from '../auth/mock';
import { createSupabaseSaveStore } from '../auth/supabase';
import type { Kv } from '../platform/types';
import { createDiscordAuth, type DiscordAuthService } from './auth';
import type { DiscordConfig } from './config';
import { createMockDiscord, type MockOptions } from './mock';
import type { DiscordSdkLike } from './sdk';
import { createDiscordStore, type DiscordStore } from './store';
import { installDiscordStrings } from './strings';
import { createDiscordSocial, createMockSocial, createSupabaseSocial } from './social';
import { createDiscordSupabaseClient, createSupabaseClaimBackend, createSupabaseDiscordBridge } from './supabase';

export interface DiscordBackend extends Backend {
  auth: DiscordAuthService;
  store: DiscordStore;
  sdk: DiscordSdkLike;
}

/**
 * sdk: the real Discord SDK when running inside Discord, or null for the local mock.
 * origin: the page origin (https://<app id>.discordsays.com inside Discord).
 */
export function createDiscordBackend(sdk: DiscordSdkLike | null, cfg: DiscordConfig, kv: Kv, origin: string, mock: MockOptions = {}): DiscordBackend {
  installDiscordStrings(); // shop and account text for this build only
  if (sdk && cfg.supabaseKey) {
    const sb = createDiscordSupabaseClient(origin + cfg.supabasePrefix, cfg.supabaseKey);
    const auth = createDiscordAuth(sdk, createSupabaseDiscordBridge(sb));
    return {
      sdk,
      auth,
      saves: createSupabaseSaveStore(sb),
      store: createDiscordStore(sdk, cfg, createSupabaseClaimBackend(sb), kv, () => auth.user()?.id ?? null),
      social: (s => createDiscordSocial(sdk, s.carry, s.guild))(createSupabaseSocial(sb)),
    };
  }
  // Otherwise everything is local: fake Discord, fake server, saves in this browser (dev, tests, previews).
  // discord/main.ts never takes this path inside real Discord in a release build.
  const m = createMockDiscord(cfg, kv, mock);
  const auth = createDiscordAuth(m.sdk, m.bridge);
  const ms = createMockSocial(kv, m.who);
  return { sdk: m.sdk, auth, saves: createMockSaveStore(kv), store: createDiscordStore(m.sdk, cfg, m.claims, kv, () => auth.user()?.id ?? null), social: createDiscordSocial(m.sdk, ms.carry, ms.guild) };
}
