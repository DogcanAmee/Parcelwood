// Video ads through the CrazyGames SDK, behind the game's AdService interface.
import type { AdResult, AdService } from '../platform/types';
import type { CgSdk } from './sdk';

/** An ad that never starts (or never reports back) must not leave the game covered for good. */
export const AD_START_TIMEOUT_MS = 60_000; // generous: an ad starting after we gave up would play over the game
/** Once an ad has started, wait for the SDK's own finish or error; this is only a last-resort safety net. */
export const AD_PLAY_TIMEOUT_MS = 10 * 60_000;

/**
 * Asks the SDK once whether an ad blocker is on, waiting at most `ms`, so the first screen never shows
 * ad buttons that can't work. Unknown (slow or failing check) counts as no blocker; the first ad result corrects it.
 */
export function detectAdblock(sdk: CgSdk, ms = 1500): Promise<boolean> {
  return new Promise(resolve => {
    const tm = setTimeout(() => resolve(false), ms);
    let p: Promise<boolean>;
    try { p = sdk.ad.hasAdblock(); } catch { clearTimeout(tm); resolve(false); return; }
    p.then(b => { clearTimeout(tm); resolve(!!b); }, () => { clearTimeout(tm); resolve(false); });
  });
}

export function createCrazyGamesAds(
  sdk: CgSdk,
  opts: { adblock?: boolean; startTimeoutMs?: number; playTimeoutMs?: number } = {},
): AdService {
  // Players with an ad blocker can play everything; they just don't see ad buttons (store rule: never punish them).
  let usable = !opts.adblock;
  const startMs = opts.startTimeoutMs ?? AD_START_TIMEOUT_MS, playMs = opts.playTimeoutMs ?? AD_PLAY_TIMEOUT_MS;

  function request(type: 'midgame' | 'rewarded', onStart: () => void): Promise<AdResult> {
    if (!usable) return Promise.resolve('unavailable');
    return new Promise(resolve => {
      let done = false;
      let tm = setTimeout(() => end('failed'), startMs);
      function end(r: AdResult) { if (done) return; done = true; clearTimeout(tm); resolve(r); }
      try {
        sdk.ad.requestAd(type, {
          // A long ad must not time out half-way: the player would lose the reward and hear the game over the ad.
          adStarted: () => { if (done) return; clearTimeout(tm); tm = setTimeout(() => end('failed'), playMs); onStart(); },
          adFinished: () => end('rewarded'),
          adError: e => {
            const code = String((e && e.code) || '');
            if (code === 'adblock' || code.startsWith('adsDisabled')) { usable = false; end('unavailable'); } // adsDisabled*, e.g. adsDisabledBasicLaunch: Basic Launch, Kids mode, offline
            else end('failed'); // unfilled, adCooldown, other: try again later, no reward now
          },
        });
      } catch {
        usable = false; end('unavailable');
      }
    });
  }
  return {
    available: () => usable,
    rewarded: onStart => request('rewarded', onStart),
    midgame: onStart => request('midgame', onStart),
  };
}

/** For builds with no SDK: no ad buttons, coin options only. */
export const noAds: AdService = {
  available: () => false,
  rewarded: () => Promise.resolve('unavailable'),
  midgame: () => Promise.resolve('unavailable'),
};
