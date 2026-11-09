// The check-in card: one stamp a day, available at any level. A missed day never resets progress.
// Five stamps pay a big delivery, then the card starts again at zero. Pure rules, no DOM.
import { CONFIG } from './config';
import { localDay, makeParcel } from './logic';
import type { CheckinSave, GameState, Rng } from './types';

export interface BigDelivery { coins: number; parcels: number; shards: number }
export interface CheckinResult { coins: number; big: BigDelivery | null; stamps: number; cards: number }

/** Today's check-in is open: never checked in, or the last one was on an earlier date.
 *  A clock moved back in time is refused until the date is later than `last`. */
export function canCheckIn(state: GameState, now: number): boolean {
  const today = localDay(new Date(now));
  return state.checkin.last === null || today > state.checkin.last;
}

/** Takes today's stamp. Returns null when today is already stamped (or the clock went back). */
export function checkIn(state: GameState, now: number, rng: Rng): CheckinResult | null {
  if (!canCheckIn(state, now)) return null;
  const c: CheckinSave = state.checkin;
  c.last = localDay(new Date(now));
  c.stamps += 1;
  let coins = CONFIG.checkin.coins;
  state.coins += coins;
  let big: BigDelivery | null = null;
  if (c.stamps >= CONFIG.checkin.card) {
    state.coins += CONFIG.checkin.coins;
    coins += CONFIG.checkin.coins;
    state.shards += CONFIG.checkin.bigShards;
    for (let i = 0; i < CONFIG.checkin.bigParcels; i++) state.parcels.push(makeParcel(state, 'normal', rng));
    c.cards += 1;
    c.stamps = 0;
    big = { coins: CONFIG.checkin.coins, parcels: CONFIG.checkin.bigParcels, shards: CONFIG.checkin.bigShards };
  }
  return { coins, big, stamps: c.stamps, cards: c.cards };
}
