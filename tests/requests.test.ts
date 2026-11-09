import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { ITEMS, newState } from '../src/core/logic';
import { addWishes, claimTask, fulfillWish, refreshBoard } from '../src/core/board';
import { clueFits, makeRequest, requestFits, spares, talesUnlocked } from '../src/core/requests';
import { syncUnlocks } from '../src/core/town';
import type { GameState, Rng } from '../src/core/types';

function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const T0 = new Date(2026, 9, 31, 9, 0, 0).getTime();
const DAY = 86400000;
/** A new game at town level 2, where requests start. */
const wishes = (s: GameState) => s.board.tasks.filter(x => x.kind === 'wish');
function lv2() { const s = newState(T0); s.town.rep = CONFIG.townLevels[1]; return s; }

describe('wish letters', () => {
  it('posts no wishes before town level 2, and swaps untouched jobs for wishes on the day of the level-up', () => {
    const s = newState(T0);
    refreshBoard(s, T0, seeded(1));
    expect(s.board.tasks.some(x => x.kind === 'wish')).toBe(false);
    s.town.rep = CONFIG.townLevels[1];
    expect(addWishes(s, T0, seeded(1))).toBe(CONFIG.requestsPerDay);
    expect(s.board.tasks.filter(x => x.kind === 'wish')).toHaveLength(CONFIG.requestsPerDay);
    expect(s.board.tasks).toHaveLength(CONFIG.board.tasks);
    expect(addWishes(s, T0, seeded(2))).toBe(0); // only once
  });

  it('never swaps a job the player has started', () => {
    const s = newState(T0);
    refreshBoard(s, T0, seeded(1));
    s.board.tasks.forEach(x => { x.got = 1; });
    s.town.rep = CONFIG.townLevels[1];
    expect(addWishes(s, T0, seeded(1))).toBe(0);
  });

  it('only residents who have moved in write, two different wishes and at least one job a day', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = lv2();
      refreshBoard(s, T0, seeded(seed));
      const w = wishes(s);
      expect(w).toHaveLength(CONFIG.requestsPerDay);
      expect(new Set(w.map(x => x.by)).size).toBe(w.length);
      expect(s.board.tasks.some(x => x.kind !== 'wish')).toBe(true);
      w.forEach(x => { expect(CONFIG.residents.find(r => r.id === x.by)!.lv).toBeLessThanOrEqual(2); expect(x.clues).toHaveLength(2); });
    }
  });

  it('keeps the letters all day and writes new ones the next day', () => {
    const s = lv2(), rng = seeded(1);
    refreshBoard(s, T0, rng);
    const before = JSON.stringify(s.board.tasks);
    expect(refreshBoard(s, T0 + 3600000, rng)).toBeNull();
    expect(JSON.stringify(s.board.tasks)).toBe(before);
    expect(refreshBoard(s, T0 + DAY, rng)).not.toBeNull();
    expect(wishes(s)).toHaveLength(CONFIG.requestsPerDay);
  });

  it('always asks for something an unlocked item can answer, with one to three fitting items', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = newState(T0), rng = seeded(seed);
      const rq = makeRequest(s, 'theo', rng)!;
      expect(rq.clues).toHaveLength(2);
      const fit = s.unlocked.flatMap(id => CONFIG.series.find(x => x.id === id)!.items).filter(i => requestFits(ITEMS[i.id], rq));
      expect(fit.length).toBeGreaterThanOrEqual(1);
      expect(fit.length).toBeLessThanOrEqual(3);
    }
  });

  it('asks for something the player can hand over once they have spares, even after a new series unlocks', () => {
    const s = lv2();
    s.town.rep = CONFIG.townLevels[4];
    syncUnlocks(s); // City Souvenirs is now in the pool, but the player owns none of it
    CONFIG.startUnlocked.forEach(id => CONFIG.series.find(x => x.id === id)!.items.forEach(i => { s.owned[i.id] = 2; }));
    for (let seed = 1; seed <= 200; seed++) {
      const rq = makeRequest(s, 'theo', seeded(seed));
      expect(rq).not.toBeNull();
      expect(spares(s).some(i => requestFits(i, rq!))).toBe(true);
    }
  });

  it('posts only jobs, instead of crashing, when nothing is unlocked', () => {
    const s = lv2(); s.unlocked = [];
    refreshBoard(s, T0, seeded(3));
    expect(wishes(s)).toEqual([]);
    expect(s.board.tasks.length).toBeGreaterThan(0);
  });

  it('clues read the item data', () => {
    const duck = ITEMS['rubber-duck']; // squeak, toys, common, 2-4 oz
    expect(clueFits(duck, { k: 'snd', v: 'squeak' })).toBe(true);
    expect(clueFits(duck, { k: 'series', v: 'snacks' })).toBe(false);
    expect(clueFits(duck, { k: 'under', v: 4 })).toBe(true);
    expect(clueFits(duck, { k: 'under', v: 3 })).toBe(false);
    expect(clueFits(duck, { k: 'over', v: 2 })).toBe(true);
    expect(clueFits(duck, { k: 'over', v: 3 })).toBe(false);
  });

  it('takes only spares, pays the wish and a heart, ignores a wrong pick, and never pays twice', () => {
    const s = newState(T0);
    refreshBoard(s, T0, seeded(1));
    s.board.tasks[0] = { kind: 'wish', by: 'lena', need: 1, got: 0, arg: null, claimed: false, clues: [{ k: 'snd', v: 'squeak' }, { k: 'series', v: 'toys' }] };
    s.owned['rubber-duck'] = 1; s.owned['yo-yo'] = 3;
    expect(spares(s).map(i => i.id)).toEqual(['yo-yo']);
    expect(fulfillWish(s, 0, 'rubber-duck')).toBeNull(); // the last copy stays in the album
    const wrong = fulfillWish(s, 0, 'yo-yo')!;
    expect(wrong.ok).toBe(false);
    expect(s.owned['yo-yo']).toBe(3);
    expect(s.board.tasks[0].claimed).toBe(false);
    s.owned['rubber-duck'] = 2;
    const coins = s.coins, shards = s.shards;
    const ok = fulfillWish(s, 0, 'rubber-duck')!;
    expect(ok.ok).toBe(true);
    expect(s.owned['rubber-duck']).toBe(1);
    expect(s.coins).toBe(coins + CONFIG.requestCoins);
    expect(s.shards).toBe(shards + CONFIG.recycle.common + CONFIG.requestBonusShards);
    expect(s.hearts.lena).toBe(1);
    expect(ok.newTale).toBe(0);
    expect(s.board.tasks[0].claimed).toBe(true);
    expect(claimTask(s, 0)).toBeNull(); // the job reward is not paid on top
    expect(fulfillWish(s, 0, 'rubber-duck')).toBeNull(); // already done
    expect(fulfillWish(s, 5, 'yo-yo')).toBeNull();
    expect(fulfillWish(s, 1, 'yo-yo')).toBeNull(); // a job is not a wish
  });

  it('gives the board stamp when the last letter is a wish', () => {
    const s = newState(T0);
    refreshBoard(s, T0, seeded(1));
    s.board.tasks.forEach(x => { x.claimed = true; x.got = x.need; });
    s.board.tasks[0] = { kind: 'wish', by: 'lena', need: 1, got: 0, arg: null, claimed: false, clues: [{ k: 'series', v: 'toys' }, { k: 'snd', v: 'squeak' }] };
    s.owned['rubber-duck'] = 2;
    const shards = s.shards;
    const res = fulfillWish(s, 0, 'rubber-duck')!;
    expect(res.bonus).toEqual({ shards: CONFIG.board.bonusShards, rep: CONFIG.board.bonusRep, stamps: 1 });
    expect(s.shards).toBe(shards + CONFIG.recycle.common + CONFIG.requestBonusShards + CONFIG.board.bonusShards);
  });

  it('unlocks stories at 1, 3 and 6 hearts', () => {
    const s = newState(T0);
    for (const [h, n] of [[0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [20, 3]]) { s.hearts.dube = h; expect(talesUnlocked(s, 'dube')).toBe(n); }
  });
});
