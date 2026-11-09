import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';
import { carryCode, carryReceived, carrySent, carryThanks, earnCarry, emptySocial, guildClaim, guildNext, guildTier, parseCarry } from '../src/core/social';
import { seeded } from '../src/core/daily';
import { SOCIAL_UI } from '../src/i18n/social';

const MON = new Date(2026, 10, 2, 9, 0, 0).getTime();
const DAY = 86400000;

describe('carried parcels', () => {
  it('earns one parcel a day, never stacked, and sending it clears it', () => {
    const s = newState(MON);
    expect(earnCarry(s, MON)).toBe(true);
    expect(earnCarry(s, MON + 1000)).toBe(false);
    expect(earnCarry(s, MON + DAY)).toBe(false); // the old one was never sent: no second one on top
    carrySent(s);
    expect(s.social).toMatchObject({ carryReady: false, sent: 1 });
    carrySent(s);
    expect(s.social.sent).toBe(1);
    expect(earnCarry(s, MON + 2 * DAY)).toBe(true);
  });

  it('a received parcel lands on the shelf with shards; thanks pay per friend, capped', () => {
    const s = newState(MON), shelf = s.parcels.length, sh = s.shards;
    expect(carryReceived(s, seeded(3))).toEqual({ shards: CONFIG.social.carryShards });
    expect(s.parcels.length).toBe(shelf + 1);
    expect(s.shards).toBe(sh + CONFIG.social.carryShards);
    expect(s.social.got).toBe(1);
    expect(carryThanks(s, 2)).toBe(2 * CONFIG.social.carryShards);
    expect(carryThanks(s, -4)).toBe(0);
    expect(carryThanks(s, 500)).toBe(10 * CONFIG.social.carryShards);
  });

  it('link codes carry exactly one 32-hex token', () => {
    const tok = 'ab'.repeat(16);
    expect(parseCarry(carryCode(tok))).toBe(tok);
    for (const bad of [null, '', 'carry:', 'carry:' + tok + 'x', 'carry:' + 'Z'.repeat(32), tok]) expect(parseCarry(bad)).toBeNull();
  });
});

describe('server board', () => {
  it('counts goals reached and the next goal', () => {
    const [a, b, c] = CONFIG.social.guildGoals;
    expect([guildTier(0), guildTier(a), guildTier(b - 1), guildTier(c)]).toEqual([0, 1, 1, 3]);
    expect([guildNext(0), guildNext(a), guildNext(c)]).toEqual([a, b, null]);
  });

  it('pays each goal once a week, and only players who helped', () => {
    const s = newState(MON), [a, b] = CONFIG.social.guildGoals, G = CONFIG.social.guildShards, sh = s.shards;
    expect(guildClaim(s, MON, b, 0)).toEqual({ tiers: 0, shards: 0 });
    expect(guildClaim(s, MON, a, 1)).toEqual({ tiers: 1, shards: G });
    expect(guildClaim(s, MON, a, 2)).toEqual({ tiers: 0, shards: 0 });
    expect(guildClaim(s, MON + DAY, b, 3)).toEqual({ tiers: 1, shards: G });
    expect(s.shards).toBe(sh + 2 * G);
    expect(guildClaim(s, MON + 7 * DAY, a, 1)).toEqual({ tiers: 1, shards: G }); // a new week starts over
    expect(s.social.guildWeek).toBe('2026-11-09');
  });
});

describe('social save', () => {
  it('old saves get empty counters and bad data starts them over', () => {
    const s: any = newState(MON);
    delete s.social;
    expect(sanitizeState(JSON.parse(JSON.stringify(s)))!.social).toEqual(emptySocial());
    for (const bad of [{ ...emptySocial(), sent: -1 }, { ...emptySocial(), carryDay: 'monday' }, { ...emptySocial(), guildPaid: 9 }, 'x']) {
      s.social = bad;
      expect(sanitizeState(JSON.parse(JSON.stringify(s)))!.social).toEqual(emptySocial());
    }
    s.social = { carryDay: '2026-11-02', carryReady: true, sent: 4, got: 2, guildWeek: '2026-11-02', guildPaid: 2 };
    expect(sanitizeState(JSON.parse(JSON.stringify(s)))!.social).toEqual(s.social);
  });

  it('every language has the same social strings', () => {
    const keys = Object.keys(SOCIAL_UI.en).sort();
    expect(Object.keys(SOCIAL_UI.zh).sort()).toEqual(keys);
    expect(Object.keys(SOCIAL_UI.es).sort()).toEqual(keys);
  });
});
