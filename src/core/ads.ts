// Rewards for ad-supported builds (CrazyGames). Pure rules: no DOM, no SDK, no storage, no clock except `now`.
// Store rules this follows: reward only after the ad finishes, never chain ads for one reward, don't offer
// rewarded ads too often (a cooldown the button shows), always offer a non-ad way to get the same reward (coins),
// and no break ad in the first minutes of a session.
import { CONFIG } from './config';
import { binCount, localDay, makeParcel } from './logic';
import type { GameState, Rng } from './types';

export type AdReward = 'parcels' | 'mystery';
export const AD_REWARDS: readonly AdReward[] = ['parcels', 'mystery'];

export const AD_RULES = {
  /** Time between two rewarded ads. The reward buttons show a countdown meanwhile. */
  rewardedCooldownMs: 3 * 60 * 1000,
  /** Rewarded ads per local day. */
  rewardedPerDay: 8,
  /** Parcels from one "early truck" reward, never past a full shelf. */
  parcelsPerReward: 3,
  /** The non-ad alternative: the same reward for coins. */
  coinPrice: { parcels: 90, mystery: 60 } as Record<AdReward, number>,
  /** A break ad is asked for at most once every this many opened parcels... */
  midgameEveryOpens: 3,
  /** ...and never in the first minutes of a session. The ad network adds its own minimum gap on top. */
  midgameFirstAfterMs: 3 * 60 * 1000,
};

/** How many rewarded ads were watched today and when the last one finished. Kept on the device, not in the save. */
export interface AdLedger { day: string | null; count: number; last: number }

export function newLedger(): AdLedger { return { day: null, count: 0, last: 0 }; }

/** Anything that is not a well-formed ledger becomes a fresh one. */
export function sanitizeLedger(x: unknown): AdLedger {
  if (!x || typeof x !== 'object') return newLedger();
  const o = x as Record<string, unknown>;
  const day = o.day === null || (typeof o.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.day)) ? o.day as string | null : undefined;
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && Number.isInteger(n);
  if (day === undefined || !ok(o.count) || !ok(o.last)) return newLedger();
  return { day, count: Math.min(o.count as number, 1000), last: o.last as number };
}

export interface RewardedStatus { ready: boolean; waitMs: number; left: number }

/**
 * Whether a rewarded ad may be offered now.
 * Moving the clock back does not open a new day: when today is before the ledger's day, that day still counts,
 * so winding the clock back cannot refill the daily allowance. Only a day after the ledger's day starts over.
 */
export function rewardedStatus(ledger: AdLedger, now: number): RewardedStatus {
  const today = localDay(new Date(now));
  const used = ledger.day !== null && today <= ledger.day ? ledger.count : 0;
  const left = Math.max(0, AD_RULES.rewardedPerDay - used);
  // A last ad "in the future" (clock moved back, or a save from a device whose clock runs ahead) is stale: no wait,
  // or the countdown would restart at every render until real time caught up.
  const waitMs = ledger.last > now ? 0 : Math.min(AD_RULES.rewardedCooldownMs, Math.max(0, ledger.last + AD_RULES.rewardedCooldownMs - now));
  return { ready: left > 0 && waitMs === 0, waitMs, left };
}

/**
 * Call once per finished rewarded ad.
 * Moving the clock back stays on the ledger's day and keeps counting up, so it cannot reset the daily allowance;
 * only a later day starts a fresh count.
 */
export function recordRewarded(ledger: AdLedger, now: number): AdLedger {
  const today = localDay(new Date(now));
  if (ledger.day !== null && today < ledger.day) return { day: ledger.day, count: ledger.count + 1, last: now };
  return { day: today, count: (ledger.day === today ? ledger.count : 0) + 1, last: now };
}

/** How many parcels a reward would add right now (0 = no room, so the offer is shown as full). */
export function rewardRoom(state: GameState, kind: AdReward): number {
  if (kind === 'parcels') {
    const normal = state.parcels.filter(p => p.kind === 'normal').length;
    return Math.max(0, Math.min(AD_RULES.parcelsPerReward, CONFIG.shelfSize - normal));
  }
  return binCount(state) < CONFIG.mysteryMax ? 1 : 0;
}

/** Hands out the reward. Extra parcels use the same odds and guarantees as daily ones. Returns how many arrived. */
export function grantReward(state: GameState, kind: AdReward, rng: Rng): number {
  const n = rewardRoom(state, kind);
  for (let i = 0; i < n; i++) state.parcels.push(makeParcel(state, kind === 'parcels' ? 'normal' : 'mystery', rng));
  return n;
}

/** The same reward for coins. Returns how many parcels arrived (0 = not enough coins or no room; nothing is spent). */
export function buyWithCoins(state: GameState, kind: AdReward, rng: Rng): number {
  const price = AD_RULES.coinPrice[kind];
  if (state.coins < price || rewardRoom(state, kind) === 0) return 0;
  state.coins -= price;
  return grantReward(state, kind, rng);
}

/** Whether to ask for a break ad now, after a parcel was opened. */
export function midgameDue(opensSinceBreak: number, sessionStart: number, now: number): boolean {
  return opensSinceBreak >= AD_RULES.midgameEveryOpens && now - sessionStart >= AD_RULES.midgameFirstAfterMs;
}
