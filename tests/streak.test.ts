import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { seeded } from '../src/core/daily';
import { ITEMS, makeParcel, newState } from '../src/core/logic';
import { applyStreak, isStreakMilestone, streakBonus } from '../src/core/streak';
import { townOpen } from '../src/core/town';
import { UI } from '../src/i18n/strings';

const T0 = new Date(2026, 10, 2, 9, 0, 0).getTime();
const rng = seeded(11);

describe('guess streak', () => {
  it('pays the curve and caps at 20', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 15].map(streakBonus)).toEqual([0, 0, 4, 8, 12, 16, 20, 20, 20]);
    expect(CONFIG.streak).toMatchObject({ step: 4, cap: 20, milestones: [3, 5, 10], every: 5 });
  });

  it('marks 3, 5, 10 and then every 5 as milestones', () => {
    const marks = [1, 2, 3, 4, 5, 6, 9, 10, 11, 14, 15, 20, 25].filter(isStreakMilestone);
    expect(marks).toEqual([3, 5, 10, 15, 20, 25]);
  });

  it('adds one on a right guess, pays the bonus and remembers the best', () => {
    const s = newState(T0), coins = s.coins;
    expect(applyStreak(s, true)).toEqual({ n: 1, bonus: 0, broke: null, milestone: false });
    expect(applyStreak(s, true)).toEqual({ n: 2, bonus: 4, broke: null, milestone: false });
    expect(applyStreak(s, true)).toEqual({ n: 3, bonus: 8, broke: null, milestone: true });
    expect(s.streak).toEqual({ n: 3, best: 3 });
    expect(s.coins).toBe(coins + 12);
  });

  it('a wrong guess resets and reports a broken streak of 2 or more', () => {
    const s = newState(T0);
    s.streak = { n: 4, best: 4 };
    expect(applyStreak(s, false)).toEqual({ n: 0, bonus: 0, broke: 4, milestone: false });
    expect(s.streak).toEqual({ n: 0, best: 4 });
    s.streak = { n: 1, best: 4 };
    expect(applyStreak(s, false).broke).toBeNull();
  });

  it('opening without a series guess leaves the streak and best alone', () => {
    const s = newState(T0);
    s.streak = { n: 7, best: 9 };
    const coins = s.coins;
    expect(applyStreak(s, null)).toEqual({ n: 7, bonus: 0, broke: null, milestone: false });
    expect(s.streak).toEqual({ n: 7, best: 9 });
    expect(s.coins).toBe(coins);
  });

  it('townOpen carries the streak, counts only the series guess, and pays the bonus', () => {
    const s = newState(T0);
    const p = makeParcel(s, 'normal', rng);
    s.parcels = [p];
    p.guess.series = p.series;
    p.guess.rarity = null;
    const coins = s.coins;
    const r = townOpen(s, p.id, rng, T0)!;
    expect(r.streak.n).toBe(1);
    expect(r.streak.bonus).toBe(0);
    expect(s.streak.n).toBe(1);
    expect(s.coins).toBe(coins + r.coins);
  });

  it('a wrong series guess breaks the streak while a rarity-only guess does not touch it', () => {
    const s = newState(T0);
    const a = makeParcel(s, 'normal', rng);
    s.parcels = [a];
    a.guess.series = s.unlocked.find(x => x !== a.series)!;
    s.streak = { n: 5, best: 5 };
    const broken = townOpen(s, a.id, rng, T0)!;
    expect(broken.seriesRight).toBe(false);
    expect(broken.streak.broke).toBe(5);
    expect(s.streak.n).toBe(0);

    const b = makeParcel(s, 'normal', rng);
    s.parcels = [b];
    b.guess.series = null;
    b.guess.rarity = b.rarity || 'common';
    s.streak = { n: 2, best: 5 };
    const rarityOnly = townOpen(s, b.id, rng, T0)!;
    expect(rarityOnly.seriesRight).toBeNull();
    expect(rarityOnly.streak).toEqual({ n: 2, bonus: 0, broke: null, milestone: false });
    expect(s.streak).toEqual({ n: 2, best: 5 });
  });

  it('urgent parcels cannot be opened, so they never touch the streak', () => {
    const s = newState(T0);
    const p = makeParcel(s, 'mystery', rng);
    p.urgent = T0 + 1000;
    s.parcels = [p];
    s.streak = { n: 3, best: 3 };
    expect(townOpen(s, p.id, rng, T0)).toBeNull();
    expect(s.streak).toEqual({ n: 3, best: 3 });
  });

  it('has a streak line for every neighbor in every language, with the count placeholder', () => {
    for (const lang of ['en', 'zh', 'es'] as const) {
      for (const r of CONFIG.residents) {
        const line = UI[lang].streakReact[r.id];
        expect(typeof line).toBe('string');
        expect(line).toContain('{n}');
      }
    }
    expect(Object.values(ITEMS).length).toBeGreaterThan(0);
  });
});
