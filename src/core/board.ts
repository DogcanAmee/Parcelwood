// Today's letters (docs/design-v2.md, step 1b): every morning three neighbors leave a letter on the board.
// From Lv2 two of them are wishes: a riddle about an item, answered by handing over a spare (paid on the spot,
// with a heart). The rest are jobs: one about opening parcels, one out in town, a third of either. Job progress
// counts on its own as the player plays; a finished job is claimed. All three done: a board stamp, shards and reputation.
// Nothing is lost by skipping a day. Finished notes nobody claimed are paid out when the next board goes up.
import { CONFIG } from './config';
import { ITEMS, SERIES, localDay, openResidents, pick, rememberDay } from './logic';
import { handOver, makeRequest, spares } from './requests';
import type { FulfillResult } from './requests';
import { hasFeature } from './town';
import type { BoardTask, GameState, Item, Rng, TaskKind } from './types';

export const COUNTER_TASKS: readonly TaskKind[] = ['open', 'guess', 'sound', 'series'];
export const TOWN_TASKS: readonly TaskKind[] = ['return', 'gift', 'daily', 'rush'];
export const TASK_NEED: Record<TaskKind, number> = { open: 3, guess: 2, sound: 1, series: 2, return: 1, gift: 1, daily: 1, request: 1, rush: 1, wish: 1 };

/** Something the player just did that a note may count. right: right guesses (0..2) on an opened parcel. */
export type BoardEvent =
  | { k: 'open'; item: Item; right: number }
  | { k: 'return' | 'gift' | 'daily' | 'rush' };

export const taskDone = (task: BoardTask) => task.got >= task.need;

/** Sounds the player can reasonably meet today: those of common items in an unlocked series. */
function commonSounds(state: GameState): string[] {
  return [...new Set(state.unlocked.flatMap(s => SERIES[s].items.filter(i => i.r === 'common').map(i => ITEMS[i.id].snd)))];
}

/** Kinds that can be finished today with what the town has opened so far. */
export function possibleKinds(state: GameState, now: number): TaskKind[] {
  const today = localDay(new Date(now));
  return [...COUNTER_TASKS, ...TOWN_TASKS].filter(k => {
    if (k === 'gift') return spares(state).length > 0;
    if (k === 'daily') return today >= CONFIG.dailyEpoch && !state.daily.played.includes(today);
    if (k === 'rush') return hasFeature(state, 'rush') && !state.rush.played.includes(today);
    return true;
  });
}

function makeTask(state: GameState, kind: TaskKind, by: string, rng: Rng): BoardTask {
  const arg = kind === 'sound' ? pick(commonSounds(state), rng) : kind === 'series' ? pick(state.unlocked, rng) : null;
  return { kind, by, need: TASK_NEED[kind], got: 0, arg, claimed: false };
}

/** Up to `count` different job kinds: one at the counter, one in town, the rest of either. */
export function pickKinds(state: GameState, now: number, rng: Rng, count = CONFIG.board.tasks): TaskKind[] {
  const can = possibleKinds(state, now);
  const out: TaskKind[] = [];
  const take = (from: readonly TaskKind[]) => {
    const left = from.filter(k => can.includes(k) && !out.includes(k));
    if (left.length) out.push(pick(left, rng));
  };
  if (count > 0) take(COUNTER_TASKS);
  if (out.length < count) take(TOWN_TASKS);
  while (out.length < count && can.some(k => !out.includes(k))) take(can);
  return out;
}

/** Today's wishes: from Lv2, up to requestsPerDay neighbors ask for an item, always leaving room for one job. */
function makeWishes(state: GameState, rng: Rng): BoardTask[] {
  if (!hasFeature(state, 'requests')) return [];
  const who = openResidents(state).map(r => r.id), out: BoardTask[] = [];
  while (out.length < Math.min(CONFIG.requestsPerDay, CONFIG.board.tasks - 1) && who.length) {
    const by = who.splice(Math.floor(rng() * who.length), 1)[0];
    const rq = makeRequest(state, by, rng);
    if (rq) out.push({ kind: 'wish', by, need: TASK_NEED.wish, got: 0, arg: null, claimed: false, clues: rq.clues });
  }
  return out;
}

export interface BoardPayout { coins: number; rep: number; shards: number; stamped: boolean }

/** Pays every finished note not yet claimed, and the board stamp if all are finished. Used when a board is taken down. */
function payLeftovers(state: GameState): BoardPayout {
  const b = state.board, out: BoardPayout = { coins: 0, rep: 0, shards: 0, stamped: false };
  b.tasks.forEach(task => {
    if (taskDone(task) && !task.claimed) { task.claimed = true; out.coins += CONFIG.board.coins; out.rep += CONFIG.board.rep; }
  });
  if (b.tasks.length && b.tasks.every(x => x.claimed) && !b.bonus) {
    b.bonus = true; b.stamps += 1; out.shards += CONFIG.board.bonusShards; out.rep += CONFIG.board.bonusRep; out.stamped = true;
  }
  state.coins += out.coins; state.shards += out.shards; state.town.rep += out.rep;
  return out;
}

/** Puts up today's letters (first call of a day). Returns what the old board still owed, or null when nothing changed. */
export function refreshBoard(state: GameState, now: number, rng: Rng): BoardPayout | null {
  const today = localDay(new Date(now));
  if (state.board.day === today || state.board.made.includes(today)) return null;
  const paid = payLeftovers(state);
  const wishes = makeWishes(state, rng);
  const who = openResidents(state).map(r => r.id);
  const posters = who.filter(id => !wishes.some(w => w.by === id));
  const jobs = pickKinds(state, now, rng, CONFIG.board.tasks - wishes.length).map(kind => {
    if (!posters.length) posters.push(...who);
    const by = posters.splice(Math.floor(rng() * posters.length), 1)[0];
    return makeTask(state, kind, by, rng);
  });
  state.board = { day: today, tasks: [...wishes, ...jobs], made: rememberDay(state.board.made, today), bonus: false, stamps: state.board.stamps };
  return paid;
}

/** Wishes open at Lv2. A town that gets there mid-day swaps today's untouched jobs for wishes, so the new
 *  feature shows up at once. Returns how many letters changed. */
export function addWishes(state: GameState, now: number, rng: Rng): number {
  const b = state.board;
  if (b.day !== localDay(new Date(now)) || b.bonus || b.tasks.some(x => x.kind === 'wish')) return 0;
  const free = b.tasks.map((x, i) => (x.got === 0 && !x.claimed ? i : -1)).filter(i => i >= 0);
  const wishes = makeWishes(state, rng).slice(0, Math.min(free.length, b.tasks.length - 1));
  wishes.forEach((w, n) => { b.tasks[free[free.length - 1 - n]] = w; });
  return wishes.length;
}

/** Counts something the player did on today's board. Returns the notes that just got finished. */
export function boardNote(state: GameState, ev: BoardEvent, now: number): BoardTask[] {
  if (state.board.day !== localDay(new Date(now))) return [];
  const finished: BoardTask[] = [];
  state.board.tasks.forEach(task => {
    if (taskDone(task)) return;
    let add = 0;
    if (ev.k === 'open') {
      if (task.kind === 'open') add = 1;
      else if (task.kind === 'guess') add = ev.right;
      else if (task.kind === 'sound' && ev.item.snd === task.arg) add = 1;
      else if (task.kind === 'series' && ev.item.series === task.arg) add = 1;
    } else if (task.kind === ev.k) add = 1;
    if (!add) return;
    task.got = Math.min(task.need, task.got + add);
    if (taskDone(task)) finished.push(task);
  });
  return finished;
}

export function claimable(state: GameState): number { return state.board.tasks.filter(x => taskDone(x) && !x.claimed).length; }

export interface ClaimResult { coins: number; rep: number; bonus: { shards: number; rep: number; stamps: number } | null }

/** Gives the board stamp once every letter of the day is done. */
function stampIfFull(state: GameState): ClaimResult['bonus'] {
  const b = state.board;
  if (b.bonus || !b.tasks.every(x => x.claimed)) return null;
  b.bonus = true; b.stamps += 1;
  state.shards += CONFIG.board.bonusShards;
  state.town.rep += CONFIG.board.bonusRep;
  return { shards: CONFIG.board.bonusShards, rep: CONFIG.board.bonusRep, stamps: b.stamps };
}

/** Claims a finished job. The last letter of the three also gives the board stamp. null: not finished, already claimed or a wish. */
export function claimTask(state: GameState, index: number): ClaimResult | null {
  const task = state.board.tasks[index];
  if (!task || task.kind === 'wish' || task.claimed || !taskDone(task)) return null;
  task.claimed = true;
  state.coins += CONFIG.board.coins;
  state.town.rep += CONFIG.board.rep;
  return { coins: CONFIG.board.coins, rep: CONFIG.board.rep, bonus: stampIfFull(state) };
}

export interface WishResult extends FulfillResult { bonus: ClaimResult['bonus'] }

/** Answers a wish letter with a spare. ok=false: it does not fit (nothing is taken, the letter stays).
 *  null: not an open wish on today's board, or the item can't be handed over. */
export function fulfillWish(state: GameState, index: number, itemId: string): WishResult | null {
  const task = state.board.tasks[index];
  if (!task || task.kind !== 'wish' || task.claimed || !task.clues) return null;
  const res = handOver(state, task.by, task.clues, itemId);
  if (!res) return null;
  if (!res.ok) return { ...res, bonus: null };
  task.got = task.need; task.claimed = true;
  return { ...res, bonus: stampIfFull(state) };
}
