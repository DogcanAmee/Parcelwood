// Daily mystery parcel: one puzzle per calendar day, the same for every player, worked out from the date alone
// (no server). Clues come one at a time (shake, then scale, then postmark); three guesses at most.
// The reward is a fixed number of shards by how fast you solved it. No item is given, so nothing here is random loot.
import { CONFIG } from './config';
import { ITEMS, SERIES, daysBetween, localDay, rememberDay } from './logic';
import type { GameState, Item, Rng } from './types';

export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function seeded(seed: number): Rng {
  let a = seed;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The 16 items of the two starting series: every player can play, whatever they have unlocked. */
export function dailyPool(): Item[] {
  return CONFIG.startUnlocked.flatMap(s => SERIES[s].items.map(i => ITEMS[i.id]));
}

/** Puzzle number shown to players: #1 on the first day (never below 1, even on a clock set before launch). */
export function dailyNumber(day: string): number { return Math.max(1, daysBetween(CONFIG.dailyEpoch, day) + 1); }

export interface DailyPuzzle { day: string; n: number; answer: string; snd: Item['snd']; weight: number; series: string }

/** Items that fit every clue of a puzzle. A valid puzzle has exactly one. */
export function dailyFits(p: Pick<DailyPuzzle, 'snd' | 'weight' | 'series'>): Item[] {
  return dailyPool().filter(i => i.snd === p.snd && i.series === p.series && i.w[0] <= p.weight && p.weight <= i.w[1]);
}

export function dailyPuzzle(day: string): DailyPuzzle {
  const rng = seeded(hash('parcelwood-daily:' + day));
  const pool = dailyPool();
  let last: DailyPuzzle | null = null;
  for (let n = 0; n < 50; n++) {
    const it = pool[Math.floor(rng() * pool.length)];
    const weight = Math.round((it.w[0] + rng() * (it.w[1] - it.w[0])) * 10) / 10;
    last = { day, n: dailyNumber(day), answer: it.id, snd: it.snd, weight, series: it.series };
    if (dailyFits(last).length === 1) return last;
  }
  // Not reached with the current items (every item has a weight no neighbor shares); kept so the puzzle always exists.
  return last as DailyPuzzle;
}

/** waiting: this date's puzzle was already played (the device clock was moved), so it can't be played again. */
export interface DailyStatus { puzzle: DailyPuzzle; guesses: string[]; won: boolean; finished: boolean; clues: number; reward: number; waiting: boolean }

function rewardFor(won: boolean, tries: number): number { return won ? CONFIG.dailyReward[tries - 1] : CONFIG.dailyFailReward; }

/** Today's progress. Guesses from an earlier day do not count. */
export function dailyStatus(state: GameState, now: number): DailyStatus {
  const day = localDay(new Date(now));
  const puzzle = dailyPuzzle(day);
  if (state.daily.day !== day && state.daily.played.includes(day)) return { puzzle, guesses: [], won: false, finished: false, clues: 0, reward: 0, waiting: true };
  const guesses = state.daily.day === day ? state.daily.guesses : [];
  const won = guesses.includes(puzzle.answer);
  const finished = won || guesses.length >= CONFIG.dailyTries;
  return { puzzle, guesses, won, finished, clues: finished ? 3 : Math.min(3, guesses.length + 1), reward: finished ? rewardFor(won, guesses.length) : 0, waiting: false };
}

/** Make one guess. Pays the shards when the puzzle finishes. null when the guess is not allowed. */
export function dailyGuess(state: GameState, now: number, itemId: string): DailyStatus | null {
  const st = dailyStatus(state, now);
  if (st.waiting || st.finished || st.guesses.includes(itemId) || !dailyPool().some(i => i.id === itemId)) return null;
  state.daily = { day: st.puzzle.day, guesses: st.guesses.concat(itemId), played: rememberDay(state.daily.played, st.puzzle.day) };
  const out = dailyStatus(state, now);
  if (out.finished) state.shards += out.reward;
  return out;
}

/** Spoiler-free result to paste in a group chat, e.g. "Parcelwood Daily #3 2/3" and a row of squares. */
export function dailyShare(st: DailyStatus, title: string): string {
  const row = st.guesses.map(g => (g === st.puzzle.answer ? '🟩' : '🟥')).join('') + '⬜'.repeat(CONFIG.dailyTries - st.guesses.length);
  return title + ' #' + st.puzzle.n + ' ' + (st.won ? st.guesses.length : 'X') + '/' + CONFIG.dailyTries + '\n📦 ' + row;
}
