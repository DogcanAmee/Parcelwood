// Town levels: reputation from almost everything the player does raises the town from Lv1 to Lv8.
// Each level brings a new neighbor, a new kind of parcel or a new part of the day:
//   Lv1 Mrs. Okafor and Theo · Lv2 requests, Mr. Dube, Rush Hour (all builds) · Lv3 urgent parcels, daily events · Lv4 Lena · Lv5 City Souvenirs, unnamed parcels, the twins.
//   Lv6 Greenhouse Row and Rosa · Lv7 Market Row and Inés · Lv8 Lost Letter Office.
// Also here: the daily town event, gifts to neighbors and the small perks their friendship brings.
import { CONFIG } from './config';
import { dailyGuess, hash } from './daily';
import type { DailyStatus } from './daily';
import { ITEMS, binCount, deliver, localDay, makeParcel, openParcel, openResidents, returnParcel, townLevel } from './logic';
import type { OpenResult } from './logic';
import { applyStreak } from './streak';
import type { StreakResult } from './streak';
import { talesUnlocked } from './requests';
import type { GameState, Parcel, Resident, Rng, TownEvent, TownFeature } from './types';

export const MAX_LEVEL = CONFIG.townLevels.length;
export const TOWN_EVENTS: readonly TownEvent[] = ['rain', 'powercut', 'moving'];
export const PERK_RESIDENTS: readonly string[] = ['theo', 'dube', 'lena'];
const GIFT_MEMORY = 60;
const URGENT_MAX = 2;
const RAIN_CLEAR_CHANCE = 0.3;

export function hasFeature(state: GameState, f: TownFeature): boolean { return townLevel(state) >= CONFIG.townFeatures[f]; }

export interface LevelProgress { level: number; rep: number; from: number; to: number | null }
export function levelProgress(state: GameState): LevelProgress {
  const level = townLevel(state);
  return { level, rep: state.town.rep, from: CONFIG.townLevels[level - 1], to: level < MAX_LEVEL ? CONFIG.townLevels[level] : null };
}

export interface LevelUnlocks { level: number; residents: string[]; features: TownFeature[]; series: string[]; decor: string[] }
/** What opens when the town reaches a level. */
export function unlocksAt(level: number): LevelUnlocks {
  return {
    level,
    residents: CONFIG.residents.filter(r => r.lv === level).map(r => r.id),
    features: (Object.keys(CONFIG.townFeatures) as TownFeature[]).filter(f => CONFIG.townFeatures[f] === level),
    series: Object.keys(CONFIG.seriesLevels).filter(s => CONFIG.seriesLevels[s] === level),
    decor: CONFIG.decor.items.filter(d => d.lv === level).map(d => d.id),
  };
}

/** Opens every series the town level allows. Returns the series that just opened. */
export function syncUnlocks(state: GameState): string[] {
  const lv = townLevel(state), added: string[] = [];
  CONFIG.series.forEach(s => {
    const need = CONFIG.seriesLevels[s.id];
    if (need !== undefined && need <= lv && !state.unlocked.includes(s.id)) { state.unlocked.push(s.id); added.push(s.id); }
  });
  return added;
}

/** Levels reached since the last call, lowest first (empty when nothing changed). Opens their series. */
export function claimLevelUp(state: GameState): number[] {
  const lv = townLevel(state), out: number[] = [];
  for (let l = state.town.level + 1; l <= lv; l++) out.push(l);
  if (lv > state.town.level) state.town.level = lv;
  syncUnlocks(state);
  return out;
}

/** Reputation for a save from before town levels, from what the player already did. */
export function bootstrapRep(s: Pick<GameState, 'stats' | 'hearts' | 'completed'> & { daily?: { played: string[] }; rush?: { played: string[] } }): number {
  const R = CONFIG.rep, st = s.stats;
  const hearts = Object.values(s.hearts).reduce((a, n) => a + n, 0);
  return st.opened * R.open + (st.seriesRight + st.rarityRight) * R.guess + st.returned * R.ret + hearts * 3 +
    s.completed.length * R.complete + (s.daily ? s.daily.played.length : 0) * R.daily + (s.rush ? s.rush.played.length : 0) * R.rush;
}

/** The town event for a calendar day: the same for every player, worked out from the date alone. */
export function dailyEvent(day: string): TownEvent { return TOWN_EVENTS[hash('parcelwood-event:' + day) % TOWN_EVENTS.length]; }
/** Today's event, or null before events open at Lv3. */
export function eventToday(state: GameState, now: number): TownEvent | null {
  return hasFeature(state, 'events') ? dailyEvent(localDay(new Date(now))) : null;
}

export function perkOn(state: GameState, residentId: string): boolean {
  return PERK_RESIDENTS.includes(residentId) && openResidents(state).some(r => r.id === residentId) && (state.hearts[residentId] || 0) >= CONFIG.perkHearts;
}

export interface TownDelivery { normal: number; mystery: number; urgent: number; extra: number; coins: number }

/** The day's deliveries with the town layered on top: rain smudges postmarks, unnamed parcels from Lv5,
 *  an urgent parcel with the morning truck from Lv3, an extra misdelivered parcel on moving day, Theo's roll money. */
export function townDeliver(state: GameState, now: number, rng: Rng): TownDelivery {
  const morning = !state.deliveryDays.includes(localDay(new Date(now)));
  const before = new Set(state.parcels.map(p => p.id));
  const got = deliver(state, now, rng);
  const ev = eventToday(state, now);
  const out: TownDelivery = { normal: got.normal, mystery: got.mystery, urgent: 0, extra: 0, coins: 0 };
  const maybeAnon = (p: Parcel) => {
    if (hasFeature(state, 'anon') && rng() < (ev === 'powercut' ? CONFIG.anonChancePowercut : CONFIG.anonChance)) { p.anon = true; p.misses = 0; }
  };
  state.parcels.filter(p => !before.has(p.id)).forEach(p => {
    if (p.kind === 'normal' && morning && ev === 'rain') p.postmarkClear = rng() < RAIN_CLEAR_CHANCE;
    if (p.kind === 'mystery') maybeAnon(p);
  });
  if (!morning) return out;
  if (hasFeature(state, 'urgent') && state.parcels.filter(p => p.urgent).length < URGENT_MAX) {
    const u = makeParcel(state, 'mystery', rng);
    u.urgent = now + CONFIG.urgentMs; u.postmarkClear = true;
    state.parcels.unshift(u); out.urgent = 1;
  }
  if (ev === 'moving' && binCount(state) < CONFIG.mysteryMax) {
    const m = makeParcel(state, 'mystery', rng); maybeAnon(m);
    state.parcels.push(m); out.extra = 1;
  }
  if (perkOn(state, 'theo')) { state.coins += CONFIG.theoCoins; out.coins = CONFIG.theoCoins; }
  return out;
}

export interface TownOpen extends OpenResult { bonus: number; event: TownEvent | null; streak: StreakResult }
/** Opens a parcel. Rain pays double for a right series guess, a power cut double for a right rarity guess.
 *  A right series guess grows the guess streak and pays its coin bonus. */
export function townOpen(state: GameState, parcelId: number, rng: Rng, now: number): TownOpen | null {
  const p = state.parcels.find(x => x.id === parcelId);
  if (!p || p.urgent) return null;
  const res = openParcel(state, parcelId, rng);
  if (!res) return null;
  const event = eventToday(state, now);
  let bonus = 0;
  if (event === 'rain' && res.seriesRight) bonus += CONFIG.guessReward.series;
  if (event === 'powercut' && res.rarityRight) bonus += CONFIG.guessReward.rarity;
  state.shards += bonus;
  const streak = applyStreak(state, res.seriesRight);
  return { ...res, shards: res.shards + bonus, bonus, event, streak };
}

export interface DeliverResult { ok: boolean; resident: Resident; coins: number; hearts: number; rep: number; onTime: boolean | null; firstTry: boolean | null; newTale: number | null }

/** Hands a misdelivered, urgent or unnamed parcel to a resident. ok=false: wrong guess on an unnamed parcel
 *  (nothing is lost, the parcel stays). null: the move is not allowed. */
export function deliverTo(state: GameState, parcelId: number, residentId: string, now: number): DeliverResult | null {
  const p = state.parcels.find(x => x.id === parcelId);
  if (!p || p.kind !== 'mystery' || !p.resident) return null;
  const target = CONFIG.residents.find(r => r.id === residentId);
  if (!target) return null;
  if (p.anon) {
    if (!openResidents(state).some(r => r.id === residentId)) return null;
    if (residentId !== p.resident) {
      p.misses = (p.misses || 0) + 1;
      return { ok: false, resident: target, coins: 0, hearts: state.hearts[residentId] || 0, rep: 0, onTime: null, firstTry: false, newTale: null };
    }
  } else if (residentId !== p.resident) return null;
  const talesBefore = talesUnlocked(state, residentId);
  const base = returnParcel(state, parcelId);
  if (!base) return null;
  let coins = base.coins, rep = CONFIG.rep.ret;
  const onTime = p.urgent ? now <= p.urgent : null;
  if (onTime) { coins += CONFIG.urgentBonus; state.hearts[residentId] += 1; rep = CONFIG.rep.urgent; }
  const firstTry = p.anon ? !p.misses : null;
  if (p.anon) { rep = firstTry ? CONFIG.rep.anon : CONFIG.rep.anonMiss; if (firstTry) coins += CONFIG.anonBonus; }
  if (eventToday(state, now) === 'moving') coins += CONFIG.movingBonus;
  state.coins += coins - base.coins;
  state.town.rep += rep;
  const talesNow = talesUnlocked(state, residentId);
  return { ok: true, resident: target, coins, hearts: state.hearts[residentId], rep, onTime, firstTry, newTale: talesNow > talesBefore ? talesNow - 1 : null };
}

/** Solves the daily puzzle with town reputation on top. */
export function townDailyGuess(state: GameState, now: number, itemId: string): DailyStatus | null {
  const r = dailyGuess(state, now, itemId);
  if (r && r.finished) state.town.rep += r.won ? CONFIG.rep.daily : CONFIG.rep.dailyLost;
  return r;
}

export function giftedToday(state: GameState, residentId: string, now: number): boolean {
  return state.town.gifts.includes(localDay(new Date(now)) + '|' + residentId);
}

export interface GiftResult { resident: Resident; fav: boolean; hearts: number; rep: number; newTale: number | null }
/** Gives one spare copy to a neighbor, once per neighbor per day. Their favourite kind counts double and becomes known. */
export function giveGift(state: GameState, residentId: string, itemId: string, now: number): GiftResult | null {
  const r = openResidents(state).find(x => x.id === residentId), it = ITEMS[itemId];
  if (!r || !it || (state.owned[itemId] || 0) < 2 || !state.unlocked.includes(it.series) || giftedToday(state, residentId, now)) return null;
  const before = talesUnlocked(state, residentId);
  const fav = it.snd === r.like;
  state.owned[itemId] -= 1;
  state.hearts[residentId] = (state.hearts[residentId] || 0) + (fav ? 2 : 1);
  const rep = fav ? CONFIG.rep.giftFav : CONFIG.rep.gift;
  state.town.rep += rep;
  state.town.gifts = state.town.gifts.concat(localDay(new Date(now)) + '|' + residentId).slice(-GIFT_MEMORY);
  if (fav && !state.town.known.includes(residentId)) state.town.known = state.town.known.concat(residentId);
  const after = talesUnlocked(state, residentId);
  return { resident: r, fav, hearts: state.hearts[residentId], rep, newTale: after > before ? after - 1 : null };
}

/** X-ray price right now: null during a power cut, 0 for Mr. Dube's free X-ray once a day. */
export function xrayPrice(state: GameState, now: number): number | null {
  if (eventToday(state, now) === 'powercut') return null;
  return perkOn(state, 'dube') && state.town.xrayDay !== localDay(new Date(now)) ? 0 : CONFIG.xrayCost;
}
export function payXray(state: GameState, now: number): boolean {
  const price = xrayPrice(state, now);
  if (price === null || state.coins < price) return false;
  state.coins -= price;
  if (price === 0) state.town.xrayDay = localDay(new Date(now));
  return true;
}
