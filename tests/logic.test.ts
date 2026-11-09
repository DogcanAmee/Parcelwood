import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  RARITIES, RANK, SERIES, deliver, localDay, makeParcel, newState, openParcel, rarityWeights, returnParcel, rollParcel,
} from '../src/core/logic';
import type { GameState, Rarity, Rng } from '../src/core/types';

// Small seeded generator so every run is repeatable.
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = new Date(2026, 9, 31, 9, 0, 0).getTime();

/** Opens `n` normal parcels one by one, like a player emptying the shelf, and returns the rarities in order. */
function openMany(state: GameState, n: number, rng: Rng): { series: string; rarity: Rarity }[] {
  const out: { series: string; rarity: Rarity }[] = [];
  for (let i = 0; i < n; i++) {
    const p = makeParcel(state, 'normal', rng);
    state.parcels.push(p);
    const res = openParcel(state, p.id, rng)!;
    out.push({ series: p.series, rarity: res.rarity });
  }
  return out;
}

describe('published odds', () => {
  it('base odds add up to 100%', () => {
    for (const table of [CONFIG.odds, CONFIG.mysteryOdds, CONFIG.demoOdds]) {
      const sum = RARITIES.reduce((a, r) => a + table[r], 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('a fresh player gets exactly the published odds', () => {
    const s = newState(T0);
    const w = rarityWeights(s, 'snacks', 'normal');
    for (const r of RARITIES) expect(w[r]).toBeCloseTo(CONFIG.odds[r], 10);
  });

  it('first-roll frequencies over 200,000 fresh parcels match the published odds', () => {
    const rng = seeded(1);
    const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, secret: 0 };
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      const s = newState(T0);
      const p = makeParcel(s, 'normal', rng);
      rollParcel(s, p, rng);
      counts[p.rarity!]++;
    }
    for (const r of RARITIES) expect(Math.abs(counts[r] / N - CONFIG.odds[r])).toBeLessThan(0.005);
  });
});

describe('pity guarantees over a long session', () => {
  const rng = seeded(42);
  const state = newState(T0);
  state.unlocked = CONFIG.series.map(s => s.id);
  const log = openMany(state, 100_000, rng);

  it(`a Rare or better within every ${CONFIG.pity.rareEvery} parcels`, () => {
    let run = 0, worst = 0;
    for (const x of log) { run = RANK[x.rarity] >= 1 ? 0 : run + 1; worst = Math.max(worst, run); }
    expect(worst).toBeLessThan(CONFIG.pity.rareEvery);
  });

  it(`an Epic or better within every ${CONFIG.pity.epicEvery} parcels`, () => {
    let run = 0, worst = 0;
    for (const x of log) { run = RANK[x.rarity] >= 2 ? 0 : run + 1; worst = Math.max(worst, run); }
    expect(worst).toBeLessThan(CONFIG.pity.epicEvery);
  });

  it(`a Secret within every ${CONFIG.pity.secretHard} parcels of the same series`, () => {
    const run: Record<string, number> = {};
    let worst = 0;
    for (const x of log) {
      run[x.series] = x.rarity === 'secret' ? 0 : (run[x.series] || 0) + 1;
      worst = Math.max(worst, run[x.series]);
    }
    expect(worst).toBeLessThan(CONFIG.pity.secretHard);
  });

  it('reports the real long-run rates (pity makes them higher than the base odds)', () => {
    const c: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, secret: 0 };
    log.forEach(x => c[x.rarity]++);
    const rates = Object.fromEntries(RARITIES.map(r => [r, +(c[r] / log.length * 100).toFixed(2)]));
    console.log('Long-run rates with pity, % of 100,000 parcels:', rates);
    expect(c.common / log.length).toBeLessThanOrEqual(CONFIG.odds.common);
  });
});

describe('parcels and rewards', () => {
  it('the same seed gives the same results', () => {
    const a = openMany(newState(T0), 500, seeded(7));
    const b = openMany(newState(T0), 500, seeded(7));
    expect(a).toEqual(b);
  });

  it('misdelivered parcels do not move the Rare or Epic counters', () => {
    const rng = seeded(3);
    const s = newState(T0);
    s.pity.sinceRare = 5; s.pity.sinceEpic = 20;
    for (let i = 0; i < 50; i++) { const p = makeParcel(s, 'mystery', rng); rollParcel(s, p, rng); }
    expect(s.pity.sinceRare).toBe(5);
    expect(s.pity.sinceEpic).toBe(20);
  });

  // QA saw the Station read "Rare in 9 / Epic in 45" and then a later parcel roll from a clean 10/50.
  // That is the design: the Rare/Epic counters are global (one pool for every series) and they are spent
  // when a parcel is picked up, because the roll happens on inspect (app.ts:1096), not when the tape is cut.
  it('Rare and Epic pity is global: one counter for every series, moved once per normal parcel', () => {
    const rng = seeded(11);
    const s = newState(T0);
    for (let i = 0; i < 60; i++) {
      const p = makeParcel(s, 'normal', rng);
      const series = p.series;
      const rareBefore = s.pity.sinceRare, epicBefore = s.pity.sinceEpic;
      const secretBefore = { ...s.pity.secret };
      rollParcel(s, p, rng);
      const rank = RANK[p.rarity as Rarity];
      expect(s.pity.sinceRare).toBe(rank >= 1 ? 0 : rareBefore + 1);
      expect(s.pity.sinceEpic).toBe(rank >= 2 ? 0 : epicBefore + 1);
      // Only the secret soft-pity counter is per series.
      expect(s.pity.secret[series]).toBe(p.rarity === 'secret' ? 0 : (secretBefore[series] || 0) + 1);
      for (const id of Object.keys(s.pity.secret)) if (id !== series) expect(s.pity.secret[id]).toBe(secretBefore[id]);
    }
  });

  it('the global counter guarantees an Epic by the 50th parcel even if every parcel is a different series', () => {
    const rng = seeded(19);
    const s = newState(T0);
    for (let i = 0; i < 25; i++) {
      const p = makeParcel(s, 'normal', rng);
      s.pity.sinceEpic = CONFIG.pity.epicEvery - 1; // one normal parcel away, whichever series it is
      rollParcel(s, p, rng);
      expect(RANK[p.rarity as Rarity]).toBeGreaterThanOrEqual(2);
    }
  });

  it('pity is spent when the parcel is picked up, and opening it later does not count it again', () => {
    const rng = seeded(23);
    const s = newState(T0);
    const p = makeParcel(s, 'normal', rng);
    s.parcels.push(p);
    rollParcel(s, p, rng); // what the Station does when the player taps the parcel
    const afterPickup = { rare: s.pity.sinceRare, epic: s.pity.sinceEpic };
    openParcel(s, p.id, rng); // cutting the tape
    expect(s.pity.sinceRare).toBe(afterPickup.rare);
    expect(s.pity.sinceEpic).toBe(afterPickup.epic);
  });

  it('the morning truck fills the shelf, and misdelivered parcels arrive every 2 hours up to 3', () => {
    const rng = seeded(5);
    const s = newState(T0);
    const first = deliver(s, T0, rng);
    expect(first.normal).toBe(CONFIG.shelfSize);
    const later = deliver(s, T0 + 10 * 60 * 60 * 1000, rng); // 10 hours later, same day
    expect(later.normal).toBe(0);
    expect(later.mystery).toBe(CONFIG.mysteryMax);
  });

  it('a day whose delivery already ran cannot be replayed by moving the clock', () => {
    const rng = seeded(13), day = 24 * 60 * 60 * 1000;
    const s = newState(T0);
    const clearNormal = () => { s.parcels = s.parcels.filter(p => p.kind !== 'normal'); };

    expect(deliver(s, T0, rng).normal).toBe(CONFIG.shelfSize);
    expect(s.deliveryDays).toEqual([localDay(new Date(T0))]);

    clearNormal();
    expect(deliver(s, T0 + day, rng).normal).toBe(CONFIG.shelfSize);
    expect(s.deliveryDays).toEqual([localDay(new Date(T0)), localDay(new Date(T0 + day))]);

    clearNormal();
    expect(deliver(s, T0, rng).normal).toBe(0);
    expect(s.day).toBe(localDay(new Date(T0)));

    clearNormal();
    expect(deliver(s, T0 + day, rng).normal).toBe(0);

    clearNormal();
    expect(deliver(s, T0 + day * 2, rng).normal).toBe(CONFIG.shelfSize);
  });

  it('returning a misdelivered parcel pays coins and adds a heart', () => {
    const rng = seeded(9);
    const s = newState(T0);
    const p = makeParcel(s, 'mystery', rng);
    s.parcels.push(p);
    const coins = s.coins;
    const res = returnParcel(s, p.id)!;
    expect(s.coins).toBe(coins + CONFIG.returnReward);
    expect(res.hearts).toBe(1);
    expect(s.parcels).toHaveLength(0);
  });

  it('completing a series pays the bonus and reputation; new series open with the town level instead', () => {
    const s = newState(T0);
    SERIES.snacks.items.slice(1).forEach(i => { s.owned[i.id] = 1; });
    const last = SERIES.snacks.items[0];
    const p = makeParcel(s, 'normal', seeded(11));
    p.series = 'snacks'; p.rolled = true; p.item = last.id; p.rarity = last.r; p.weight = 4; p.insured = false;
    s.parcels.push(p);
    const coins = s.coins;
    const res = openParcel(s, p.id, seeded(12))!;
    expect(res.complete).toEqual({ seriesId: 'snacks' });
    expect(s.coins).toBe(coins + CONFIG.coinsPerOpen[last.r] + CONFIG.completeReward);
    expect(s.town.rep).toBe(CONFIG.rep.open + CONFIG.rep.complete);
    expect(s.unlocked).not.toContain('souvenirs');
  });
});
