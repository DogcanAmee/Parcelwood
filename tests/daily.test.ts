import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { localDay, newState } from '../src/core/logic';
import { dailyFits, dailyGuess, dailyNumber, dailyPool, dailyPuzzle, dailyShare, dailyStatus } from '../src/core/daily';

const T0 = new Date(2026, 9, 31, 9, 0, 0).getTime();
const DAY = 86400000;

describe('daily mystery parcel', () => {
  it('is the same puzzle for the same date and changes from day to day', () => {
    expect(dailyPuzzle('2026-11-05')).toEqual(dailyPuzzle('2026-11-05'));
    const answers = new Set(Array.from({ length: 30 }, (_, i) => dailyPuzzle(localDay(new Date(T0 + i * DAY))).answer));
    expect(answers.size).toBeGreaterThan(5);
  });

  it('has exactly one answer once all three clues are shown, every day for two years', () => {
    for (let i = 0; i < 730; i++) {
      const p = dailyPuzzle(localDay(new Date(T0 + i * DAY)));
      const fits = dailyFits(p);
      expect(fits.map(x => x.id)).toEqual([p.answer]);
      expect(CONFIG.startUnlocked).toContain(p.series);
    }
  });

  it('numbers puzzles from the first day', () => {
    expect(dailyNumber('2026-10-31')).toBe(1);
    expect(dailyNumber('2026-11-01')).toBe(2);
    expect(dailyNumber('2027-03-15')).toBe(136); // across the clock change
    expect(dailyNumber('2026-01-01')).toBe(1); // a clock set before launch
  });

  it('shows one more clue after each miss and pays once', () => {
    const s = newState(T0);
    const p = dailyStatus(s, T0).puzzle;
    const wrong = dailyPool().filter(i => i.id !== p.answer).map(i => i.id);
    expect(dailyStatus(s, T0).clues).toBe(1);
    const a = dailyGuess(s, T0, wrong[0])!;
    expect(a.finished).toBe(false); expect(a.clues).toBe(2); expect(s.shards).toBe(0);
    expect(dailyGuess(s, T0, wrong[0])).toBeNull(); // same guess twice
    expect(dailyGuess(s, T0, 'postcard')).toBeNull(); // not in the puzzle
    const b = dailyGuess(s, T0, p.answer)!;
    expect(b.won).toBe(true); expect(b.finished).toBe(true);
    expect(s.shards).toBe(CONFIG.dailyReward[1]);
    expect(dailyGuess(s, T0, wrong[1])).toBeNull(); // finished for today
    expect(s.shards).toBe(CONFIG.dailyReward[1]);
    expect(dailyShare(b, 'Parcelwood Daily')).toBe('Parcelwood Daily #1 2/3\n📦 🟥🟩⬜');
    expect(dailyShare(b, 'Parcelwood Daily')).not.toContain(p.answer);
  });

  it('never pays twice for the same date, however the clock is moved', () => {
    const s = newState(T0);
    const play = (now: number) => dailyGuess(s, now, dailyStatus(s, now).puzzle.answer);
    expect(play(T0)!.won).toBe(true);
    expect(play(T0 + 34 * DAY)!.won).toBe(true); // clock moved a month ahead: that date's puzzle, once
    const shards = s.shards;
    for (const d of [0, 34, 0, 34]) {
      const st = dailyStatus(s, T0 + d * DAY);
      expect(st.waiting || st.finished).toBe(true); // finished on the date last played, waiting on the other
      expect(play(T0 + d * DAY)).toBeNull();
    }
    expect(s.shards).toBe(shards);
    expect(dailyStatus(s, T0 + DAY).waiting).toBe(false); // a date not yet played opens as usual
    expect(s.daily.played).toEqual(['2026-10-31', '2026-12-04']);
  });

  it('pays the small reward after three misses and starts fresh the next day', () => {
    const s = newState(T0);
    const p = dailyStatus(s, T0).puzzle;
    const wrong = dailyPool().filter(i => i.id !== p.answer).map(i => i.id);
    dailyGuess(s, T0, wrong[0]); dailyGuess(s, T0, wrong[1]);
    const c = dailyGuess(s, T0, wrong[2])!;
    expect(c.finished).toBe(true); expect(c.won).toBe(false);
    expect(s.shards).toBe(CONFIG.dailyFailReward);
    expect(dailyShare(c, 'X')).toBe('X #1 X/3\n📦 🟥🟥🟥');
    const next = dailyStatus(s, T0 + DAY);
    expect(next.guesses).toEqual([]); expect(next.finished).toBe(false);
  });
});
