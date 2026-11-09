// What to do with this device's save when it meets the account's cloud save. Pure, so it can be tested.
//
// The cloud save carries a version number that goes up by one on every upload. The device remembers which
// version it last synced with and whether the player has made progress since (dirty).
import type { GameState } from './types';

/** owner: account the device save belongs to (null = from before accounts). ownerGuest: that account was a guest. */
export interface LocalSave { state: GameState; owner: string | null; ownerGuest: boolean; version: number; dirty: boolean }
export interface CloudSave { state: GameState; version: number }
export interface SaveSummary { items: number; opened: number; gems: number }

export type MergePlan =
  | { action: 'none' }
  | { action: 'push-local' }  // this device's save becomes the account's save
  | { action: 'take-cloud' }  // replace this device's save with the account's save
  | { action: 'fresh' }       // the device save belongs to another full account: start a new game for this one
  // Two saves with real progress: the player picks one. sameAccount decides whether gems carry over.
  | { action: 'ask'; sameAccount: boolean; local: SaveSummary; cloud: SaveSummary };

export function summary(s: GameState): SaveSummary {
  return { items: Object.values(s.owned).filter(n => n > 0).length, opened: s.stats.opened, gems: s.gems };
}

function hasProgress(s: GameState): boolean {
  return s.stats.opened > 0 || s.gems > 0 || s.stats.returned > 0 || Object.values(s.hearts).some(n => n > 0);
}

export function planMerge(local: LocalSave, cloud: CloudSave | null, userId: string): MergePlan {
  if (!cloud && (local.owner === userId || local.owner === null || local.ownerGuest)) return { action: 'push-local' };
  if (!cloud) return { action: 'fresh' };
  const ask = (sameAccount: boolean): MergePlan => ({ action: 'ask', sameAccount, local: summary(local.state), cloud: summary(cloud.state) });
  if (local.owner === userId) {
    if (cloud.version === local.version) return local.dirty ? { action: 'push-local' } : { action: 'none' };
    if (cloud.version < local.version) return { action: 'push-local' }; // cloud row was reset; the device copy is newer
    // Another device uploaded since this one last synced.
    return local.dirty ? ask(true) : { action: 'take-cloud' };
  }
  // The device save belongs to another full account (signed out elsewhere, session expired, account deleted
  // on another device). It is not this player's to carry over: never upload it or add its gems here.
  if (local.owner !== null && !local.ownerGuest) return cloud ? { action: 'take-cloud' } : { action: 'fresh' };
  // The device save belongs to a guest account (or no account) that the player is leaving.
  if (!hasProgress(local.state)) return { action: 'take-cloud' };
  if (!hasProgress(cloud.state)) return { action: 'push-local' };
  return ask(false);
}

/**
 * Keep one save and drop the other. Gems are not added together here: the server wallet owns them (0003),
 * and a guest's balance follows the player through a one-time ticket (0004), so the kept save's gem count
 * is replaced by the server balance on the next upload.
 */
export function keepOne(keep: GameState, _drop: GameState): GameState {
  return JSON.parse(JSON.stringify(keep)) as GameState;
}
