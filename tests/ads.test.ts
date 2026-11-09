// Ad reward rules for the CrazyGames build: cooldown, daily cap, room on the shelf, coin alternative, break-ad pacing.
import { describe, expect, it } from 'vitest';
import { AD_RULES, buyWithCoins, grantReward, midgameDue, newLedger, recordRewarded, rewardRoom, rewardedStatus, sanitizeLedger } from '../src/core/ads';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
const seq = (x: number) => () => x;

const NOON = new Date(2026, 10, 2, 12, 0, 0).getTime();
const normal = (s: ReturnType<typeof newState>) => s.parcels.filter(p => p.kind === 'normal').length;
const mystery = (s: ReturnType<typeof newState>) => s.parcels.filter(p => p.kind === 'mystery').length;

describe('rewarded ad pacing', () => {
  it('is ready at first, then waits one cooldown', () => {
    let l = newLedger();
    expect(rewardedStatus(l, NOON).ready).toBe(true);
    l = recordRewarded(l, NOON);
    const st = rewardedStatus(l, NOON + 1000);
    expect(st.ready).toBe(false);
    expect(st.waitMs).toBe(AD_RULES.rewardedCooldownMs - 1000);
    expect(rewardedStatus(l, NOON + AD_RULES.rewardedCooldownMs).ready).toBe(true);
  });

  it('stops after the daily cap and starts over the next day', () => {
    let l = newLedger();
    let t = NOON;
    for (let i = 0; i < AD_RULES.rewardedPerDay; i++) { l = recordRewarded(l, t); t += AD_RULES.rewardedCooldownMs; }
    expect(rewardedStatus(l, t).left).toBe(0);
    expect(rewardedStatus(l, t).ready).toBe(false);
    expect(rewardedStatus(l, NOON + 24 * 3600 * 1000).ready).toBe(true);
  });

  it('moving the clock back a day or two does not reset the daily cap', () => {
    let l = newLedger();
    let t = NOON;
    for (let i = 0; i < AD_RULES.rewardedPerDay; i++) { l = recordRewarded(l, t); t += AD_RULES.rewardedCooldownMs; }
    for (const daysBack of [1, 2]) {
      const st = rewardedStatus(l, NOON - daysBack * 24 * 3600 * 1000);
      expect(st.ready).toBe(false);
      expect(st.left).toBe(0);
    }
  });

  it('moving the clock back keeps the same day: 5 used leaves 3, and those 3 finish the day', () => {
    let l = newLedger();
    let t = NOON;
    for (let i = 0; i < 5; i++) { l = recordRewarded(l, t); t += AD_RULES.rewardedCooldownMs; }
    const back = NOON - 24 * 3600 * 1000;
    expect(rewardedStatus(l, back).left).toBe(3);
    let b = back;
    for (let i = 0; i < 3; i++) { l = recordRewarded(l, b); b += AD_RULES.rewardedCooldownMs; }
    expect(l.count).toBe(AD_RULES.rewardedPerDay);
    expect(rewardedStatus(l, b).left).toBe(0);
    expect(rewardedStatus(l, b).ready).toBe(false);
  });

  it('moving forward to the next day still resets the cap', () => {
    let l = newLedger();
    let t = NOON;
    for (let i = 0; i < AD_RULES.rewardedPerDay; i++) { l = recordRewarded(l, t); t += AD_RULES.rewardedCooldownMs; }
    const nextDay = NOON + 24 * 3600 * 1000;
    expect(rewardedStatus(l, nextDay).left).toBe(AD_RULES.rewardedPerDay);
    expect(rewardedStatus(l, nextDay).ready).toBe(true);
  });

  it('a last ad in the future (clock moved back) is stale: no wait, at any later moment either', () => {
    const l = recordRewarded(newLedger(), NOON + 10 * 3600 * 1000);
    for (const now of [NOON, NOON + 1000, NOON + AD_RULES.rewardedCooldownMs + 1]) expect(rewardedStatus(l, now).waitMs).toBe(0);
  });

  it('turns a malformed ledger into a fresh one', () => {
    for (const bad of [null, 'x', 5, { day: 'nope', count: 1, last: 0 }, { day: null, count: -1, last: 0 }, { day: null, count: 1.5, last: 0 }, { day: null, count: 1, last: 'x' }]) {
      expect(sanitizeLedger(bad)).toEqual(newLedger());
    }
    expect(sanitizeLedger({ day: '2026-11-02', count: 3, last: 9 })).toEqual({ day: '2026-11-02', count: 3, last: 9 });
  });
});

describe('ad rewards', () => {
  it('adds up to 3 normal parcels, never past a full shelf', () => {
    const s = newState(NOON);
    expect(grantReward(s, 'parcels', seq(0.5))).toBe(3);
    expect(normal(s)).toBe(3);
    for (let i = 0; i < 4; i++) grantReward(s, 'parcels', seq(0.5));
    expect(normal(s)).toBe(CONFIG.shelfSize);
    expect(rewardRoom(s, 'parcels')).toBe(0);
    expect(grantReward(s, 'parcels', seq(0.5))).toBe(0);
  });

  it('adds one misdelivered parcel until the bin is full', () => {
    const s = newState(NOON);
    for (let i = 0; i < CONFIG.mysteryMax; i++) expect(grantReward(s, 'mystery', seq(0.5))).toBe(1);
    expect(mystery(s)).toBe(CONFIG.mysteryMax);
    expect(grantReward(s, 'mystery', seq(0.5))).toBe(0);
  });

  it('extra parcels are rolled with the normal odds and pity when picked up', () => {
    const s = newState(NOON);
    grantReward(s, 'parcels', seq(0.5));
    expect(s.parcels.every(p => !p.rolled && p.kind === 'normal')).toBe(true);
  });

  it('sells the same reward for coins, and spends nothing when it cannot deliver', () => {
    const s = newState(NOON);
    s.coins = AD_RULES.coinPrice.parcels - 1;
    expect(buyWithCoins(s, 'parcels', seq(0.5))).toBe(0);
    expect(s.coins).toBe(AD_RULES.coinPrice.parcels - 1);
    s.coins = 1000;
    expect(buyWithCoins(s, 'parcels', seq(0.5))).toBe(3);
    expect(s.coins).toBe(1000 - AD_RULES.coinPrice.parcels);
    for (let i = 0; i < CONFIG.mysteryMax; i++) grantReward(s, 'mystery', seq(0.5));
    const before = s.coins;
    expect(buyWithCoins(s, 'mystery', seq(0.5))).toBe(0);
    expect(s.coins).toBe(before);
  });
});

describe('break ads', () => {
  it('waits for 3 opened parcels and the first minutes of a session', () => {
    expect(midgameDue(AD_RULES.midgameEveryOpens, NOON, NOON + AD_RULES.midgameFirstAfterMs - 1)).toBe(false);
    expect(midgameDue(AD_RULES.midgameEveryOpens - 1, NOON, NOON + 3600_000)).toBe(false);
    expect(midgameDue(AD_RULES.midgameEveryOpens, NOON, NOON + AD_RULES.midgameFirstAfterMs)).toBe(true);
  });
});
