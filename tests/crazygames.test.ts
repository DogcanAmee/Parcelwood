// CrazyGames SDK wrapper: start-up, ad results, Data module saves with fallback and one-time migration.
import { describe, expect, it, vi } from 'vitest';
import { initSdk, type CgAdCallbacks, type CgSdk } from '../src/crazygames/sdk';
import { createCrazyGamesAds, detectAdblock } from '../src/crazygames/ads';
import { MIGRATE_KEYS, MIGRATED_KEY, dataKv, hostHooks, languages } from '../src/crazygames/platform';
import { LANG_KEY, STATE_KEY } from '../src/platform/web';
import { memKv } from './helpers';

type AdScript = (cb: CgAdCallbacks) => void;
function fakeSdk(opts: { env?: string; adblock?: boolean; ad?: AdScript; dataOff?: boolean; locale?: string; mute?: boolean } = {}) {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const sdk: CgSdk = {
    init: async () => {},
    environment: opts.env ?? 'crazygames',
    ad: {
      requestAd: (type, cb) => { calls.push('ad:' + type); (opts.ad || (c => { c.adStarted?.(); c.adFinished?.(); }))(cb); },
      hasAdblock: async () => !!opts.adblock,
    },
    game: {
      gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop'), happytime: () => calls.push('happy'),
      settings: { muteAudio: !!opts.mute },
      addSettingsChangeListener: () => calls.push('listen'),
    },
    data: {
      getItem: k => { if (opts.dataOff) throw Object.assign(new Error('off'), { code: 'dataModuleDisabled' }); return store.get(k) ?? null; },
      setItem: (k, v) => { if (opts.dataOff) throw new Error('off'); store.set(k, v); },
      removeItem: k => { store.delete(k); },
    },
    user: { systemInfo: { locale: opts.locale } },
  };
  return { sdk, store, calls };
}

describe('initSdk', () => {
  it('returns the SDK on CrazyGames and on localhost', async () => {
    for (const env of ['crazygames', 'local']) {
      const { sdk } = fakeSdk({ env });
      expect(await initSdk({ CrazyGames: { SDK: sdk } } as unknown as Window)).toBe(sdk);
    }
  });
  it('returns null when the SDK is missing, disabled, failing or too slow', async () => {
    expect(await initSdk({} as Window)).toBeNull();
    expect(await initSdk({ CrazyGames: { SDK: fakeSdk({ env: 'disabled' }).sdk } } as unknown as Window)).toBeNull();
    const failing = { ...fakeSdk().sdk, init: () => Promise.reject(new Error('x')) };
    expect(await initSdk({ CrazyGames: { SDK: failing } } as unknown as Window)).toBeNull();
    const slow = { ...fakeSdk().sdk, init: () => new Promise<void>(() => {}) };
    expect(await initSdk({ CrazyGames: { SDK: slow } } as unknown as Window, 20)).toBeNull();
  });
});

describe('CrazyGames ads', () => {
  it('rewards only when the ad finishes, and calls onStart when it starts', async () => {
    const { sdk } = fakeSdk();
    const onStart = vi.fn();
    expect(await createCrazyGamesAds(sdk).rewarded(onStart)).toBe('rewarded');
    expect(onStart).toHaveBeenCalledOnce();
  });
  it('maps errors: no fill or cooldown = failed; ad blocker or ads off = unavailable for the session', async () => {
    for (const code of ['unfilled', 'adCooldown', 'other']) {
      const ads = createCrazyGamesAds(fakeSdk({ ad: c => c.adError?.({ code }) }).sdk);
      expect(await ads.rewarded(() => {})).toBe('failed');
      expect(ads.available()).toBe(true);
    }
    for (const code of ['adblock', 'adsDisabled', 'adsDisabledBasicLaunch']) {
      const ads = createCrazyGamesAds(fakeSdk({ ad: c => c.adError?.({ code }) }).sdk);
      expect(await ads.midgame(() => {})).toBe('unavailable');
      expect(ads.available()).toBe(false);
    }
  });
  it('a finish after an error, or a second finish, changes nothing', async () => {
    const ads = createCrazyGamesAds(fakeSdk({ ad: c => { c.adError?.({ code: 'unfilled' }); c.adFinished?.(); } }).sdk);
    expect(await ads.rewarded(() => {})).toBe('failed');
  });
  it('checks for an ad blocker before the first screen; with one, no ad buttons and no ad requests', async () => {
    const blocked = fakeSdk({ adblock: true });
    expect(await detectAdblock(blocked.sdk)).toBe(true);
    expect(await detectAdblock(fakeSdk().sdk)).toBe(false);
    const slow = { ...fakeSdk().sdk, ad: { ...fakeSdk().sdk.ad, hasAdblock: () => new Promise<boolean>(() => {}) } };
    expect(await detectAdblock(slow, 20)).toBe(false); // unknown: try ads, the first result corrects it
    const ads = createCrazyGamesAds(blocked.sdk, { adblock: true });
    expect(ads.available()).toBe(false);
    expect(await ads.midgame(() => {})).toBe('unavailable');
    expect(blocked.calls.filter(c => c.startsWith('ad:'))).toEqual([]);
  });
  it('gives up on an ad that never starts', async () => {
    const ads = createCrazyGamesAds(fakeSdk({ ad: () => {} }).sdk, { startTimeoutMs: 20 });
    expect(await ads.rewarded(() => {})).toBe('failed');
  });
  it('a long ad that started is waited for to the end, then rewarded', async () => {
    let finish: (() => void) | undefined;
    const ads = createCrazyGamesAds(fakeSdk({ ad: c => { c.adStarted?.(); finish = c.adFinished; } }).sdk, { startTimeoutMs: 20, playTimeoutMs: 5000 });
    const r = ads.rewarded(() => {});
    await new Promise(res => setTimeout(res, 60)); // longer than the start timeout
    finish!();
    expect(await r).toBe('rewarded');
  });
  it('treats a throwing SDK as no ads', async () => {
    const ads = createCrazyGamesAds(fakeSdk({ ad: () => { throw new Error('disabled'); } }).sdk);
    expect(await ads.rewarded(() => {})).toBe('unavailable');
  });
});

describe('saves through the Data module', () => {
  it('copies an existing browser save once, then reads and writes the Data module', () => {
    const { sdk, store } = fakeSdk();
    const local = memKv();
    local.set('parcelStation.v1', '{"old":1}');
    const kv = dataKv(sdk, local)!;
    expect(store.get('parcelStation.v1')).toBe('{"old":1}');
    kv.set('parcelStation.v1', '{"new":1}');
    expect(store.get('parcelStation.v1')).toBe('{"new":1}');
    // A second start must not overwrite the account's save with the old browser copy.
    dataKv(sdk, local);
    expect(store.get('parcelStation.v1')).toBe('{"new":1}');
    expect(local.get(MIGRATED_KEY)).toBe('1');
  });
  it('a second account in the same browser starts fresh, and the moved browser copy is gone', () => {
    const local = memKv();
    local.set('parcelStation.v1', '{"old":1}');
    dataKv(fakeSdk().sdk, local);
    expect(local.get('parcelStation.v1')).toBeNull();
    const other = fakeSdk();
    dataKv(other.sdk, local);
    expect(other.store.get('parcelStation.v1')).toBeUndefined();
  });
  it('never overwrites an account save with a browser save', () => {
    const { sdk, store } = fakeSdk();
    store.set('parcelStation.v1', '{"account":30}');
    const local = memKv();
    local.set('parcelStation.v1', '{"old":1}');
    dataKv(sdk, local);
    expect(store.get('parcelStation.v1')).toBe('{"account":30}');
    local.set('parcelStation.v1', '{"blockedSession":1}'); // a later session that played without the SDK
    dataKv(sdk, local);
    expect(store.get('parcelStation.v1')).toBe('{"account":30}');
  });
  it('keeps the browser save when the account already has one, then moves it into the first account without one', () => {
    const first = fakeSdk();
    first.store.set(STATE_KEY, '{"account":30}');
    const local = memKv();
    local.set(STATE_KEY, '{"old":1}');
    local.set(LANG_KEY, 'es');
    local.set(MIGRATE_KEYS[2], '{"ad":1}');
    dataKv(first.sdk, local);
    // The account save is untouched, and the browser keeps the save, language and ad record for an account with none.
    expect(first.store.get(STATE_KEY)).toBe('{"account":30}');
    expect(local.get(STATE_KEY)).toBe('{"old":1}');
    expect(local.get(LANG_KEY)).toBe('es');
    expect(local.get(MIGRATE_KEYS[2])).toBe('{"ad":1}');
    expect(local.get(MIGRATED_KEY)).toBeNull();
    // The first account without a save gets the browser copy; then the browser copy is deleted and marked moved.
    const second = fakeSdk();
    dataKv(second.sdk, local);
    expect(second.store.get(STATE_KEY)).toBe('{"old":1}');
    expect(second.store.get(LANG_KEY)).toBe('es');
    expect(second.store.get(MIGRATE_KEYS[2])).toBe('{"ad":1}');
    expect(local.get(STATE_KEY)).toBeNull();
    expect(local.get(LANG_KEY)).toBeNull();
    expect(local.get(MIGRATE_KEYS[2])).toBeNull();
    expect(local.get(MIGRATED_KEY)).toBe('1');
  });
  it('with no browser save, copies the rest once and marks the browser as migrated', () => {
    const { sdk, store } = fakeSdk();
    const local = memKv();
    local.set(LANG_KEY, 'es');
    local.set(MIGRATE_KEYS[2], '{"ad":1}');
    dataKv(sdk, local);
    expect(store.get(LANG_KEY)).toBe('es');
    expect(store.get(MIGRATE_KEYS[2])).toBe('{"ad":1}');
    expect(local.get(LANG_KEY)).toBeNull();
    expect(local.get(MIGRATE_KEYS[2])).toBeNull();
    expect(local.get(MIGRATED_KEY)).toBe('1');
  });
  it('keeps the browser copy when the Data module refuses a write during migration', () => {
    const f = fakeSdk();
    f.sdk.data.setItem = () => { throw new Error('too big'); };
    const local = memKv();
    local.set(STATE_KEY, '{"old":1}');
    const kv = dataKv(f.sdk, local)!;
    expect(local.get(STATE_KEY)).toBe('{"old":1}');
    expect(local.get(MIGRATED_KEY)).toBeNull();
    expect(kv.get(STATE_KEY)).toBe('{"old":1}'); // read back from the browser this session
  });
  it('a write the Data module refuses is kept in the browser and read back this session', () => {
    const f = fakeSdk();
    const kv = dataKv(f.sdk, memKv())!;
    f.sdk.data.setItem = () => { throw new Error('too big'); };
    kv.set('parcelStation.v1', '{"v":3}');
    expect(kv.get('parcelStation.v1')).toBe('{"v":3}');
  });
  it('falls back to browser storage when the Data module is off or missing', () => {
    expect(dataKv(fakeSdk({ dataOff: true }).sdk, memKv())).toBeNull();
    expect(dataKv(null, memKv())).toBeNull();
  });
});

describe('host hooks and language', () => {
  it('forwards gameplay events and the site mute setting, and never throws without an SDK', () => {
    const { sdk, calls } = fakeSdk({ mute: true });
    const h = hostHooks(sdk);
    h.gameplayStart(); h.gameplayStop(); h.happy(); h.onMutedChange(() => {});
    expect(calls).toEqual(['start', 'stop', 'happy', 'listen']);
    expect(h.muted()).toBe(true);
    const none = hostHooks(null);
    expect(() => { none.gameplayStart(); none.happy(); }).not.toThrow();
    expect(none.muted()).toBe(false);
  });
  it('puts the CrazyGames locale first', () => {
    expect(languages(fakeSdk({ locale: 'es-ES' }).sdk, ['en-US'])).toEqual(['es-ES', 'en-US']);
    expect(languages(null, ['en-US'])).toEqual(['en-US']);
  });
});
