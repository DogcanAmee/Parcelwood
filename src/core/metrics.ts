// Play counters for the design v2 checks (docs/design-v2.md §9, docs/metrics.md). Gameplay numbers only, no personal
// data. Kept in the save, so signed-in web and Discord players' numbers reach the `saves` table with their cloud save.
//   first: first day these counters saw (for day-1 / day-7 return).
//   days: one row per day played, newest last: o opened, g opened after picking a series, dl daily puzzle
//   (0 not played, 1 started, 2 finished), sh results copied.
import type { GameState, MetricDay, MetricsSave } from './types';

export const METRIC_DAYS = 60;

export function newMetrics(): MetricsSave { return { first: null, days: [] }; }

function today(state: GameState, day: string): MetricDay {
  const m = state.metrics;
  if (!m.first) m.first = day;
  let row = m.days.find(d => d.d === day);
  if (!row) {
    row = { d: day, o: 0, g: 0, dl: 0, sh: 0 };
    m.days.push(row);
    m.days.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    if (m.days.length > METRIC_DAYS) m.days.splice(0, m.days.length - METRIC_DAYS);
  }
  return row;
}

/** The player opened the game today (also called by the clock tick, for a tab left open past midnight). True = a new day row. */
export function noteVisit(state: GameState, day: string): boolean {
  const had = state.metrics.days.some(d => d.d === day);
  today(state, day);
  return !had;
}
/** A parcel was opened; guessed = a series was picked first. */
export function noteOpen(state: GameState, day: string, guessed: boolean): void { const r = today(state, day); r.o++; if (guessed) r.g++; }
/** The daily puzzle got a guess; finished = it is solved or out of tries. */
export function noteDaily(state: GameState, day: string, finished: boolean): void { const r = today(state, day); r.dl = Math.max(r.dl, finished ? 2 : 1) as MetricDay['dl']; }
/** The daily result was copied to share. */
export function noteShare(state: GameState, day: string): void { today(state, day).sh++; }

export interface MetricsSummary {
  days: number;
  opened: number;
  /** Share of opened parcels where a series was picked first (null before any opening). */
  guessFirst: number | null;
  /** Share of days played on which the daily puzzle was finished. */
  dailyFinish: number | null;
  /** Share of finished daily puzzles whose result was copied. */
  dailyShare: number | null;
  /** Came back the day after / 7 days after the first day (null while that day hasn't come yet in the data). */
  d1: boolean | null;
  d7: boolean | null;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

export function metricsSummary(state: GameState, todayDay: string): MetricsSummary {
  const m = state.metrics, days = m.days;
  const opened = days.reduce((a, d) => a + d.o, 0), guessed = days.reduce((a, d) => a + d.g, 0);
  const finished = days.filter(d => d.dl === 2).length, shared = days.filter(d => d.dl === 2 && d.sh > 0).length;
  const back = (n: number) => {
    if (!m.first) return null;
    const target = addDays(m.first, n);
    if (days.some(d => d.d === target)) return true;
    return todayDay > target ? false : null;
  };
  return {
    days: days.length, opened,
    guessFirst: opened ? guessed / opened : null,
    dailyFinish: days.length ? finished / days.length : null,
    dailyShare: finished ? shared / finished : null,
    d1: back(1), d7: back(7),
  };
}
