import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { boardNote, claimTask, claimable, pickKinds, possibleKinds, refreshBoard, COUNTER_TASKS, TOWN_TASKS, TASK_NEED } from '../src/core/board';
import { seeded } from '../src/core/daily';
import { ITEMS, newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';
import { BOARD_UI } from '../src/i18n/board';
import type { GameState, TaskKind } from '../src/core/types';

const T0 = new Date(2026, 10, 2, 9, 0, 0).getTime();
const DAY = 86400000;
const kinds = (s: GameState) => s.board.tasks.map(x => x.kind);
/** A board with exactly these notes, for rules that do not depend on which notes were drawn. */
function withTasks(list: TaskKind[], arg: Partial<Record<TaskKind, string>> = {}) {
  const s = newState(T0);
  refreshBoard(s, T0, seeded(1));
  s.board.tasks = list.map(kind => ({ kind, by: 'theo', need: TASK_NEED[kind], got: 0, arg: arg[kind] ?? null, claimed: false }));
  return s;
}
const open = (id: string, right = 0) => ({ k: 'open' as const, item: ITEMS[id], right });

describe('town board', () => {
  it('posts three different notes once a day: one at the counter, one in town, from residents who live here', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = newState(T0);
      expect(refreshBoard(s, T0, seeded(seed))).not.toBeNull();
      const k = kinds(s);
      expect(k).toHaveLength(CONFIG.board.tasks);
      expect(new Set(k).size).toBe(k.length);
      expect(k.some(x => COUNTER_TASKS.includes(x))).toBe(true);
      expect(k.some(x => TOWN_TASKS.includes(x))).toBe(true);
      s.board.tasks.forEach(x => expect(CONFIG.residents.find(r => r.id === x.by)!.lv).toBe(1));
      expect(sanitizeState(JSON.parse(JSON.stringify(s)))).not.toBeNull();
    }
  });

  it('keeps the board all day and does not repost it when the clock is moved back', () => {
    const s = newState(T0);
    refreshBoard(s, T0, seeded(1));
    const first = JSON.stringify(s.board.tasks);
    expect(refreshBoard(s, T0 + 3600000, seeded(2))).toBeNull();
    expect(refreshBoard(s, T0 + DAY, seeded(3))).not.toBeNull();
    expect(refreshBoard(s, T0, seeded(4))).toBeNull();
    expect(JSON.stringify(s.board.tasks)).not.toBe(first);
  });

  it('only posts notes that can be done today', () => {
    const s = newState(T0);
    expect(possibleKinds(s, T0)).not.toContain('gift'); // no spare copies yet
    expect(possibleKinds(s, T0)).not.toContain('request'); // wishes are letters of their own, not jobs
    expect(possibleKinds(s, T0)).not.toContain('rush'); // Rush Hour starts at Lv2
    s.owned['rice-ball'] = 2;
    s.town.rep = CONFIG.townLevels[1];
    expect(possibleKinds(s, T0)).toEqual(expect.arrayContaining(['gift', 'rush', 'daily']));
    expect(possibleKinds(s, T0)).not.toContain('request');
    s.daily.played = ['2026-11-02'];
    expect(possibleKinds(s, T0)).not.toContain('daily');
    for (let seed = 1; seed <= 30; seed++) expect(pickKinds(newState(T0), T0, seeded(seed)).every(k => !['gift', 'request', 'rush'].includes(k))).toBe(true);
  });

  it('posts a Rush Hour note from Lv2 on every build', () => {
    const s = newState(T0);
    s.town.rep = CONFIG.townLevels[1];
    expect(possibleKinds(s, T0)).toContain('rush');
    for (let seed = 1; seed <= 40; seed++) {
      const c = newState(T0); c.town.rep = CONFIG.townLevels[1];
      refreshBoard(c, T0, seeded(seed));
      expect(c.board.tasks.length).toBe(CONFIG.board.tasks);
    }
  });

  it('counts opened parcels, right guesses, sounds and series', () => {
    const s = withTasks(['open', 'guess', 'sound'], { sound: 'slosh' });
    expect(boardNote(s, open('rice-ball', 1), T0)).toHaveLength(0);
    const done = boardNote(s, open('soda-can', 2), T0); // soda can sloshes
    expect(done.map(x => x.kind).sort()).toEqual(['guess', 'sound']);
    expect(s.board.tasks[0].got).toBe(2);
    expect(s.board.tasks[1].got).toBe(2); // capped at need
    const t2 = withTasks(['series'], { series: 'toys' });
    boardNote(t2, open('rice-ball'), T0);
    expect(t2.board.tasks[0].got).toBe(0);
    boardNote(t2, open('yo-yo'), T0); boardNote(t2, open('paper-plane'), T0);
    expect(claimable(t2)).toBe(1);
  });

  it('counts town actions only for their own note, and nothing on yesterday’s board', () => {
    const s = withTasks(['return', 'gift', 'daily']);
    expect(boardNote(s, { k: 'gift' }, T0).map(x => x.kind)).toEqual(['gift']);
    expect(s.board.tasks[0].got).toBe(0);
    expect(boardNote(s, { k: 'return' }, T0 + DAY)).toHaveLength(0);
    expect(s.board.tasks[0].got).toBe(0);
  });

  it('pays a finished note once, and the third claim gives the board stamp', () => {
    const s = withTasks(['gift', 'return', 'daily']);
    const coins = s.coins, rep = s.town.rep;
    expect(claimTask(s, 0)).toBeNull(); // not finished yet
    (['gift', 'return', 'daily'] as const).forEach(k => boardNote(s, { k }, T0));
    expect(claimTask(s, 0)).toEqual({ coins: CONFIG.board.coins, rep: CONFIG.board.rep, bonus: null });
    expect(claimTask(s, 0)).toBeNull();
    claimTask(s, 1);
    const last = claimTask(s, 2)!;
    expect(last.bonus).toEqual({ shards: CONFIG.board.bonusShards, rep: CONFIG.board.bonusRep, stamps: 1 });
    expect(s.coins).toBe(coins + 3 * CONFIG.board.coins);
    expect(s.shards).toBe(CONFIG.board.bonusShards);
    expect(s.town.rep).toBe(rep + 3 * CONFIG.board.rep + CONFIG.board.bonusRep);
    expect(s.board.bonus).toBe(true);
  });

  it('a new day pays finished notes nobody claimed, and takes nothing for the unfinished ones', () => {
    const s = withTasks(['gift', 'return', 'daily']);
    boardNote(s, { k: 'gift' }, T0);
    const coins = s.coins, shards = s.shards;
    const paid = refreshBoard(s, T0 + DAY, seeded(5))!;
    expect(paid).toEqual({ coins: CONFIG.board.coins, rep: CONFIG.board.rep, shards: 0, stamped: false });
    expect(s.coins).toBe(coins + CONFIG.board.coins);
    expect(s.shards).toBe(shards);
    expect(s.board.stamps).toBe(0);
    expect(s.board.tasks.every(x => x.got === 0 && !x.claimed)).toBe(true);
  });

  it('a new day stamps a board that was finished but not claimed', () => {
    const s = withTasks(['gift', 'return', 'daily']);
    (['gift', 'return', 'daily'] as const).forEach(k => boardNote(s, { k }, T0));
    expect(refreshBoard(s, T0 + DAY, seeded(5))!.stamped).toBe(true);
    expect(s.board.stamps).toBe(1);
    expect(s.board.bonus).toBe(false); // the new board has its own stamp to earn
  });

  it('old saves get an empty board, broken tasks are dropped, and oversized boards are rejected', () => {
    const s = newState(T0);
    const old = JSON.parse(JSON.stringify(s)); delete old.board;
    expect(sanitizeState(old)!.board).toEqual({ day: null, tasks: [], made: [], bonus: false, stamps: 0 });
    refreshBoard(s, T0, seeded(1));
    const bad = (f: (b: any) => void) => { const c = JSON.parse(JSON.stringify(s)); f(c.board); return sanitizeState(c); };
    expect(bad(() => {})).not.toBeNull();
    expect(bad(b => { b.tasks[0].got = 99; })!.board.tasks).toHaveLength(s.board.tasks.length - 1);
    expect(bad(b => { b.tasks[0].kind = 'hack'; })!.board.tasks).toHaveLength(s.board.tasks.length - 1);
    expect(bad(b => { b.tasks[0].by = '<img>'; })!.board.tasks).toHaveLength(s.board.tasks.length - 1);
    expect(bad(b => { b.tasks[0].claimed = true; })!.board.tasks).toHaveLength(s.board.tasks.length - 1); // claimed but not finished
    expect(bad(b => { b.tasks.push(b.tasks[0]); })).toBeNull();
    expect(bad(b => { b.tasks[0].extra = '<script>'; })!.board.tasks[0]).not.toHaveProperty('extra');
  });

  it('every task kind has text in every language', () => {
    (['en', 'zh', 'es'] as const).forEach(l => (Object.keys(TASK_NEED) as TaskKind[]).forEach(k => {
      expect(BOARD_UI[l].tasks[k]).toBeTruthy();
      expect(BOARD_UI[l].taskSay[k]).toBeTruthy();
    }));
  });
});
