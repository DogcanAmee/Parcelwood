import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { canCheckIn, checkIn } from '../src/core/checkin';
import { seeded } from '../src/core/daily';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';

const T0 = new Date(2026, 10, 2, 9, 0, 0).getTime();
const DAY = 86400000;
const rng = seeded(3);

describe('check-in card', () => {
  it('takes one stamp a day and pays 10 coins', () => {
    const s = newState(T0), coins = s.coins;
    expect(canCheckIn(s, T0)).toBe(true);
    const r = checkIn(s, T0, rng)!;
    expect(r).toMatchObject({ coins: CONFIG.checkin.coins, big: null, stamps: 1, cards: 0 });
    expect(s.coins).toBe(coins + CONFIG.checkin.coins);
    expect(canCheckIn(s, T0)).toBe(false);
    expect(checkIn(s, T0, rng)).toBeNull();
    expect(s.checkin.stamps).toBe(1);
  });

  it('never resets on a missed day', () => {
    const s = newState(T0);
    checkIn(s, T0, rng);
    checkIn(s, T0 + DAY, rng);
    // Skip several days, then check in: the two stamps are still there.
    expect(checkIn(s, T0 + 5 * DAY, rng)!.stamps).toBe(3);
  });

  it('the fifth stamp pays the big delivery and starts a new card', () => {
    const s = newState(T0);
    for (let i = 0; i < 4; i++) expect(checkIn(s, T0 + i * DAY, rng)!.big).toBeNull();
    const parcels = s.parcels.length, shards = s.shards, coins = s.coins;
    const big = checkIn(s, T0 + 4 * DAY, rng)!;
    expect(big.big).toEqual({ coins: CONFIG.checkin.coins, parcels: CONFIG.checkin.bigParcels, shards: CONFIG.checkin.bigShards });
    expect(big.coins).toBe(2 * CONFIG.checkin.coins);
    expect(big.stamps).toBe(0);
    expect(big.cards).toBe(1);
    expect(s.coins).toBe(coins + 2 * CONFIG.checkin.coins);
    expect(s.shards).toBe(shards + CONFIG.checkin.bigShards);
    expect(s.parcels.length).toBe(parcels + CONFIG.checkin.bigParcels);
    expect(s.parcels.slice(-CONFIG.checkin.bigParcels).every(p => p.kind === 'normal')).toBe(true);
  });

  it('refuses a clock moved back in time', () => {
    const s = newState(T0);
    checkIn(s, T0 + 5 * DAY, rng);
    expect(canCheckIn(s, T0 + 4 * DAY)).toBe(false);
    expect(checkIn(s, T0 + 4 * DAY, rng)).toBeNull();
    expect(canCheckIn(s, T0 + 6 * DAY)).toBe(true);
  });

  it('starts over cleanly when the saved card fields are bad', () => {
    for (const checkin of [undefined, null, 'x', { last: '2026-02-30', stamps: 2, cards: 1 }, { last: null, stamps: -1, cards: 0 }]) {
      const s = newState(T0) as unknown as Record<string, unknown>;
      s.checkin = checkin;
      const out = sanitizeState(s)!;
      expect(out).not.toBeNull();
      if (checkin && typeof checkin === 'object' && (checkin as { last?: unknown }).last === null && (checkin as { stamps?: unknown }).stamps === -1) {
        // A negative stamp count is clamped, not a new-game reset.
        expect(out.checkin.stamps).toBe(0);
      } else {
        expect(out.checkin).toEqual({ last: null, stamps: 0, cards: 0 });
      }
    }
  });
});
