// Guess streak: right series guesses in a row pay a growing coin bonus, capped; a wrong guess resets it.
// Opening a parcel without a series guess leaves the streak alone. Pure functions over GameState.
import { CONFIG } from './config';
import type { GameState } from './types';

/** Coins paid when the streak reaches n right guesses in a row. */
export function streakBonus(n: number): number {
  if (n <= 1) return 0;
  return Math.min(CONFIG.streak.step * (n - 1), CONFIG.streak.cap);
}

/** True at 3, 5, 10, then every 5 (15, 20, …). */
export function isStreakMilestone(n: number): boolean {
  if (n <= 0) return false;
  if (CONFIG.streak.milestones.includes(n)) return true;
  const last = CONFIG.streak.milestones[CONFIG.streak.milestones.length - 1];
  return n > last && n % CONFIG.streak.every === 0;
}

export interface StreakResult {
  n: number;
  bonus: number;
  /** The streak that just ended, when it was at least 2. null when nothing ended. */
  broke: number | null;
  milestone: boolean;
}

/** Applies one opened parcel to the streak. seriesRight: true, false, or null when there was no series guess. */
export function applyStreak(state: GameState, seriesRight: boolean | null): StreakResult {
  if (seriesRight === null) return { n: state.streak.n, bonus: 0, broke: null, milestone: false };
  if (seriesRight) {
    const n = state.streak.n + 1;
    const bonus = streakBonus(n);
    state.streak.n = n;
    state.streak.best = Math.max(state.streak.best, n);
    state.coins += bonus;
    return { n, bonus, broke: null, milestone: isStreakMilestone(n) };
  }
  const broke = state.streak.n >= 2 ? state.streak.n : null;
  state.streak.n = 0;
  return { n: 0, bonus: 0, broke, milestone: false };
}
