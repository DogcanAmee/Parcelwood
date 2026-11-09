// Decoration shop: display pieces at fixed spots on the station front. Coins only.
// Buying never touches the album, and finding an album item only makes its display model cheaper.
import { CONFIG } from './config';
import { townLevel } from './logic';
import type { DecorDef, GameState } from './types';

export const DECOR: readonly DecorDef[] = CONFIG.decor.items;

export function decorById(id: string): DecorDef | undefined {
  return DECOR.find(d => d.id === id);
}

/** True once the town level opens this decoration. */
export function decorOpen(state: GameState, id: string): boolean {
  const d = decorById(id);
  return !!d && townLevel(state) >= d.lv;
}

/** Coins to pay right now: 20% less when the player already found the album item the piece copies. null for an
 *  unknown id. A piece with its own picture has no album item, so it always costs full price. */
export function decorPrice(state: GameState, id: string): number | null {
  const d = decorById(id);
  if (!d) return null;
  const found = !!d.item && (state.owned[d.item] || 0) > 0;
  return found ? Math.round(d.price * (1 - CONFIG.decor.foundOff)) : d.price;
}

export function decorOwned(state: GameState, id: string): boolean {
  return state.decor.owned.includes(id);
}

/** Buys one decoration. Nothing changes when it is unknown, locked, already owned, or coins are short. */
export function buyDecor(state: GameState, id: string): boolean {
  const price = decorPrice(state, id);
  if (price === null || !decorOpen(state, id) || decorOwned(state, id) || state.coins < price) return false;
  state.coins -= price;
  state.decor.owned = state.decor.owned.concat(id);
  return true;
}

/** Puts an owned decoration away or brings it back. Returns false for an id that is not owned. */
export function toggleDecor(state: GameState, id: string): boolean {
  if (!decorOwned(state, id)) return false;
  state.decor.hidden = state.decor.hidden.includes(id)
    ? state.decor.hidden.filter(x => x !== id)
    : state.decor.hidden.concat(id);
  return true;
}

/** The decorations drawn on the station front right now. */
export function shownDecor(state: GameState): DecorDef[] {
  return DECOR.filter(d => state.decor.owned.includes(d.id) && !state.decor.hidden.includes(d.id));
}
