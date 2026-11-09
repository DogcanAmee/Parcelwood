import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { seeded } from '../src/core/daily';
import { ITEMS, makeParcel, newState } from '../src/core/logic';
import { claimQuest, questClaimable, questDone, questNote, refreshQuests, upgradeQuests } from '../src/core/quests';
import { sanitizeState } from '../src/core/sanitize';

const T0 = new Date(2026, 10, 2, 9, 0, 0).getTime();
const DAY = 86400000;
const rng = seeded(7);
const open = (id: string, right = 0) => ({ k: 'open' as const, item: ITEMS[id], right });

describe('daily tasks', () => {
  it('makes today’s list once, then leaves it alone', () => {
    const s = newState(T0);
    expect(refreshQuests(s, T0, rng)).toBeNull();
    expect(s.quests.list.map(x => x.kind)).toEqual(['guess', 'return', 'daily']);
    const first = JSON.stringify(s.quests.list);
    expect(refreshQuests(s, T0 + 3600000, rng)).toBeNull();
    expect(JSON.stringify(s.quests.list)).toBe(first);
  });

  it('a new day pays finished, unclaimed tasks and the bonus, then posts a fresh list', () => {
    const s = newState(T0);
    refreshQuests(s, T0, rng);
    s.quests.list[0].got = s.quests.list[0].need;
    s.quests.list[1].got = s.quests.list[1].need;
    s.quests.list[2].got = s.quests.list[2].need;
    const coins = s.coins, rep = s.town.rep, shards = s.shards, parcels = s.parcels.length;
    const paid = refreshQuests(s, T0 + DAY, rng)!;
    expect(paid).toMatchObject({ tasks: 3, bonus: true, coins: 3 * CONFIG.quests.coins, rep: 3 * CONFIG.quests.rep, shards: CONFIG.quests.bonusShards, lost: CONFIG.quests.bonusLost });
    expect(s.coins).toBe(coins + 3 * CONFIG.quests.coins);
    expect(s.town.rep).toBe(rep + 3 * CONFIG.quests.rep);
    expect(s.shards).toBe(shards + CONFIG.quests.bonusShards);
    expect(s.parcels.length).toBe(parcels + CONFIG.quests.bonusLost);
    expect(s.quests.bonus).toBe(false);
    expect(s.quests.list.every(x => x.got === 0 && !x.claimed)).toBe(true);
  });

  it('pays a finished, unclaimed task but no bonus when the day changes', () => {
    const s = newState(T0);
    refreshQuests(s, T0, rng);
    s.quests.list[0].got = s.quests.list[0].need;
    const paid = refreshQuests(s, T0 + DAY, rng)!;
    expect(paid).toMatchObject({ tasks: 1, bonus: false, coins: CONFIG.quests.coins, shards: 0, lost: 0 });
  });

  it('refuses a clock moved back to an earlier date', () => {
    const s = newState(T0);
    refreshQuests(s, T0 + DAY, rng);
    const list = JSON.stringify(s.quests.list);
    expect(refreshQuests(s, T0, rng)).toBeNull();
    expect(JSON.stringify(s.quests.list)).toBe(list);
  });

  it('the third task is the daily parcel at Lv1 and Rush Hour from Lv2', () => {
    const one = newState(T0);
    refreshQuests(one, T0, rng);
    expect(one.quests.list[2].kind).toBe('daily');
    const two = newState(T0);
    two.town.rep = CONFIG.townLevels[1];
    refreshQuests(two, T0, rng);
    expect(two.quests.list[2].kind).toBe('rush');
    // A town that reaches Lv2 mid-day swaps an untouched daily task.
    one.town.rep = CONFIG.townLevels[1];
    expect(upgradeQuests(one, T0)).toBe(1);
    expect(one.quests.list[2].kind).toBe('rush');
    expect(upgradeQuests(one, T0)).toBe(0);
  });

  it('does not swap a daily task that already has progress or was claimed', () => {
    const s = newState(T0);
    refreshQuests(s, T0, rng);
    s.quests.list[2].got = 1;
    s.town.rep = CONFIG.townLevels[1];
    expect(upgradeQuests(s, T0)).toBe(0);
    expect(s.quests.list[2].kind).toBe('daily');
  });

  it('counts right guesses, returns and Rush Hour, and stops at the need', () => {
    const s = newState(T0);
    s.town.rep = CONFIG.townLevels[1];
    refreshQuests(s, T0, rng);
    expect(questNote(s, open('popcorn', 0), T0)).toHaveLength(0);
    questNote(s, open('popcorn', 2), T0);
    expect(s.quests.list[0].got).toBe(2);
    expect(questDone(s.quests.list[0])).toBe(true);
    questNote(s, open('popcorn', 1), T0);
    expect(s.quests.list[0].got).toBe(2); // capped
    expect(questNote(s, { k: 'return' }, T0).map(x => x.kind)).toEqual(['return']);
    expect(questNote(s, { k: 'rush' }, T0).map(x => x.kind)).toEqual(['rush']);
    expect(questClaimable(s)).toBe(true);
  });

  it('claims each task once, and the third claim pays the star bonus and a lost parcel over the bin limit', () => {
    const s = newState(T0);
    s.town.rep = CONFIG.townLevels[1];
    refreshQuests(s, T0, rng);
    for (let i = 0; i < CONFIG.mysteryMax; i++) s.parcels.push(makeParcel(s, 'mystery', rng));
    s.quests.list.forEach(x => { x.got = x.need; });
    const coins = s.coins, rep = s.town.rep;
    expect(claimQuest(s, 0, T0, rng)).toMatchObject({ coins: CONFIG.quests.coins, rep: CONFIG.quests.rep, bonus: null });
    expect(claimQuest(s, 0, T0, rng)).toBeNull();
    expect(claimQuest(s, 1, T0, rng)!.bonus).toBeNull();
    const shards = s.shards, parcels = s.parcels.length;
    const last = claimQuest(s, 2, T0, rng)!;
    expect(last.bonus).toEqual({ shards: CONFIG.quests.bonusShards, lost: CONFIG.quests.bonusLost });
    expect(s.coins).toBe(coins + 3 * CONFIG.quests.coins);
    expect(s.town.rep).toBe(rep + 3 * CONFIG.quests.rep);
    expect(s.shards).toBe(shards + CONFIG.quests.bonusShards);
    expect(s.parcels.length).toBe(parcels + CONFIG.quests.bonusLost); // goes over mysteryMax on purpose
    expect(claimQuest(s, 2, T0, rng)).toBeNull();
  });

  it('refuses a claim from yesterday’s list', () => {
    const s = newState(T0);
    refreshQuests(s, T0, rng);
    s.quests.list[0].got = s.quests.list[0].need;
    expect(claimQuest(s, 0, T0 + DAY, rng)).toBeNull();
  });
});

describe('daily task saves', () => {
  it('an old save without the new blocks gets defaults without losing the rest', () => {
    const s = newState(T0) as unknown as Record<string, unknown>;
    delete s.quests;
    delete s.checkin;
    const out = sanitizeState(s)!;
    expect(out).not.toBeNull();
    expect(out.quests).toEqual({ day: null, list: [], bonus: false });
    expect(out.checkin).toEqual({ last: null, stamps: 0, cards: 0 });
  });

  it('a malformed task block resets only that block', () => {
    const bad = (f: (s: any) => void) => { const s = JSON.parse(JSON.stringify(newState(T0))); f(s); const out = sanitizeState(s); expect(out).not.toBeNull(); return out!; };
    expect(bad(s => { s.quests = 'x'; }).quests).toEqual({ day: null, list: [], bonus: false });
    expect(bad(s => { s.quests.list = 'x'; }).quests.list).toEqual([]);
    expect(bad(s => { s.checkin = { last: 'x', stamps: 9, cards: -1 }; }).checkin).toEqual({ last: null, stamps: 0, cards: 0 });
    const clamped = bad(s => { s.checkin = { last: null, stamps: 99, cards: 99999 }; });
    expect(clamped.checkin.stamps).toBe(CONFIG.checkin.card - 1);
    expect(clamped.checkin.cards).toBe(10000);
    const q = bad(s => { s.quests = { day: '2026-11-02', list: [{ kind: 'guess', need: CONFIG.quests.guessNeed, got: 9, claimed: false }], bonus: false }; });
    expect(q.quests.list[0].got).toBe(CONFIG.quests.guessNeed);
  });
});
