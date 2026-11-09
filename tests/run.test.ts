import { describe, expect, it } from 'vitest';
import {
  RUN, STAMPS, canInspect, choosePick, endDay, inspect, itemsLeft, reroll, rerollCost, route, runGrade, seriesLeft,
  startRun, storageSize, toolCost,
} from '../src/core/run';
import type { RunParcel, RunState } from '../src/core/run';
import { rollTrayParcel, SERIES_IDS } from '../src/core/rushHour';
import { seeded } from '../src/core/daily';
import { SERIES } from '../src/core/logic';
import { playRun } from './sim/bots';

/** A desk parcel of a known kind, built from Rush Hour's own parcel roller. */
function parcel(kind: 'normal' | 'decoy', insured = false, seed = 1): RunParcel {
  const rng = seeded(seed);
  for (let i = 0; i < 500; i++) {
    const p = rollTrayParcel(rng, 10 + i);
    if (p.kind === kind && (kind === 'decoy' || p.smudge.length)) return { p, shown: [], checks: [], insured };
  }
  throw new Error('no parcel');
}

function fresh(seed = 7): RunState {
  const run = startRun(seed);
  run.desk = [];
  run.demand = Object.fromEntries(SERIES_IDS.map(s => [s, 1]));
  return run;
}

describe('station week: start and determinism', () => {
  it('opens day 1 with action points, parcels and orders that can be answered', () => {
    const run = startRun(42);
    expect(run).toMatchObject({ day: 1, phase: 'day', ap: RUN.ap, complaints: 0, earned: 0 });
    expect(run.desk).toHaveLength(RUN.parcels[0]);
    expect(run.orders).toHaveLength(RUN.orders[0]);
    expect(Object.values(run.demand).sort()).toEqual([RUN.cold, 1, RUN.hot]);
  });

  it('the same seed gives the same run, and a different seed a different one', () => {
    expect(startRun(5)).toEqual(startRun(5));
    expect(startRun(5).desk.map(d => d.p.item)).not.toEqual(startRun(6).desk.map(d => d.p.item));
    expect(playRun(9, 'careful', 'random')).toEqual(playRun(9, 'careful', 'random'));
  });

  it('a run saved as JSON mid-way plays on exactly like the original', () => {
    const a = startRun(11);
    inspect(a, 0, 'postmark');
    route(a, 0, { k: 'shop', series: SERIES_IDS[0] });
    endDay(a);
    const b: RunState = JSON.parse(JSON.stringify(a));
    choosePick(a, a.offer[0]);
    choosePick(b, b.offer[0]);
    expect(b).toEqual(a);
  });
});

describe('station week: inspecting', () => {
  it('each check costs action points once per parcel and shows its clue', () => {
    const run = fresh();
    run.desk = [parcel('normal')];
    expect(inspect(run, 0, 'shake')).toBe('sound');
    expect(run.ap).toBe(RUN.ap - 1);
    expect(inspect(run, 0, 'shake')).toBeNull();
    expect(inspect(run, 0, 'postmark')).toBe('smudge');
    expect(inspect(run, 0, 'xray')).toBe('sticker');
    expect(seriesLeft(run.desk[0])).toEqual([run.desk[0].p.series]);
    expect(itemsLeft(run.desk[0])).toContain(run.desk[0].p.item);
    expect(run.ap).toBe(RUN.ap - 5);
  });

  it('refuses a check the action points do not cover', () => {
    const run = fresh();
    run.desk = [parcel('normal')];
    run.ap = 2;
    expect(canInspect(run, 0, 'xray')).toBe(false);
    expect(inspect(run, 0, 'xray')).toBeNull();
    expect(run.ap).toBe(2);
  });

  it('rain hides postmarks and a power cut stops the X-ray', () => {
    const run = fresh();
    run.desk = [parcel('normal')];
    run.event = 'rain';
    expect(canInspect(run, 0, 'postmark')).toBe(false);
    run.event = 'powercut';
    expect(canInspect(run, 0, 'xray')).toBe(false);
    expect(canInspect(run, 0, 'postmark')).toBe(true);
  });

  it('a misdelivered parcel fits no series once its postmark is read', () => {
    const run = fresh();
    run.desk = [parcel('decoy')];
    inspect(run, 0, 'postmark');
    expect(seriesLeft(run.desk[0])).toEqual([]);
  });
});

describe('station week: routing', () => {
  it('pays full price in the right shop, by demand, and half in the wrong one', () => {
    const run = fresh();
    const a = parcel('normal', false, 1), b = parcel('normal', false, 1);
    run.desk = [a, b];
    run.demand[a.p.series] = RUN.hot;
    const right = route(run, 0, { k: 'shop', series: a.p.series });
    expect(right).toMatchObject({ right: true, mistake: false, coins: Math.round(RUN.price[a.p.rarity] * RUN.hot) });
    const other = SERIES_IDS.find(s => s !== b.p.series)!;
    const wrong = route(run, 0, { k: 'shop', series: other });
    expect(wrong).toMatchObject({ right: false, mistake: false, coins: Math.round(RUN.price[b.p.rarity] * RUN.wrongShop) });
    expect(run.complaints).toBe(0);
    expect(run.earned).toBe(right.coins + wrong.coins);
  });

  it('selling a misdelivered parcel is a complaint; returning it pays', () => {
    const run = fresh();
    run.desk = [parcel('decoy'), parcel('decoy')];
    expect(route(run, 0, { k: 'shop', series: SERIES_IDS[0] })).toMatchObject({ mistake: true, coins: 0 });
    expect(run.complaints).toBe(1);
    expect(route(run, 0, { k: 'return' })).toMatchObject({ right: true, coins: RUN.returnCoins });
  });

  it('a wrong-shop sale of an insured parcel is a complaint', () => {
    const run = fresh();
    const p = parcel('normal', true);
    run.desk = [p];
    route(run, 0, { k: 'shop', series: SERIES_IDS.find(s => s !== p.p.series)! });
    expect(run.complaints).toBe(1);
  });

  it('answers an order only with a fitting item; a wrong hand-over is a complaint', () => {
    const run = fresh();
    const p = parcel('normal');
    run.desk = [p, { ...parcel('normal'), shown: [] }];
    run.orders = [{ resident: 'theo', clue: { k: 'series', v: p.p.series }, done: false }, { resident: 'okafor', clue: { k: 'snd', v: 'chime' }, done: false }];
    const ok = route(run, 0, { k: 'order', order: 0 });
    expect(ok).toMatchObject({ right: true, coins: RUN.orderCoins + RUN.price[p.p.rarity] });
    expect(route(run, 0, { k: 'order', order: 0 }).ok).toBe(false);
    const fits = run.desk[0].p.sound === 'chime';
    expect(route(run, 0, { k: 'order', order: 1 }).mistake).toBe(!fits);
  });

  it('three complaints end the run at once', () => {
    const run = fresh();
    run.desk = [parcel('decoy'), parcel('decoy'), parcel('decoy'), parcel('decoy')];
    for (let i = 0; i < 3; i++) route(run, 0, { k: 'shop', series: SERIES_IDS[0] });
    expect(run).toMatchObject({ phase: 'over', win: false, complaints: 3 });
    expect(route(run, 0, { k: 'return' }).ok).toBe(false);
  });
});

describe('station week: days, targets and stamps', () => {
  it('carries leftovers up to the storage size and loses the rest without a complaint', () => {
    const run = fresh();
    run.desk = Array.from({ length: 6 }, () => parcel('normal'));
    endDay(run);
    expect(run.desk).toHaveLength(storageSize(run));
    expect(run.stats.lost).toBe(6 - RUN.storage);
    expect(run.complaints).toBe(0);
    expect(run.phase).toBe('evening');
    expect(run.offer).toHaveLength(3);
  });

  it('missing a takings target adds a complaint', () => {
    const run = fresh();
    endDay(run);
    choosePick(run, null);
    endDay(run);
    expect(run.day).toBe(2);
    expect(run.earned).toBeLessThan(RUN.targets[2]);
    expect(run.complaints).toBe(1);
    expect(run.stats.targetsMissed).toBe(1);
  });

  it('finishing day 5 with fewer than three complaints wins', () => {
    const run = fresh();
    for (let d = 1; d <= RUN.days; d++) {
      run.earned = 10_000;
      run.desk = [];
      endDay(run);
      if (d < RUN.days) choosePick(run, run.offer[0]);
    }
    expect(run).toMatchObject({ phase: 'over', win: true, day: RUN.days });
    expect(run.stamps).toHaveLength(RUN.days - 1);
    expect(runGrade(run)).toBe(3);
  });

  it('missing the week goal on the last day loses, even with no complaints', () => {
    const run = fresh();
    for (let d = 1; d < RUN.days; d++) { run.earned = RUN.targets[4]; run.desk = []; endDay(run); choosePick(run, null); }
    run.earned = RUN.targets[RUN.days] - 1;
    endDay(run);
    expect(run).toMatchObject({ phase: 'over', win: false, complaints: 0 });
    expect(runGrade(run)).toBe(0);
  });

  it('offers three stamps not yet owned; rerolls cost more each time and run out', () => {
    const run = fresh();
    run.stamps = STAMPS.slice(0, 5).map(s => s.id);
    endDay(run);
    expect(run.offer.some(id => run.stamps.includes(id))).toBe(false);
    expect(choosePick(run, run.stamps[0])).toBe(false);
    run.coins = 1000;
    for (const cost of RUN.rerollCost) { expect(rerollCost(run)).toBe(cost); expect(reroll(run)).toBe(true); }
    expect(reroll(run)).toBe(false);
    expect(run.coins).toBe(1000 - RUN.rerollCost.reduce((a, b) => a + b, 0));
  });

  it('stamps change costs and payouts', () => {
    const run = fresh();
    run.stamps = ['tuning-fork', 'second-scale', 'lamp', 'magnifier', 'hunch', 'bonded'];
    expect(toolCost(run, 'shake')).toBe(0);
    expect(toolCost(run, 'weigh')).toBe(0);
    expect(toolCost(run, 'xray')).toBe(2);
    run.desk = [parcel('normal'), parcel('normal'), parcel('normal', true), parcel('normal', true)];
    expect(inspect(run, 0, 'postmark')).toBe('postmark');
    const blind = run.desk[1];
    expect(route(run, 1, { k: 'shop', series: blind.p.series }).coins).toBe(RUN.price[blind.p.rarity] + Math.round(RUN.price[blind.p.rarity] * 0.6));
    const ins = run.desk[1];
    const off = SERIES_IDS.find(s => s !== ins.p.series)!;
    expect(route(run, 1, { k: 'shop', series: off })).toMatchObject({ mistake: true, forgiven: true });
    expect(route(run, 1, { k: 'shop', series: off })).toMatchObject({ mistake: true, forgiven: false });
    expect(run.complaints).toBe(1);
  });

  it('each series has a shop name the evening screen can show', () => {
    for (const s of SERIES_IDS) expect(SERIES[s].shop).toBeTruthy();
  });
});
