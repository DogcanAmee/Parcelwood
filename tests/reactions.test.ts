// A neighbor's remark after each opened parcel (docs/design-v2.md, step 1): deterministic, only neighbors who
// have moved in, and a "favorite sound" line that names the favorite only once the player has found it.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { ITEMS, newState } from '../src/core/logic';
import { REACTION_LINES, reactionFor } from '../src/core/reactions';
import { UI } from '../src/i18n/strings';

const T0 = new Date(2026, 10, 2, 9).getTime();
const DAY = '2026-11-02';

describe('neighbor reactions', () => {
  it('is the same for the same parcel and day', () => {
    const s = newState(T0);
    const a = reactionFor(s, ITEMS['rice-ball'], 7, DAY), b = reactionFor(s, ITEMS['rice-ball'], 7, DAY);
    expect(a).toEqual(b);
  });

  it('only picks neighbors who have moved in', () => {
    const s = newState(T0);
    const here = new Set(CONFIG.residents.filter(r => r.lv <= 1).map(r => r.id));
    for (let id = 1; id <= 200; id++) {
      const r = reactionFor(s, ITEMS['yo-yo'], id, DAY)!;
      expect(here.has(r.resident.id)).toBe(true);
      expect(r.line).toBeGreaterThanOrEqual(0);
      expect(r.line).toBeLessThan(REACTION_LINES);
    }
  });

  it('a favorite-sound line comes from the neighbor who loves that sound, and knows whether it was found', () => {
    const s = newState(T0);
    const theo = CONFIG.residents.find(r => r.id === 'theo')!;
    const item = Object.values(ITEMS).find(i => i.snd === theo.like)!;
    let likes = 0;
    for (let id = 1; id <= 100; id++) {
      const r = reactionFor(s, item, id, DAY)!;
      if (r.kind === 'like') { likes++; expect(r.resident.id).toBe('theo'); expect(r.known).toBe(false); }
    }
    expect(likes).toBeGreaterThan(0);
    s.town.known.push('theo');
    const id = Array.from({ length: 100 }, (_, i) => i + 1).find(i => reactionFor(s, item, i, DAY)!.kind === 'like')!;
    expect(reactionFor(s, item, id, DAY)!.known).toBe(true);
  });

  it('every neighbor has every line in every language, each with the item placeholder or none at all', () => {
    for (const lang of ['en', 'zh', 'es'] as const) {
      for (const r of CONFIG.residents) {
        expect(UI[lang].react[r.id]).toHaveLength(REACTION_LINES);
        expect(typeof UI[lang].reactShort[r.id]).toBe('string');
      }
      expect(UI[lang].reactLikeKnown).toContain('{s}');
      expect(UI[lang].reactLikeHint).not.toContain('{s}');
    }
  });
});
