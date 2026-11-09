// Wishes: from Lv2, two of today's letters are neighbors asking for something in riddle form ("it jingles, under 3 oz").
// The player hands over a spare copy of any item that fits every clue. Wrong picks cost nothing.
// The letters themselves live on the board (src/core/board.ts); this file has the riddle and the hand-over.
// Hearts from requests and returned parcels unlock each resident's short stories.
import { CONFIG } from './config';
import { ITEMS, SERIES, pick } from './logic';
import type { Clue, GameState, Item, Request, Resident, Rng } from './types';

export function clueFits(item: Item, c: Clue): boolean {
  switch (c.k) {
    case 'snd': return item.snd === c.v;
    case 'series': return item.series === c.v;
    case 'rarity': return item.r === c.v;
    case 'under': return item.w[1] <= c.v;
    case 'over': return item.w[0] >= c.v;
  }
}

export function requestFits(item: Item, req: Pick<Request, 'clues'>): boolean { return req.clues.every(c => clueFits(item, c)); }

/** Items of the series the player has unlocked: everything a request may be answered with. */
function unlockedItems(state: GameState): Item[] {
  return state.unlocked.flatMap(s => SERIES[s].items.map(i => ITEMS[i.id]));
}

function cluesFor(item: Item): Clue[] {
  const out: Clue[] = [{ k: 'snd', v: item.snd }, { k: 'series', v: item.series }, { k: 'rarity', v: item.r }, { k: 'under', v: Math.ceil(item.w[1]) }];
  if (Math.floor(item.w[0]) >= 1) out.push({ k: 'over', v: Math.floor(item.w[0]) });
  return out;
}

/** Two clues about a target item, chosen so that one to three unlocked items fit: a riddle, not a giveaway or a lottery. */
export function makeRequest(state: GameState, resident: string, rng: Rng): Request | null {
  const pool = unlockedItems(state);
  // Ask for something the player can hand over now when they have any spare at all.
  // Without this, a newly unlocked series could make every fitting answer an item they do not own yet.
  const sparePool = pool.filter(i => (state.owned[i.id] || 0) >= 2);
  const targets = (sparePool.length ? sparePool : pool).filter(i => i.r === 'common' || i.r === 'rare');
  if (!targets.length) return null;
  const target = pick(targets, rng);
  const opts = cluesFor(target);
  let best: Clue[] = [opts[0], opts[1]];
  for (let n = 0; n < 30; n++) {
    const a = pick(opts, rng), b = pick(opts, rng);
    if (a.k === b.k || (a.k === 'under' && b.k === 'over') || (a.k === 'over' && b.k === 'under')) continue;
    const fit = pool.filter(i => clueFits(i, a) && clueFits(i, b)).length;
    if (fit >= 1 && fit <= 3) { best = [a, b]; break; }
  }
  return { resident, clues: best, done: false };
}

/** Spare copies the player can hand over: items owned twice or more, so the album never loses an entry. */
export function spares(state: GameState): Item[] {
  return unlockedItems(state).filter(i => (state.owned[i.id] || 0) >= 2);
}

export interface FulfillResult { ok: boolean; resident: Resident; coins: number; shards: number; hearts: number; newTale: number | null }

/** Hands one spare to a neighbor for a riddle. ok=false means it does not fit (nothing is taken).
 *  null means the move is not allowed. Pays coins, shards, a heart and reputation on a fit. */
export function handOver(state: GameState, residentId: string, clues: Clue[], itemId: string): FulfillResult | null {
  const item = ITEMS[itemId];
  const resident = CONFIG.residents.find(r => r.id === residentId);
  if (!resident || !item || (state.owned[itemId] || 0) < 2 || !state.unlocked.includes(item.series)) return null;
  if (!requestFits(item, { clues })) return { ok: false, resident, coins: 0, shards: 0, hearts: state.hearts[resident.id] || 0, newTale: null };
  const before = talesUnlocked(state, resident.id);
  state.owned[itemId] -= 1;
  const shards = CONFIG.recycle[item.r] + CONFIG.requestBonusShards;
  state.coins += CONFIG.requestCoins;
  state.shards += shards;
  state.hearts[resident.id] = (state.hearts[resident.id] || 0) + 1;
  state.town.rep += CONFIG.rep.request;
  const after = talesUnlocked(state, resident.id);
  return { ok: true, resident, coins: CONFIG.requestCoins, shards, hearts: state.hearts[resident.id], newTale: after > before ? after - 1 : null };
}

/** How many of a resident's three stories the player has unlocked. */
export function talesUnlocked(state: GameState, residentId: string): number {
  const h = state.hearts[residentId] || 0;
  return CONFIG.taleHearts.filter(n => h >= n).length;
}
