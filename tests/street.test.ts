// Parcel Street (docs/design-v2.md, step 2): the long goal after the last town level.
import { describe, expect, it } from 'vitest';
import { BUILDINGS, STREET_COINS, STREET_STEPS, buildingOpen, buildingSteps, claimStreet, streetBuilt, streetProgress } from '../src/core/street';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';
import { STREET_UI } from '../src/i18n/street';

const T0 = new Date(2026, 10, 2, 9, 0, 0).getTime();

describe('Parcel Street', () => {
  it('has 32 repairs, four on each of eight buildings, in rising reputation order', () => {
    expect(STREET_STEPS.length).toBe(32);
    expect(BUILDINGS.length).toBe(8);
    for (const b of BUILDINGS) expect(buildingSteps(b.id).length).toBe(4);
    STREET_STEPS.forEach((s, i) => { if (i) expect(s.rep).toBeGreaterThan(STREET_STEPS[i - 1].rep); });
  });

  it('keeps going well past the last town level', () => {
    const top = CONFIG.townLevels[CONFIG.townLevels.length - 1];
    // Lv8 moved the last level from 650 to 900. The street deliberately runs on for another 500 reputation.
    expect(streetBuilt(top)).toBeLessThan(STREET_STEPS.length * 0.75);
    expect(STREET_STEPS[STREET_STEPS.length - 1].rep).toBeGreaterThanOrEqual(top * 1.5);
  });

  it('no building gets a repair before its neighbor moves in', () => {
    for (const b of BUILDINGS) {
      if (!b.resident) continue;
      const lv = CONFIG.residents.find(r => r.id === b.resident)!.lv;
      const first = STREET_STEPS[buildingSteps(b.id)[0]].rep;
      expect(first).toBeGreaterThanOrEqual(lv > 1 ? CONFIG.townLevels[lv - 1] : 0);
      const s = newState(T0); s.town.rep = first;
      while (CONFIG.townLevels[s.town.level] !== undefined && CONFIG.townLevels[s.town.level] <= first) s.town.level++;
      expect(buildingOpen(s, b)).toBe(true);
    }
  });

  it('counts repairs from reputation and pays each one once', () => {
    const s = newState(T0);
    expect(claimStreet(s)).toEqual([]);
    s.town.rep = 60;
    const coins = s.coins;
    expect(claimStreet(s)).toEqual([0, 1, 2]);
    expect(s.coins).toBe(coins + 3 * STREET_COINS);
    expect(claimStreet(s)).toEqual([]);
    expect(s.coins).toBe(coins + 3 * STREET_COINS);
    expect(streetProgress(s)).toEqual({ built: 3, total: STREET_STEPS.length, next: 3, toNext: STREET_STEPS[3].rep - 60 });
    s.town.rep = 99999;
    expect(claimStreet(s).length).toBe(STREET_STEPS.length - 3);
    expect(streetProgress(s).next).toBeNull();
  });

  it('an old save starts at what its reputation already paid for, so nothing floods in', () => {
    const s = JSON.parse(JSON.stringify(newState(T0)));
    s.town.rep = 300; s.town.level = 5; delete s.town.street;
    const out = sanitizeState(s)!;
    expect(out.town.street).toBe(streetBuilt(300));
    expect(claimStreet(out)).toEqual([]);
  });

  it('a save cannot claim more repairs than its reputation paid for', () => {
    const s = JSON.parse(JSON.stringify(newState(T0)));
    s.town.rep = 40; s.town.street = 20;
    expect(sanitizeState(s)!.town.street).toBe(streetBuilt(40));
  });

  it('every language names every building and all 32 repairs', () => {
    for (const l of ['en', 'zh', 'es'] as const) {
      const ui = STREET_UI[l];
      expect(ui.repairs.length).toBe(STREET_STEPS.length);
      ui.repairs.forEach((r: string[]) => { expect(r.length).toBe(2); expect(r[0]).toBeTruthy(); expect(r[1]).toBeTruthy(); });
      for (const b of BUILDINGS) expect(ui.buildings[b.id]).toBeTruthy();
      for (const k of ['stTitle', 'stNote', 'stProgress', 'stNext', 'stDone', 'stWaiting', 'stModalTitle', 'stModalBtn', 'stCoins', 'stStrip', 'stMore']) expect(ui[k]).toBeTruthy();
    }
  });
});
