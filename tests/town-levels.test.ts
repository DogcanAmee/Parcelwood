import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { seeded } from '../src/core/daily';
import { levelFor, localDay, makeParcel, mysteryEvery, newState, openResidents, townLevel } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';
import {
  bootstrapRep, claimLevelUp, dailyEvent, deliverTo, eventToday, giveGift, hasFeature, payXray, townDeliver, townOpen, unlocksAt, xrayPrice,
} from '../src/core/town';
import type { GameState, TownEvent } from '../src/core/types';
import { CONTENT } from '../src/i18n/strings';
import { TOWN_UI } from '../src/i18n/town';
import { V2_UI } from '../src/i18n/v2';

const T0 = new Date(2026, 9, 31, 9, 0, 0).getTime();
const DAY = 86400000;
const ITEM_ART = import.meta.glob('../public/items/*.webp');
const at = (lv: number) => { const s = newState(T0); s.town.rep = CONFIG.townLevels[lv - 1]; s.town.level = lv; return s; };
/** A 9 a.m. time on the first day from T0 with the given town event. */
function dayWith(ev: TownEvent): number {
  for (let i = 0; i < 60; i++) if (dailyEvent(localDay(new Date(T0 + i * DAY))) === ev) return T0 + i * DAY;
  throw new Error('no ' + ev);
}
const urgentFor = (s: GameState, now: number) => {
  const u = makeParcel(s, 'mystery', seeded(9)); u.urgent = now + CONFIG.urgentMs; s.parcels.push(u); return u;
};

describe('town levels', () => {
  it('turns reputation into levels 1 to 8', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(CONFIG.townLevels[1] - 1)).toBe(1);
    expect(levelFor(CONFIG.townLevels[1])).toBe(2);
    expect(levelFor(CONFIG.townLevels[4])).toBe(5);
    expect(levelFor(CONFIG.townLevels[5])).toBe(6);
    expect(levelFor(CONFIG.townLevels[6])).toBe(7);
    expect(levelFor(CONFIG.townLevels[7] - 1)).toBe(7);
    expect(levelFor(CONFIG.townLevels[7])).toBe(8);
    expect(levelFor(99999)).toBe(8);
  });

  it('opens neighbors, features and the third series level by level', () => {
    expect(unlocksAt(1)).toEqual({ level: 1, residents: ['okafor', 'theo'], features: [], series: [], decor: ['lantern', 'sprout', 'kite'] });
    expect(unlocksAt(2)).toEqual({ level: 2, residents: ['dube'], features: ['requests', 'rush'], series: [], decor: ['chime', 'cactus'] });
    expect(unlocksAt(3)).toEqual({ level: 3, residents: [], features: ['urgent', 'events'], series: [], decor: ['clock', 'globe'] });
    expect(unlocksAt(4)).toEqual({ level: 4, residents: ['lena'], features: [], series: [], decor: ['terrarium', 'carousel'] });
    expect(unlocksAt(5)).toEqual({ level: 5, residents: ['twins'], features: ['anon'], series: ['souvenirs'], decor: ['ferris', 'scale'] });
    expect(unlocksAt(6)).toEqual({ level: 6, residents: ['rosa'], features: [], series: ['garden'], decor: ['garland'] });
    expect(unlocksAt(7)).toEqual({ level: 7, residents: ['ines'], features: [], series: ['market'], decor: [] });
    expect(unlocksAt(8)).toEqual({ level: 8, residents: [], features: [], series: ['lost-letter-office'], decor: ['horn', 'trolley'] });
  });

  it('announces every level reached once, and opens City Souvenirs at Lv5', () => {
    const s = newState(T0);
    s.town.rep = CONFIG.townLevels[4];
    expect(claimLevelUp(s)).toEqual([2, 3, 4, 5]);
    expect(s.unlocked).toContain('souvenirs');
    expect(claimLevelUp(s)).toEqual([]);
  });

  it('opens Greenhouse Row and Rosa at Lv6, with art and text in every language', () => {
    const s = at(5);
    s.unlocked.push('souvenirs');
    expect(s.unlocked).not.toContain('garden');
    s.town.rep = CONFIG.townLevels[5];
    expect(claimLevelUp(s)).toEqual([6]);
    expect(s.unlocked).toContain('garden');
    expect(openResidents(s).map(r => r.id)).toContain('rosa');
    const garden = CONFIG.series.find(x => x.id === 'garden')!;
    expect(garden.items.map(i => i.r).sort()).toEqual(['common', 'common', 'common', 'common', 'epic', 'rare', 'rare', 'secret']);
    for (const it of garden.items) {
      expect(Object.keys(ITEM_ART)).toContain('../public/' + it.img);
      for (const l of ['zh', 'es'] as const) expect(CONTENT[l].items[it.id]).toHaveLength(2);
    }
    for (const l of ['zh', 'es'] as const) expect(CONTENT[l].series.garden).toHaveLength(3);
    for (const l of ['en', 'zh', 'es'] as const) {
      expect(TOWN_UI[l].levelNames).toHaveLength(CONFIG.townLevels.length);
      expect(TOWN_UI[l].traits.rosa).toBeTruthy();
      expect(TOWN_UI[l].anonClues.rosa).toHaveLength(2);
      expect(V2_UI[l].react.rosa).toHaveLength(4);
    }
  });

  it('opens Market Row and Inés at Lv7, with art and text in every language', () => {
    const s = at(6);
    s.unlocked.push('souvenirs', 'garden');
    expect(s.unlocked).not.toContain('market');
    s.town.rep = CONFIG.townLevels[6];
    expect(claimLevelUp(s)).toEqual([7]);
    expect(s.unlocked).toContain('market');
    expect(openResidents(s).map(r => r.id)).toContain('ines');
    const market = CONFIG.series.find(x => x.id === 'market')!;
    expect(market.items.map(i => i.r).sort()).toEqual(['common', 'common', 'common', 'common', 'epic', 'rare', 'rare', 'secret']);
    const allE = CONFIG.series.flatMap(x => x.items.map(i => i.e));
    expect(new Set(allE).size).toBe(allE.length);
    for (const it of market.items) {
      expect(Object.keys(ITEM_ART)).toContain('../public/' + it.img);
      for (const l of ['zh', 'es'] as const) expect(CONTENT[l].items[it.id]).toHaveLength(2);
    }
    for (const l of ['zh', 'es'] as const) { expect(CONTENT[l].series.market).toHaveLength(3); expect(CONTENT[l].residents.ines[2]).toHaveLength(3); }
    for (const l of ['en', 'zh', 'es'] as const) {
      expect(TOWN_UI[l].traits.ines).toBeTruthy();
      expect(TOWN_UI[l].anonClues.ines).toHaveLength(2);
      expect(V2_UI[l].react.ines).toHaveLength(4);
      expect(V2_UI[l].reactShort.ines).toBeTruthy();
    }
  });

  it('opens the Lost Letter Office at Lv8, with the artist hand-off ids and text in every language', () => {
    const s = at(7);
    s.unlocked.push('souvenirs', 'garden', 'market');
    expect(s.unlocked).not.toContain('lost-letter-office');
    s.town.rep = CONFIG.townLevels[7];
    expect(claimLevelUp(s)).toEqual([8]);
    expect(s.unlocked).toContain('lost-letter-office');
    const lost = CONFIG.series.find(x => x.id === 'lost-letter-office')!;
    expect(lost.items.map(i => i.id)).toEqual([
      'tied-parcel', 'sealed-letter', 'wax-stamp', 'postal-key',
      'return-to-sender-tag', 'mail-pouch', 'pocket-watch', 'paper-crane',
    ]);
    expect(lost.items.map(i => i.r).sort()).toEqual(['common', 'common', 'common', 'common', 'epic', 'rare', 'rare', 'secret']);
    expect(lost.postmark).toBe('DEAD LETTER');
    expect(lost.shop).toBe('Dead Letter Depot');
    expect(lost.color).toBe('#2456c4');
    const allE = CONFIG.series.flatMap(x => x.items.map(i => i.e));
    expect(new Set(allE).size).toBe(allE.length);
    for (const it of lost.items) {
      expect(Object.keys(ITEM_ART)).toContain('../public/' + it.img);
      for (const l of ['zh', 'es'] as const) expect(CONTENT[l].items[it.id]).toHaveLength(2);
    }
    for (const l of ['zh', 'es'] as const) expect(CONTENT[l].series['lost-letter-office']).toHaveLength(3);
    for (const l of ['en', 'zh', 'es'] as const) expect(TOWN_UI[l].levelNames).toHaveLength(CONFIG.townLevels.length);
  });

  it('misdelivered parcels only come for neighbors who have moved in', () => {
    const s = newState(T0), rng = seeded(3);
    for (let i = 0; i < 100; i++) expect(['okafor', 'theo']).toContain(makeParcel(s, 'mystery', rng).resident);
    expect(openResidents(at(4)).map(r => r.id).sort()).toEqual(['dube', 'lena', 'okafor', 'theo']);
  });

  it('opening, guessing, returning and finishing the daily parcel all earn reputation', () => {
    const s = newState(T0);
    townDeliver(s, T0, seeded(1));
    const p = s.parcels.find(x => x.kind === 'normal')!;
    p.guess.series = p.series;
    const res = townOpen(s, p.id, seeded(2), T0)!;
    expect(res.rep).toBe(CONFIG.rep.open + CONFIG.rep.guess);
    expect(s.town.rep).toBe(res.rep);
  });
});

describe('old saves', () => {
  it('start at the level their progress already earned, without a level-up flood', () => {
    const old = newState(T0) as unknown as Record<string, unknown>;
    delete old.town;
    (old.stats as GameState['stats']).opened = 60; (old.stats as GameState['stats']).returned = 4; old.hearts = { theo: 2 };
    const s = sanitizeState(JSON.parse(JSON.stringify(old)))!;
    expect(s.town.rep).toBe(bootstrapRep(s));
    expect(s.town.rep).toBe(60 + 4 * CONFIG.rep.ret + 2 * 3);
    expect(s.town.level).toBe(townLevel(s));
    expect(claimLevelUp(s)).toEqual([]);
  });

  it('drops unknown town ids but rejects a malformed town block and odd parcel flags', () => {
    const ok = at(5);
    ok.town.gifts = ['2026-10-31|theo']; ok.town.known = ['theo'];
    const u = urgentFor(ok, T0);
    const a = makeParcel(ok, 'mystery', seeded(2)); a.anon = true; a.misses = 1; ok.parcels.push(a);
    ok.parcels.push(makeParcel(ok, 'normal', seeded(3)));
    expect(sanitizeState(JSON.parse(JSON.stringify(ok)))).not.toBeNull();
    const bad = (f: (s: GameState) => void) => { const s = JSON.parse(JSON.stringify(ok)); f(s); return sanitizeState(s); };
    expect(bad(s => { s.town.level = 0; })).toBeNull();
    expect(bad(s => { s.town.known = ['mallory', 'theo']; })!.town.known).toEqual(['theo']);
    expect(bad(s => { s.town.gifts = ['<b>|theo']; })!.town.gifts).toEqual([]);
    expect(bad(s => { s.town.rep = -1; })).toBeNull();
    expect(bad(s => { s.parcels.find(p => p.kind === 'normal')!.anon = true; })).toBeNull();
    expect(bad(s => { s.parcels.find(p => p.id === u.id)!.anon = true; })).toBeNull();
  });
});

describe('daily town events', () => {
  it('are the same for everyone on a date, and all three come up within a month', () => {
    expect(dailyEvent('2026-11-05')).toBe(dailyEvent('2026-11-05'));
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(dailyEvent(localDay(new Date(T0 + i * DAY))));
    expect(seen).toEqual(new Set(['rain', 'powercut', 'moving']));
  });

  it('start at Lv3', () => {
    expect(eventToday(at(2), T0)).toBeNull();
    expect(eventToday(at(3), T0)).toBe(dailyEvent(localDay(new Date(T0))));
  });

  it('rain smudges most morning postmarks and pays double for a right series guess', () => {
    const now = dayWith('rain'), s = at(3);
    townDeliver(s, now, seeded(5));
    const normal = s.parcels.filter(p => p.kind === 'normal');
    expect(normal.filter(p => p.postmarkClear).length).toBeLessThan(normal.length / 2 + 1);
    const p = normal[0]; p.guess.series = p.series;
    const res = townOpen(s, p.id, seeded(6), now)!;
    expect(res.bonus).toBe(CONFIG.guessReward.series);
    expect(res.shards).toBe(2 * CONFIG.guessReward.series);
  });

  it('a power cut takes the X-ray away', () => {
    const s = at(3), now = dayWith('powercut');
    expect(xrayPrice(s, now)).toBeNull();
    expect(payXray(s, now)).toBe(false);
  });

  it('moving day brings an extra misdelivered parcel and pays more for returns', () => {
    const now = dayWith('moving'), s = at(3);
    s.lastMystery = now;
    const out = townDeliver(s, now, seeded(7));
    expect(out.extra).toBe(1);
    const m = s.parcels.find(p => p.kind === 'mystery' && !p.urgent)!;
    const coins = s.coins;
    const r = deliverTo(s, m.id, m.resident!, now)!;
    expect(r.coins).toBe(CONFIG.returnReward + CONFIG.movingBonus);
    expect(s.coins).toBe(coins + r.coins);
  });
});

describe('urgent parcels', () => {
  it('come with the morning truck from Lv3, once a day, at most two waiting', () => {
    const s2 = at(2);
    expect(townDeliver(s2, T0, seeded(1)).urgent).toBe(0);
    const s = at(3);
    expect(townDeliver(s, T0, seeded(1)).urgent).toBe(1);
    const u = s.parcels.find(p => p.urgent)!;
    expect(u.urgent).toBe(T0 + CONFIG.urgentMs);
    expect(townDeliver(s, T0 + 3600000, seeded(2)).urgent).toBe(0);
    townDeliver(s, T0 + DAY, seeded(3));
    townDeliver(s, T0 + 2 * DAY, seeded(4));
    expect(s.parcels.filter(p => p.urgent)).toHaveLength(2);
  });

  it('pay a bonus and an extra heart in time, the plain reward when late, and are never opened', () => {
    const s = at(3), now = dayWith('rain');
    const a = urgentFor(s, now);
    expect(townOpen(s, a.id, seeded(1), now)).toBeNull();
    const r = deliverTo(s, a.id, a.resident!, now + 1000)!;
    expect(r.onTime).toBe(true);
    expect(r.coins).toBe(CONFIG.returnReward + CONFIG.urgentBonus);
    expect(r.hearts).toBe(2);
    expect(r.rep).toBe(CONFIG.rep.urgent);
    const b = urgentFor(s, now);
    const late = deliverTo(s, b.id, b.resident!, now + CONFIG.urgentMs + 1)!;
    expect(late.onTime).toBe(false);
    expect(late.coins).toBe(CONFIG.returnReward);
  });
});

describe('parcels with no name', () => {
  it('only appear from Lv5', () => {
    for (const lv of [4, 5]) {
      const s = at(lv);
      let anon = 0;
      for (let i = 0; i < 30; i++) { s.parcels = []; s.lastMystery = T0 - 3 * CONFIG.mysteryEveryMs; s.deliveryDays = [localDay(new Date(T0))]; townDeliver(s, T0, seeded(i)); anon += s.parcels.filter(p => p.anon).length; }
      if (lv === 4) expect(anon).toBe(0); else expect(anon).toBeGreaterThan(0);
    }
  });

  it('a wrong guess costs nothing and the parcel stays; a right first guess pays a bonus', () => {
    const s = at(5), now = dayWith('rain');
    const p = makeParcel(s, 'mystery', seeded(4)); p.anon = true; p.misses = 0; s.parcels.push(p);
    const wrong = openResidents(s).find(r => r.id !== p.resident)!.id;
    const coins = s.coins;
    expect(deliverTo(s, p.id, wrong, now)!.ok).toBe(false);
    expect(s.coins).toBe(coins);
    expect(s.parcels.some(x => x.id === p.id)).toBe(true);
    const r = deliverTo(s, p.id, p.resident!, now)!;
    expect(r.ok).toBe(true);
    expect(r.firstTry).toBe(false);
    expect(r.coins).toBe(CONFIG.returnReward);
    const q = makeParcel(s, 'mystery', seeded(5)); q.anon = true; q.misses = 0; s.parcels.push(q);
    const r2 = deliverTo(s, q.id, q.resident!, now)!;
    expect(r2.firstTry).toBe(true);
    expect(r2.coins).toBe(CONFIG.returnReward + CONFIG.anonBonus);
    expect(r2.rep).toBe(CONFIG.rep.anon);
  });
});

describe('gifts and perks', () => {
  it('a favourite gift counts double and becomes known; one gift per neighbor a day', () => {
    const s = at(1);
    s.owned['soda-can'] = 3; s.owned['rice-ball'] = 3;
    expect(giveGift(s, 'theo', 'soda-can', T0)!.fav).toBe(false);
    expect(s.hearts.theo).toBe(1);
    expect(giveGift(s, 'theo', 'rice-ball', T0)).toBeNull();
    const g = giveGift(s, 'theo', 'rice-ball', T0 + DAY)!;
    expect(g.fav).toBe(true);
    expect(s.hearts.theo).toBe(3);
    expect(s.town.known).toEqual(['theo']);
    expect(s.owned['rice-ball']).toBe(2);
    s.owned['popcorn'] = 1;
    expect(giveGift(s, 'okafor', 'popcorn', T0)).toBeNull();
    expect(giveGift(s, 'lena', 'soda-can', T0)).toBeNull();
  });

  it('friendship perks: Theo pays roll money, Mr. Dube a free daily X-ray, Lena faster misdelivered parcels', () => {
    const s = at(4), now = dayWith('rain');
    s.hearts = { theo: 3, dube: 3, lena: 3 };
    const coins = s.coins;
    expect(townDeliver(s, now, seeded(1)).coins).toBe(CONFIG.theoCoins);
    expect(s.coins).toBe(coins + CONFIG.theoCoins);
    expect(xrayPrice(s, now)).toBe(0);
    expect(payXray(s, now)).toBe(true);
    expect(xrayPrice(s, now)).toBe(CONFIG.xrayCost);
    expect(mysteryEvery(s)).toBe(CONFIG.lenaMysteryMs);
    expect(mysteryEvery(at(3))).toBe(CONFIG.mysteryEveryMs);
    expect(hasFeature(s, 'rush')).toBe(true);
  });
});
