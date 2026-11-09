import { describe, expect, it } from 'vitest';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';
import { RUN, canInspect, inspect, replay, runGrade, storageSize, toolCost } from '../src/core/run';
import { SERIES_IDS } from '../src/core/rushHour';
import { WEEK_TIER, marksForRun, weekAbandon, weekAct, weekBuy, weekClockBehind, weekDaysToOpen, weekEventOpen, weekEventStatus, weekFinish, weekLoad, weekSeed, weekSeedFor, weekStart } from '../src/core/week';
import { weekOf } from '../src/core/story';
import { weekShareText, weekText } from '../src/week/strings';

const T0 = new Date(2026, 10, 2, 20, 0).getTime(); // Monday
const NEXT_DAY = T0 + 24 * 3600 * 1000;
const FRI = new Date(2026, 10, 6, 20, 0).getTime();
const SAT = new Date(2026, 10, 7, 20, 0).getTime();
const SUN = new Date(2026, 10, 8, 20, 0).getTime();
const NEXT_FRI = FRI + 7 * 24 * 3600 * 1000;
const EMPTY_WEEK = { run: null, rewarded: [], best: 0, wins: 0, played: 0, marks: 0, levels: { hands: 0, shelves: 0, eye: 0 }, event: { week: null, claimed: 0, best: 0, bestSold: 0, plays: 0, seen: 0 } };

/** Plays a whole run through the save: every action is logged, ending each day at once. */
function playThrough(s: ReturnType<typeof newState>, seed: number) {
  const run = weekStart(s, seed);
  while (run.phase !== 'over') {
    if (run.phase === 'day') {
      if (run.desk.length) weekAct(s, run, 's:0:' + SERIES_IDS[0]);
      else weekAct(s, run, 'e');
    } else weekAct(s, run, 'p:' + run.offer[0]);
  }
  return run;
}

describe('station week save', () => {
  it('logs each allowed action and rebuilds the same run from seed and log', () => {
    const s = newState(T0);
    const run = weekStart(s, 123);
    expect(weekAct(s, run, 'i:0:shake')).toBe(true);
    expect(weekAct(s, run, 'i:0:shake')).toBe(false);
    expect(weekAct(s, run, 'z')).toBe(false);
    expect(weekAct(s, run, 's:0:' + SERIES_IDS[1])).toBe(true);
    expect(s.week.run!.log).toEqual(['i:0:shake', 's:0:' + SERIES_IDS[1]]);
    expect(weekLoad(s)).toEqual(run);
  });

  it('survives a save round trip through sanitize, run in progress included', () => {
    const s = newState(T0);
    const run = weekStart(s, 77);
    weekAct(s, run, 'i:1:postmark');
    weekAct(s, run, 'e');
    const back = sanitizeState(JSON.parse(JSON.stringify(s)))!;
    expect(back.week.run).toEqual(s.week.run);
    expect(weekLoad(back)).toEqual(run);
  });

  it('an edited log drops only the run; a broken record starts over; the rest of the save is kept', () => {
    const s = newState(T0);
    weekStart(s, 5);
    s.coins = 999;
    const edited = JSON.parse(JSON.stringify(s));
    edited.week.run.log = ['i:0:xray', 'i:0:xray'];
    edited.week.best = 2;
    const a = sanitizeState(edited)!;
    expect(a.coins).toBe(999);
    expect(a.week.run).toBeNull();
    expect(a.week.best).toBe(2);
    expect(replay(5, ['i:0:xray'])).not.toBeNull();
    edited.week = { run: { seed: 5, log: ['<img src=x>'] }, rewarded: 'x', best: 9 };
    const b = sanitizeState(edited)!;
    expect(b.coins).toBe(999);
    expect(b.week).toEqual(EMPTY_WEEK);
  });

  it('keeps the weekend clock watermark and defaults an older record to zero', () => {
    const s = newState(T0);
    s.week.event = { week: weekOf(T0), claimed: WEEK_TIER.finish, best: 2, bestSold: 9, plays: 1, seen: T0 };
    const back = sanitizeState(JSON.parse(JSON.stringify(s)))!;
    expect(back.week.event.seen).toBe(T0);
    const old = JSON.parse(JSON.stringify(s));
    delete old.week.event.seen;
    expect(sanitizeState(old)!.week.event.seen).toBe(0);
  });

  it('keeps a fractional seen watermark as whole milliseconds instead of dropping it', () => {
    const s = newState(FRI);
    s.week.event = { week: weekOf(FRI), claimed: WEEK_TIER.finish, best: 2, bestSold: 9, plays: 1, seen: FRI + 0.4 };
    const back = sanitizeState(JSON.parse(JSON.stringify(s)))!;
    expect(back.week.event.seen).toBe(FRI);
    expect(weekClockBehind(back, FRI - 7 * 86400000)).toBe(true);
  });

  it('keeps the weekend closed after a fractional finish time and a save round trip', () => {
    const s = newState(FRI);
    const run = playThrough(s, 205);
    expect(weekFinish(s, run, FRI + 0.4)).not.toBeNull();
    expect(s.week.event.seen).toBe(FRI);
    const back = sanitizeState(JSON.parse(JSON.stringify(s)))!;
    expect(back.week.event.seen).toBe(FRI);
    expect(weekEventStatus(back, FRI - 7 * 86400000)).toMatchObject({ open: false, clockBehind: true });
  });

  it('a save from before Station Week gets an empty record', () => {
    const old = JSON.parse(JSON.stringify(newState(T0)));
    delete old.week;
    expect(sanitizeState(old)!.week).toEqual(EMPTY_WEEK);
  });

  it('keeps valid ledger progress and clamps a tampered one', () => {
    const s = newState(T0);
    s.week.marks = 9;
    s.week.levels = { hands: 1, shelves: 2, eye: 2 };
    const back = sanitizeState(JSON.parse(JSON.stringify(s)))!;
    expect(back.week.marks).toBe(9);
    expect(back.week.levels).toEqual({ hands: 1, shelves: 2, eye: 2 });
    const bad = JSON.parse(JSON.stringify(s));
    bad.week.marks = -3;
    bad.week.levels = { hands: 9, shelves: -1, eye: 'x' };
    const clamped = sanitizeState(bad)!;
    expect(clamped.week.marks).toBe(0);
    expect(clamped.week.levels).toEqual({ hands: 0, shelves: 0, eye: 0 });
  });

  it("pays ledger marks for the day's first finished run; later runs that day are practice", () => {
    const s = newState(T0);
    const marks0 = s.week.marks, shards0 = s.shards, rep0 = s.town.rep;
    const first = playThrough(s, 1);
    const out = weekFinish(s, first, T0)!;
    expect(out.official).toBe(true);
    expect(out.grade).toBe(runGrade(first));
    expect(out.marks).toBe(marksForRun(first));
    expect(s.week.marks).toBe(marks0 + out.marks);
    expect(s.shards).toBe(shards0);
    expect(s.town.rep).toBe(rep0);
    expect(s.week.run).toBeNull();
    expect(s.week.played).toBe(1);
    const second = playThrough(s, 2);
    expect(weekFinish(s, second, T0)).toMatchObject({ official: false, marks: 0 });
    const third = playThrough(s, 3);
    expect(weekFinish(s, third, NEXT_DAY)!.official).toBe(true);
    expect(s.week.played).toBe(3);
  });

  it('buys ledger tiers between runs and snapshots them into the next run', () => {
    const s = newState(T0);
    s.week.marks = 7;
    expect(weekBuy(s, 'hands')).toBe(true);
    expect(s.week.marks).toBe(5);
    expect(s.week.levels.hands).toBe(1);
    expect(weekBuy(s, 'hands')).toBe(true);
    expect(s.week.marks).toBe(1);
    expect(s.week.levels.hands).toBe(2);
    expect(weekBuy(s, 'hands')).toBe(false);
    const run = weekStart(s, 11);
    expect(run.mods).toEqual({ ap: 1, storage: 0, checks: 0, coins: 2, keen: 0 });
    expect(run.ap).toBe(RUN.ap + 1);
    expect(run.coins).toBe(20);
    s.week.marks = 99;
    expect(weekBuy(s, 'shelves')).toBe(false);
    weekAbandon(s);
    expect(weekBuy(s, 'shelves')).toBe(true);
    expect(s.week.levels).toEqual({ hands: 2, shelves: 1, eye: 0 });
  });

  it('applies storage and free-check upgrades, and replays the same run with them', () => {
    const s = newState(T0);
    s.week.levels = { hands: 0, shelves: 1, eye: 1 };
    const run = weekStart(s, 12);
    expect(storageSize(run)).toBe(RUN.storage + 1);
    expect(run.freeChecks).toBe(1);
    expect(toolCost(run, 'postmark')).toBe(0);
    expect(toolCost(run, 'xray')).toBe(RUN.cost.xray);
    expect(weekAct(s, run, 'i:0:postmark')).toBe(true);
    expect(run.ap).toBe(RUN.ap);
    expect(run.freeChecks).toBe(0);
    expect(toolCost(run, 'weigh')).toBe(1);
    expect(weekLoad(s)).toEqual(run);
    const bare = weekStart(s, 13);
    bare.ap = 0;
    expect(canInspect(bare, 0, 'postmark')).toBe(true);
    expect(inspect(bare, 0, 'postmark')).not.toBeNull();
    expect(bare.ap).toBe(0);
  });

  it('a fully upgraded ledger gives the whole starting package', () => {
    const s = newState(T0);
    s.week.marks = 15;
    for (const id of ['hands', 'shelves', 'eye'] as const) {
      expect(weekBuy(s, id)).toBe(true);
      expect(weekBuy(s, id)).toBe(true);
      expect(weekBuy(s, id)).toBe(false);
    }
    expect(s.week.levels).toEqual({ hands: 2, shelves: 2, eye: 2 });
    expect(s.week.marks).toBe(0);
    let run = weekStart(s, 31);
    for (let seed = 32; seed < 90 && !run.desk.some(rp => rp.p.kind !== 'decoy' && rp.p.smudge.length > 0); seed++) run = weekStart(s, seed);
    expect(run.mods).toEqual({ ap: 1, storage: 2, checks: 1, coins: 2, keen: 1 });
    expect(run.ap).toBe(RUN.ap + 1);
    expect(run.coins).toBe(20);
    expect(storageSize(run)).toBe(RUN.storage + 2);
    expect(run.freeChecks).toBe(1);
    const i = run.desk.findIndex(rp => rp.p.kind !== 'decoy' && rp.p.smudge.length > 0);
    if (i >= 0) expect(inspect(run, i, 'postmark')).toBe('postmark');
  });

  it('uses one seed per week, so every player gets the same schedule', () => {
    expect(weekSeed(FRI)).toBe(weekSeed(SAT));
    expect(weekSeed(SAT)).toBe(weekSeed(SUN));
    expect(weekSeed(FRI)).not.toBe(weekSeed(NEXT_FRI));
    expect(weekSeedFor('2026-11-02')).toBe(weekSeed(FRI));
    const a = newState(FRI), b = newState(SUN);
    const ra = weekStart(a, weekSeed(FRI));
    const rb = weekStart(b, weekSeed(SUN));
    expect(JSON.parse(JSON.stringify(ra))).toEqual(JSON.parse(JSON.stringify(rb)));
    const next = weekStart(newState(NEXT_FRI), weekSeed(NEXT_FRI));
    expect(JSON.stringify(next.desk)).not.toBe(JSON.stringify(ra.desk));
  });

  it('opens the event Friday to Sunday local time and counts down otherwise', () => {
    expect(weekEventOpen(FRI)).toBe(true);
    expect(weekEventOpen(SAT)).toBe(true);
    expect(weekEventOpen(SUN)).toBe(true);
    expect(weekEventOpen(T0)).toBe(false);
    expect(weekEventOpen(NEXT_DAY)).toBe(false);
    expect(weekDaysToOpen(FRI)).toBe(0);
    expect(weekDaysToOpen(T0)).toBe(4);
    expect(weekEventStatus(newState(T0), T0)).toMatchObject({ open: false, daysToOpen: 4, claimed: 0, plays: 0 });
    expect(weekEventStatus(newState(FRI), FRI)).toMatchObject({ open: true, daysToOpen: 0 });
  });

  it('pays each weekend tier once, keeps the best run, and starts over next week', () => {
    const s = newState(FRI);
    const coins0 = s.coins, shards0 = s.shards;
    const first = playThrough(s, 101);
    first.win = false;
    const out1 = weekFinish(s, first, FRI)!;
    expect(out1.event).toMatchObject({ paid: WEEK_TIER.finish, coins: 30, shards: 0, claimed: WEEK_TIER.finish });
    expect(s.coins).toBe(coins0 + 30);
    expect(s.shards).toBe(shards0);
    expect(weekEventStatus(s, FRI)).toMatchObject({ claimed: WEEK_TIER.finish, plays: 1, best: 0 });

    const second = playThrough(s, 102);
    second.win = true;
    second.stats.targetsMissed = 0;
    second.complaints = 0;
    const out2 = weekFinish(s, second, SAT)!;
    expect(out2.grade).toBe(3);
    expect(out2.event).toMatchObject({ paid: WEEK_TIER.win | WEEK_TIER.three, coins: 30, shards: 30 });
    expect(s.coins).toBe(coins0 + 60);
    expect(s.shards).toBe(shards0 + 30);
    const st = weekEventStatus(s, SUN);
    expect(st).toMatchObject({ claimed: 7, plays: 2, best: 3 });

    const third = playThrough(s, 103);
    third.win = true;
    third.stats.targetsMissed = 0;
    third.complaints = 0;
    const out3 = weekFinish(s, third, SUN)!;
    expect(out3.event).toMatchObject({ paid: 0, coins: 0, shards: 0, claimed: 7 });
    expect(s.coins).toBe(coins0 + 60);

    const next = playThrough(s, 104);
    next.win = true;
    next.stats.targetsMissed = 0;
    next.complaints = 0;
    const out4 = weekFinish(s, next, NEXT_FRI)!;
    expect(out4.event).toMatchObject({ paid: 7, coins: 60, shards: 30 });
    expect(s.coins).toBe(coins0 + 120);
    expect(s.shards).toBe(shards0 + 60);
  });

  it('does not pay a past weekend again after the clock jumps forward and back', () => {
    const s = newState(FRI);
    const first = playThrough(s, 201);
    expect(weekFinish(s, first, FRI)!.event).toMatchObject({ paid: WEEK_TIER.finish });
    const second = playThrough(s, 202);
    expect(weekFinish(s, second, NEXT_FRI)!.event).toMatchObject({ paid: WEEK_TIER.finish });
    const coins = s.coins, shards = s.shards;
    const back = playThrough(s, 203);
    const out = weekFinish(s, back, FRI)!;
    expect(out.event).toBeNull();
    expect(s.coins).toBe(coins);
    expect(s.shards).toBe(shards);
    expect(weekEventStatus(s, FRI)).toMatchObject({ open: false, clockBehind: true });
  });

  it('records the latest seen time even on a run that pays no weekend reward', () => {
    const s = newState(T0);
    const run = playThrough(s, 204);
    weekFinish(s, run, T0);
    expect(s.week.event.seen).toBe(T0);
    expect(weekEventStatus(s, T0).clockBehind).toBe(false);
  });

  it('builds a one-line share card without the schedule', () => {
    const text = weekShareText(weekText('en'), '2026-11-02', 2, 38);
    expect(text).toBe('Parcelwood Station Week 11-02 ★★☆ · sold 38');
    expect(text).not.toContain('powercut');
    expect(weekShareText(weekText('zh'), '2026-11-02', 3, 12)).toContain('★★★');
  });

  it('pays no weekend reward on a weekday but still keeps the run and ledger marks', () => {
    const s = newState(T0);
    const coins0 = s.coins, shards0 = s.shards;
    const run = playThrough(s, 55);
    run.win = true;
    run.stats.targetsMissed = 0;
    run.complaints = 0;
    const out = weekFinish(s, run, T0)!;
    expect(out.event).toBeNull();
    expect(s.coins).toBe(coins0);
    expect(s.shards).toBe(shards0);
    expect(out.marks).toBeGreaterThan(0);
    expect(weekEventStatus(s, T0).plays).toBe(0);
  });

  it('will not finish a run that is still going; giving up pays nothing', () => {
    const s = newState(T0);
    const run = weekStart(s, 9);
    expect(weekFinish(s, run, T0)).toBeNull();
    const shards = s.shards;
    weekAbandon(s);
    expect(s.week).toMatchObject({ run: null, played: 1 });
    expect(s.shards).toBe(shards);
    expect(RUN.days).toBe(5);
  });
});
