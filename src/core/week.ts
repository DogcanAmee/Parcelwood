// Station Week save glue: the run in progress (seed + action log + the upgrades it started under, rebuilt by replay),
// the small record kept between runs, and the permanent back-room ledger. The same week always uses the same seed,
// so every player gets the same schedule. The mode is open every day; only Friday to Sunday pays the three event
// reward tiers, once each per week, into the main game. The first finished run of each day also pays ledger marks;
// later runs that day are practice. Losing a run never costs anything outside it.
import { CONFIG } from './config';
import { hash } from './daily';
import { localDay, rememberDay } from './logic';
import { applyAction, replay, runGrade, weekTheme, RUN_LOG_MAX, ZERO_MODS } from './run';
import type { RunAction, RunEvent, RunState } from './run';
import { weekOf } from './story';
import type { GameState, LedgerId, WeekEventSave, WeekLedger, WeekMods, WeekSave } from './types';

export interface LedgerTier { cost: number; mods: Partial<WeekMods> }
export interface LedgerDef { id: LedgerId; tiers: readonly LedgerTier[] }

/** Three permanent lines. Each tier only affects Station Week, so the main loop's economy is untouched.
 *  Action points and free checks are capped at +1 each; the later tiers turn into utility instead of raw power. */
export const LEDGER: readonly LedgerDef[] = [
  { id: 'hands', tiers: [{ cost: 2, mods: { ap: 1 } }, { cost: 4, mods: { coins: 2 } }] },
  { id: 'shelves', tiers: [{ cost: 1, mods: { storage: 1 } }, { cost: 2, mods: { storage: 1 } }] },
  { id: 'eye', tiers: [{ cost: 2, mods: { checks: 1 } }, { cost: 4, mods: { keen: 1 } }] },
];

export const emptyWeekEvent = (): WeekEventSave => ({ week: null, claimed: 0, best: 0, bestSold: 0, plays: 0, seen: 0 });

/** A small clock drift or time-zone correction is normal. A larger step back is treated as a moved clock. */
export const WEEK_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** True when the device clock is behind the latest time this save has already seen. */
export function weekClockBehind(state: GameState, now: number): boolean {
  const seen = state.week.event.seen ?? 0;
  return now < seen - WEEK_CLOCK_SKEW_MS;
}

export const emptyWeek = (): WeekSave => ({
  run: null, rewarded: [], best: 0, wins: 0, played: 0, marks: 0, levels: { hands: 0, shelves: 0, eye: 0 },
  event: emptyWeekEvent(),
});

/** Reward tiers of one weekend. A bit mask is all the save needs. */
export const WEEK_TIER = { finish: 1, win: 2, three: 4 } as const;

/** The run seed for a week. Every player in the same Monday-to-Sunday week gets the same schedule. */
export function weekSeedFor(week: string): number { return hash('parcelwood-station-week:' + week); }
export function weekSeed(now: number): number { return weekSeedFor(weekOf(now)); }

/** The event window: Friday 00:00 to Sunday 24:00 in the player's local time. */
export function weekEventOpen(now: number): boolean {
  const day = new Date(now).getDay();
  return day === 5 || day === 6 || day === 0;
}

/** Whole days until the next Friday, for the "opens in N days" line. 0 while the event is open. */
export function weekDaysToOpen(now: number): number {
  if (weekEventOpen(now)) return 0;
  const d = new Date(now);
  const add = (5 - d.getDay() + 7) % 7;
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
  return Math.max(1, Math.ceil((target.getTime() - now) / 86400000));
}

export interface WeekEventStatus {
  week: string; open: boolean; daysToOpen: number; seed: number; theme: [RunEvent, RunEvent];
  claimed: number; best: number; bestSold: number; plays: number; clockBehind: boolean;
}

/** This week's event state for the card and the overlay. A record from an older week reads as empty. */
export function weekEventStatus(state: GameState, now: number): WeekEventStatus {
  const week = weekOf(now);
  const seed = weekSeedFor(week);
  const rec = state.week.event;
  const mine = rec.week === week;
  const clockBehind = weekClockBehind(state, now);
  const open = weekEventOpen(now) && !clockBehind;
  return {
    week, open, daysToOpen: open ? 0 : Math.max(1, weekDaysToOpen(now)), seed, theme: weekTheme(seed),
    claimed: mine ? rec.claimed : 0, best: mine ? rec.best : 0, bestSold: mine ? rec.bestSold : 0, plays: mine ? rec.plays : 0,
    clockBehind,
  };
}

/** Turns the purchased tiers into the run's starting modifiers. */
export function modsFromLevels(levels: WeekLedger): WeekMods {
  const mods: WeekMods = { ...ZERO_MODS };
  for (const def of LEDGER) {
    const level = levels[def.id] ?? 0;
    for (let i = 0; i < level && i < def.tiers.length; i++) {
      for (const key of Object.keys(def.tiers[i].mods) as (keyof WeekMods)[]) mods[key] += def.tiers[i].mods[key] ?? 0;
    }
  }
  return mods;
}

/** Spends marks on the next tier of one line. Only possible between runs, so a live run's snapshot can't change. */
export function weekBuy(state: GameState, id: LedgerId): boolean {
  if (state.week.run) return false;
  const def = LEDGER.find(d => d.id === id);
  if (!def) return false;
  const level = state.week.levels[id];
  const tier = def.tiers[level];
  if (!tier || state.week.marks < tier.cost) return false;
  state.week = {
    ...state.week,
    marks: state.week.marks - tier.cost,
    levels: { ...state.week.levels, [id]: level + 1 },
  };
  return true;
}

export function weekStart(state: GameState, seed: number): RunState {
  const s = seed >>> 0;
  const mods = modsFromLevels(state.week.levels);
  state.week = { ...state.week, run: { seed: s, log: [], mods } };
  return replay(s, [], mods) as RunState;
}

/** The run in progress, or null. A log that no longer replays (an edited save, a rules change) is dropped. */
export function weekLoad(state: GameState): RunState | null {
  const saved = state.week.run;
  if (!saved) return null;
  const run = replay(saved.seed, saved.log, { ...ZERO_MODS, ...(saved.mods ?? {}) });
  if (!run) state.week = { ...state.week, run: null };
  return run;
}

/** Applies one action to the live run and logs it. Returns false (and logs nothing) when it is not allowed. */
export function weekAct(state: GameState, run: RunState, action: RunAction): boolean {
  const saved = state.week.run;
  if (!saved || saved.log.length >= RUN_LOG_MAX || !applyAction(run, action)) return false;
  state.week = { ...state.week, run: { ...saved, log: saved.log.concat(action) } };
  return true;
}

/** What this run paid from the weekend event. paid: the tiers just paid (bit mask); claimed: all tiers paid this week. */
export interface WeekEventPayout { week: string; paid: number; claimed: number; best: number; coins: number; shards: number }
export interface WeekFinish { grade: number; marks: number; official: boolean; event: WeekEventPayout | null }

/** Ledger marks for one finished run: 1 for finishing, +1 for winning the week, +1 for a three-star week. */
export function marksForRun(run: RunState): number {
  const grade = runGrade(run);
  return Math.min(3, 1 + (run.win ? 1 : 0) + (grade === 3 ? 1 : 0));
}

/** Closes a finished run: records it and pays the day's reward once. */
export function weekFinish(state: GameState, run: RunState, now: number): WeekFinish | null {
  if (run.phase !== 'over' || !state.week.run) return null;
  const day = localDay(new Date(now));
  const official = !state.week.rewarded.includes(day);
  const grade = runGrade(run);
  const marks = official ? marksForRun(run) : 0;
  const clockBehind = weekClockBehind(state, now);
  const open = weekEventOpen(now) && !clockBehind;
  let rec = state.week.event;
  const seenBefore = Math.floor(rec.seen ?? 0);
  const seenNow = Math.floor(now);
  let payout: WeekEventPayout | null = null;
  if (open) {
    const week = weekOf(now);
    if (rec.week !== week) rec = { week, claimed: 0, best: 0, bestSold: 0, plays: 0, seen: seenBefore };
    const eligible = WEEK_TIER.finish | (run.win ? WEEK_TIER.win : 0) | (grade === 3 ? WEEK_TIER.three : 0);
    const paid = eligible & ~rec.claimed;
    const coins = (paid & WEEK_TIER.finish ? CONFIG.weekEvent.coinsFinish : 0) + (paid & WEEK_TIER.win ? CONFIG.weekEvent.coinsWin : 0);
    const shards = (paid & WEEK_TIER.win ? CONFIG.weekEvent.shardsWin : 0) + (paid & WEEK_TIER.three ? CONFIG.weekEvent.shardsThree : 0);
    state.coins += coins;
    state.shards += shards;
    const better = grade > rec.best;
    rec = { week, claimed: rec.claimed | paid, best: better ? grade : rec.best, bestSold: better ? run.stats.sold : rec.bestSold, plays: rec.plays + 1, seen: Math.max(seenBefore, seenNow) };
    payout = { week, paid, claimed: rec.claimed, best: rec.best, coins, shards };
  } else {
    rec = { ...rec, seen: Math.max(seenBefore, seenNow) };
  }
  state.week = {
    run: null,
    rewarded: official ? rememberDay(state.week.rewarded, day) : state.week.rewarded,
    best: Math.max(state.week.best, grade),
    wins: state.week.wins + (run.win ? 1 : 0),
    played: state.week.played + 1,
    marks: state.week.marks + marks,
    levels: state.week.levels,
    event: rec,
  };
  return { grade, marks, official, event: payout };
}

/** Gives up the run in progress. Nothing is paid; the run still counts as played. */
export function weekAbandon(state: GameState): void {
  if (!state.week.run) return;
  state.week = { ...state.week, run: null, played: state.week.played + 1 };
}
