// Discord social (docs/design-v2.md §5 and step 3). Pure rules; the server side is supabase/migrations/0005_social.sql
// and the client wiring is src/discord/social.ts.
//
// Carry parcels: finishing all three of today's letters earns one parcel to carry to a friend (at most one a day,
// never stacked). The friend who opens the shared link gets a parcel on the shelf and shards; the sender gets
// shards once the server says the friend opened it.
//
// Server board: everyone in the same Discord server adds finished letters to one weekly total. Each goal the
// server reaches pays shards once to every player who added at least one letter that week.
import { CONFIG } from './config';
import { localDay, makeParcel } from './logic';
import { weekOf } from './story';
import type { GameState, Rng, SocialSave } from './types';

export const emptySocial = (): SocialSave => ({ carryDay: null, carryReady: false, sent: 0, got: 0, guildWeek: null, guildPaid: 0 });

/** Call when today's three letters are all done. Returns true when a new carry parcel is waiting. */
export function earnCarry(state: GameState, now: number): boolean {
  const today = localDay(new Date(now));
  const s = state.social;
  if (s.carryDay === today || s.carryReady) return false;
  s.carryDay = today; s.carryReady = true;
  return true;
}

/** The friend's link was shared: the parcel has left the station. */
export function carrySent(state: GameState): void {
  if (!state.social.carryReady) return;
  state.social.carryReady = false; state.social.sent += 1;
}

/** A friend's carried parcel arrived: one parcel on the shelf plus shards. */
export function carryReceived(state: GameState, rng: Rng): { shards: number } {
  state.parcels.push(makeParcel(state, 'normal', rng));
  state.shards += CONFIG.social.carryShards;
  state.social.got += 1;
  return { shards: CONFIG.social.carryShards };
}

/** n friends opened parcels this player carried. Returns the shards paid. */
export function carryThanks(state: GameState, n: number): number {
  const k = Math.max(0, Math.min(10, Math.floor(n)));
  const shards = k * CONFIG.social.carryShards;
  state.shards += shards;
  return shards;
}

/** Goals reached by a server's weekly total. */
export function guildTier(total: number): number { return CONFIG.social.guildGoals.filter(g => total >= g).length; }

/** The next goal for this total, or null when every goal is reached. */
export function guildNext(total: number): number | null { return CONFIG.social.guildGoals.find(g => total < g) ?? null; }

/** Pays goals the server reached that this player has not been paid for this week. Only players who helped. */
export function guildClaim(state: GameState, now: number, total: number, mine: number): { tiers: number; shards: number } {
  const week = weekOf(now), s = state.social;
  if (s.guildWeek !== week) { s.guildWeek = week; s.guildPaid = 0; }
  if (mine < 1) return { tiers: 0, shards: 0 };
  const reached = guildTier(total), tiers = Math.max(0, reached - s.guildPaid);
  s.guildPaid = Math.max(s.guildPaid, reached);
  const shards = tiers * CONFIG.social.guildShards;
  state.shards += shards;
  return { tiers, shards };
}

/** Carry-parcel link payload (Discord shareLink custom_id) and its parser. */
export const carryCode = (token: string) => 'carry:' + token;
export function parseCarry(code: string | null | undefined): string | null {
  const m = /^carry:([0-9a-f]{32})$/.exec(code || '');
  return m ? m[1] : null;
}
