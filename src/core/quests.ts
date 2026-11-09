// Daily tasks: three fixed goals, the same for every player every day. Pure rules, no DOM.
// The same game events feed the town board and this list. A finished task is claimed by hand; a finished
// task left unclaimed is paid automatically when the next day's list goes up, so nothing is ever lost.
import { CONFIG } from './config';
import { localDay, makeParcel } from './logic';
import { hasFeature } from './town';
import type { BoardEvent } from './board';
import type { GameState, QuestKind, QuestTask, Rng } from './types';

export interface QuestPayout { coins: number; rep: number; shards: number; lost: number; tasks: number; bonus: boolean }
export interface QuestClaim { coins: number; rep: number; bonus: { shards: number; lost: number } | null }

export const QUEST_ICON: Record<QuestKind, string> = { guess: '🎯', return: '💌', rush: '📦', daily: '🧩' };

const needs = (kind: QuestKind): number => kind === 'guess' ? CONFIG.quests.guessNeed : 1;

/** The third task follows the town: the daily parcel at Lv1, a Rush Hour shift from Lv2. */
function thirdKind(state: GameState): QuestKind { return hasFeature(state, 'rush') ? 'rush' : 'daily'; }

function makeList(state: GameState): QuestTask[] {
  return [('guess' as QuestKind), ('return' as QuestKind), thirdKind(state)].map(kind => ({ kind, need: needs(kind), got: 0, claimed: false }));
}

export const questDone = (task: QuestTask) => task.got >= task.need;
export const questClaimable = (state: GameState) => state.quests.list.some(x => questDone(x) && !x.claimed);

function payLeftovers(state: GameState, rng: Rng): QuestPayout {
  const out: QuestPayout = { coins: 0, rep: 0, shards: 0, lost: 0, tasks: 0, bonus: false };
  const list = state.quests.list;
  list.forEach(task => {
    if (questDone(task) && !task.claimed) {
      task.claimed = true; out.tasks += 1;
      out.coins += CONFIG.quests.coins; out.rep += CONFIG.quests.rep;
    }
  });
  if (list.length && list.every(x => x.claimed) && !state.quests.bonus) {
    state.quests.bonus = true;
    out.shards += CONFIG.quests.bonusShards; out.bonus = true;
    for (let i = 0; i < CONFIG.quests.bonusLost; i++) { state.parcels.push(makeParcel(state, 'mystery', rng)); out.lost += 1; }
  }
  state.coins += out.coins; state.shards += out.shards; state.town.rep += out.rep;
  return out;
}

/** Makes today's list on the first call of a new day, paying whatever the old list still owed.
 *  A clock moved back to an earlier date does nothing, so the list cannot be farmed. */
export function refreshQuests(state: GameState, now: number, rng: Rng): QuestPayout | null {
  const today = localDay(new Date(now));
  if (state.quests.day === today) return null;
  if (state.quests.day && state.quests.day > today) return null;
  const hadDay = state.quests.day !== null;
  const paid = hadDay ? payLeftovers(state, rng) : null;
  state.quests = { day: today, list: makeList(state), bonus: false };
  return paid;
}

/** From Lv2, swap an untouched daily-parcel task for the Rush Hour one, so the new mode shows up at once. */
export function upgradeQuests(state: GameState, now: number): number {
  if (state.quests.day !== localDay(new Date(now)) || state.quests.bonus || !hasFeature(state, 'rush')) return 0;
  const i = state.quests.list.findIndex(x => x.kind === 'daily' && x.got === 0 && !x.claimed);
  if (i < 0) return 0;
  state.quests.list[i] = { kind: 'rush', need: needs('rush'), got: 0, claimed: false };
  return 1;
}

/** Counts something the player did. Returns the tasks that just got finished. */
export function questNote(state: GameState, ev: BoardEvent, now: number): QuestTask[] {
  if (state.quests.day !== localDay(new Date(now))) return [];
  const finished: QuestTask[] = [];
  state.quests.list.forEach(task => {
    if (questDone(task)) return;
    let add = 0;
    if (ev.k === 'open') { if (task.kind === 'guess') add = ev.right; }
    else if (task.kind === ev.k) add = 1;
    if (!add) return;
    task.got = Math.min(task.need, task.got + add);
    if (questDone(task)) finished.push(task);
  });
  return finished;
}

/** Claims one finished task. The third claim of the day also pays the star bonus and a bonus lost parcel. */
export function claimQuest(state: GameState, i: number, now: number, rng: Rng): QuestClaim | null {
  if (state.quests.day !== localDay(new Date(now))) return null;
  const task = state.quests.list[i];
  if (!task || task.claimed || !questDone(task)) return null;
  task.claimed = true;
  state.coins += CONFIG.quests.coins;
  state.town.rep += CONFIG.quests.rep;
  let bonus: QuestClaim['bonus'] = null;
  const list = state.quests.list;
  if (!state.quests.bonus && list.length && list.every(x => x.claimed)) {
    state.quests.bonus = true;
    state.shards += CONFIG.quests.bonusShards;
    for (let n = 0; n < CONFIG.quests.bonusLost; n++) state.parcels.push(makeParcel(state, 'mystery', rng));
    bonus = { shards: CONFIG.quests.bonusShards, lost: CONFIG.quests.bonusLost };
  }
  return { coins: CONFIG.quests.coins, rep: CONFIG.quests.rep, bonus };
}
