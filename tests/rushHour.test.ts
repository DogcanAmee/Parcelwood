import { describe, expect, it } from 'vitest';
import {
  TRAY_TOOLS, TOOL_MAX, RUSH_EASY_PARCELS, RUSH_ITEMS, RUSH_REWARD, visibleClues, rollTrayParcel, rollBoss, toolOffer, applyTool,
  toolThreshold, deliveryMs, scoreFor, gradeFor, candidates, shiftParcel, shiftBoss, shiftOffer, rushPrize, rushNumber,
  rushToday, rushBegin, rushFinish, rushShare,
} from '../src/core/rushHour';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';

const days = Array.from({ length: 30 }, (_, i) => '2026-11-' + String(i + 1).padStart(2, '0'));
const T0 = new Date(2026, 10, 2, 20, 0).getTime();

describe('rush hour parcels', () => {
  it('easy parcels show a clue that names the series', () => {
    for (const d of days) for (let i = 0; i < RUSH_EASY_PARCELS; i++) {
      const p = shiftParcel(d, i);
      expect(p.kind).toBe('normal');
      expect(candidates(p, p.clues)).toEqual([p.series]);
    }
  });

  it('every parcel can be worked out from its own clues', () => {
    for (const d of days) for (let i = 0; i < 25; i++) {
      const p = shiftParcel(d, i);
      expect(candidates(p, p.clues)).toEqual(p.kind === 'decoy' ? [] : [p.series]);
    }
  });

  it('later postmarks are smudged and usually fit more than one crate', () => {
    let smudged = 0, ambiguous = 0, normal = 0;
    for (const d of days) for (let i = RUSH_EASY_PARCELS; i < 25; i++) {
      const p = shiftParcel(d, i);
      if (p.kind !== 'normal') continue;
      normal++;
      if (p.clues.includes('smudge')) smudged++;
      if (candidates(p, ['smudge']).length >= 2) ambiguous++;
    }
    expect(smudged / normal).toBeGreaterThan(0.9);
    expect(ambiguous / normal).toBeGreaterThan(0.4);
  });

  it('mixes in misdelivered parcels after the easy ones', () => {
    let decoys = 0;
    for (const d of days) for (let i = 0; i < 25; i++) {
      const p = shiftParcel(d, i);
      if (p.kind !== 'decoy') continue;
      decoys++;
      expect(i).toBeGreaterThanOrEqual(RUSH_EASY_PARCELS);
      expect(candidates(p, ['smudge'])).toEqual([]);
    }
    expect(decoys).toBeGreaterThan(30);
  });

  it('the oversized parcel holds the day\'s keepsake and gets clearer as layers come off', () => {
    for (const d of days) {
      const b = shiftBoss(d);
      expect(b.kind).toBe('boss');
      expect(b.prize).toBe(rushPrize(d));
      expect(visibleClues(b, {}, 0)).toEqual(['smudge']);
      expect(visibleClues(b, {}, 2)).toHaveLength(3);
      expect(candidates(b, ['smudge', 'sound'])).toEqual([b.series]);
    }
  });

  it('a day\'s shift is the same for everyone and changes the next day', () => {
    expect(shiftParcel('2026-11-05', 7)).toEqual(shiftParcel('2026-11-05', 7));
    expect(shiftOffer('2026-11-05', 1, {})).toEqual(shiftOffer('2026-11-05', 1, {}));
    const a = days.slice(0, 5).map(d => shiftParcel(d, 4).item + shiftParcel(d, 5).item);
    expect(new Set(a).size).toBeGreaterThan(1);
  });

  it('rotates the keepsake through every item', () => {
    const prizes = new Set(days.slice(0, RUSH_ITEMS.length).map(rushPrize));
    expect(prizes.size).toBe(RUSH_ITEMS.length);
    expect(rushNumber('2026-10-31')).toBe(1);
  });

  it('x-ray and scale add clues without duplicates', () => {
    const p = rollTrayParcel(() => 0.01, 1);
    const shown = visibleClues(p, { scale: 1, ear: 1, xray: TOOL_MAX });
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown).toContain('weight');
    expect(shown).toContain('sticker');
  });

  it('boss parcels can be rolled directly', () => {
    const b = rollBoss(Math.random, 1, RUSH_ITEMS[0].id);
    expect(b.layers).toBe(3);
    expect(candidates(b, b.clues)).toEqual([b.series]);
  });
});

describe('rush hour rules', () => {
  it('has eight tools and offers three distinct ones', () => {
    expect(TRAY_TOOLS).toHaveLength(8);
    const offer = toolOffer({}, Math.random);
    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
  });

  it('never offers a maxed tool', () => {
    const levels = Object.fromEntries(TRAY_TOOLS.map(id => [id, TOOL_MAX]));
    expect(toolOffer(levels, Math.random)).toEqual([]);
    delete levels.tea;
    expect(toolOffer(levels, Math.random)).toEqual(['tea']);
    expect(applyTool({ tea: TOOL_MAX }, 'tea').tea).toBe(TOOL_MAX);
  });

  it('speeds up over the run and tea slows it', () => {
    expect(deliveryMs(0, {})).toBeGreaterThan(deliveryMs(80, {}));
    expect(deliveryMs(40, { tea: 2 })).toBeGreaterThan(deliveryMs(40, {}));
  });

  it('pays nothing for a wrong call and more for combos', () => {
    const p = shiftParcel('2026-11-05', 0);
    expect(scoreFor(p, false, 1, {})).toBe(0);
    expect(scoreFor(p, true, 5, {})).toBeGreaterThan(scoreFor(p, true, 1, {}));
    expect(scoreFor(p, true, 1, { star: 3 })).toBeGreaterThan(scoreFor(p, true, 1, {}));
  });

  it('grades the shift and raises the tool threshold', () => {
    expect(gradeFor(true, 0.9, 0)).toBe(3);
    expect(gradeFor(true, 0.5, 1)).toBe(1);
    expect(gradeFor(false, 0.8, 3)).toBe(1);
    expect(toolThreshold(0)).toBe(2);
    expect(toolThreshold(2)).toBe(4);
  });
});

describe('rush hour save', () => {
  const win = { score: 400, grade: 3, opened: 14, correct: 13, win: true };

  it('the first shift of the day is official and pays once', () => {
    const s = newState(T0);
    const today = rushToday(s, T0);
    expect(today.official).toBe(true);
    expect(rushBegin(s, today.day)).toBe(true);
    const first = rushFinish(s, today.day, true, win);
    expect(first).toEqual({ shards: RUSH_REWARD[3], prize: today.prize, coins: 0, practiceLeft: null });
    expect(s.shards).toBe(RUSH_REWARD[3]);
    expect(s.rush.owned).toEqual([today.prize]);
    expect(rushToday(s, T0)).toMatchObject({ official: false, prizeOwned: true, result: win });
    expect(rushBegin(s, today.day)).toBe(false);
    expect(rushFinish(s, today.day, false, win)).toEqual({ shards: 0, prize: null, coins: CONFIG.rushPractice.coinsPerStar * 3, practiceLeft: CONFIG.rushPractice.paidPerDay - 1 });
    expect(s.shards).toBe(RUSH_REWARD[3]);
  });

  it('an abandoned official shift still counts as played', () => {
    const s = newState(T0);
    const day = rushToday(s, T0).day;
    rushBegin(s, day);
    expect(rushToday(s, T0)).toMatchObject({ official: false, result: { grade: 0, score: 0 } });
  });

  it('a practice win still gives the keepsake', () => {
    const s = newState(T0);
    const day = rushToday(s, T0).day;
    rushBegin(s, day);
    rushFinish(s, day, true, { ...win, win: false, grade: 1 });
    expect(rushFinish(s, day, false, win).prize).toBe(rushPrize(day));
  });

  it('old saves load and bad rush data is rejected', () => {
    const s = newState(T0) as unknown as Record<string, unknown>;
    delete s.rush;
    expect(sanitizeState(s)?.rush).toEqual({ day: null, result: null, played: [], owned: [], practice: { day: null, paid: 0 } });
    const bad = newState(T0);
    bad.rush.owned = ['not-a-keepsake'];
    expect(sanitizeState(bad)).toBeNull();
    const bad2 = newState(T0);
    bad2.rush.result = { score: 1, grade: 9, opened: 1, correct: 1, win: true };
    expect(sanitizeState(bad2)).toBeNull();
  });

  it('builds a spoiler-free share line', () => {
    const text = rushShare('Parcelwood Rush Hour', 3, win, ['🟩', '🟨', '🟥', '🎁']);
    expect(text).toContain('#3 ★★★');
    expect(text).toContain('🟩🟨🟥🎁');
    expect(text).toContain('13/14');
  });
});
