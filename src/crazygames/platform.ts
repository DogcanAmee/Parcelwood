// CrazyGames build: saves through the SDK Data module (follows the player's CrazyGames account across devices),
// falling back to browser storage when the module is off; sound and gameplay events go to the SDK.
// Nothing here talks to our own servers: this build collects no personal data (all-ages build, COPPA).
import type { AdService, HostHooks, Kv, Platform } from '../platform/types';
import { CRAZYGAMES_FEATURES } from '../platform/types';
import { LANG_KEY, STATE_KEY, browserLanguages, kvPlatform, webKv } from '../platform/web';
import type { CgSdk } from './sdk';

/** Keys copied once from browser storage into the Data module, so a returning player keeps their progress. */
export const MIGRATE_KEYS = [STATE_KEY, LANG_KEY, 'parcelwood.adLedger']; // no age answer: this build has no age screen
/** Browser-storage flag: this browser's old save has been moved into a Data module once; never copy it again. */
export const MIGRATED_KEY = 'parcelwood.cg.migrated';

/**
 * The Data module as a Kv, or null when it is unavailable (not chosen at submission, or no SDK).
 *
 * Saves are never merged between the Data module and browser storage, so a stale copy can never overwrite an
 * account's progress. A session without the module (ad blocker blocking the SDK, slow start) plays on browser
 * storage, which stays separate. When the account already has a save, the browser copy is left untouched (nothing
 * copied, nothing deleted, no migrated flag), so it is still there for the first account that has none. Otherwise the
 * old browser save is moved into that account once: the local copy is deleted after a clean copy, so a second account
 * on the same browser starts fresh.
 */
export function dataKv(sdk: CgSdk | null, fallback: Kv = webKv): Kv | null {
  if (!sdk || !sdk.data) return null;
  try { sdk.data.getItem('parcelwood.probe'); } catch { return null; }
  const spilled = new Set<string>(); // keys whose latest write failed here (e.g. over 1 MB): read them back from the browser this session
  let ok = true;
  const kv: Kv = {
    get(key) {
      if (spilled.has(key)) return fallback.get(key);
      try { return sdk.data.getItem(key); } catch { return fallback.get(key); }
    },
    set(key, value) {
      try { sdk.data.setItem(key, value); spilled.delete(key); } catch { ok = false; spilled.add(key); fallback.set(key, value); }
    },
    remove(key) { spilled.delete(key); try { sdk.data.removeItem(key); } catch { /* ignore */ } fallback.remove(key); },
  };
  if (fallback.get(MIGRATED_KEY) == null) {
    // The account already has a save: keep the browser copy for the first account without one.
    if (fallback.get(STATE_KEY) != null && kv.get(STATE_KEY) != null) return kv;
    for (const k of MIGRATE_KEYS) {
      const old = fallback.get(k);
      if (old != null && kv.get(k) == null) kv.set(k, old);
    }
    if (ok) { for (const k of MIGRATE_KEYS) fallback.remove(k); fallback.set(MIGRATED_KEY, '1'); }
  }
  return kv;
}

export function hostHooks(sdk: CgSdk | null): HostHooks {
  const safe = (f: () => void) => { try { f(); } catch { /* SDK not ready or disabled: never break the game */ } };
  return {
    gameplayStart: () => { if (sdk) safe(() => sdk.game.gameplayStart()); },
    gameplayStop: () => { if (sdk) safe(() => sdk.game.gameplayStop()); },
    happy: () => { if (sdk) safe(() => sdk.game.happytime()); },
    muted: () => { try { return !!(sdk && sdk.game.settings && sdk.game.settings.muteAudio); } catch { return false; } },
    onMutedChange: cb => { if (sdk && sdk.game.addSettingsChangeListener) safe(() => sdk.game.addSettingsChangeListener!(() => cb())); },
  };
}

/** Languages to try, the CrazyGames locale first (store rule), then the browser's. */
export function languages(sdk: CgSdk | null, browser: readonly string[]): readonly string[] {
  let loc: string | undefined;
  try { loc = sdk && sdk.user && sdk.user.systemInfo ? sdk.user.systemInfo.locale : undefined; } catch { loc = undefined; }
  return typeof loc === 'string' && loc ? [loc, ...browser] : browser;
}

export function createCrazyGamesPlatform(sdk: CgSdk | null, ads: AdService, opts: { ageGate: boolean }): Platform {
  const kv = dataKv(sdk) || webKv;
  return {
    ...kvPlatform(kv, 'crazygames', { ...CRAZYGAMES_FEATURES, ageGate: opts.ageGate }),
    preferredLanguages: () => languages(sdk, browserLanguages()),
    ads,
    host: hostHooks(sdk),
    ageGate: opts.ageGate,
  };
}
