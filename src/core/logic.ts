// Game rules. Ported from the prototype's LOGIC block without changing behaviour.
// Pure functions over GameState: no DOM, no storage, no clock except the `now` passed in.
import { CONFIG } from './config';
import type { GameState, Item, Parcel, ParcelKind, Rarity, RarityTable, Resident, Rng, SeriesDef } from './types';

export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'secret'];
export const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, secret: 3 };
export const SERIES: Record<string, SeriesDef> = Object.fromEntries(CONFIG.series.map(s => [s.id, s]));
export const ITEMS: Record<string, Item> = {};
CONFIG.series.forEach(s => s.items.forEach(it => { ITEMS[it.id] = Object.assign({ series: s.id }, it); }));

export function newState(now: number): GameState {
  const secret: Record<string, number> = {};
  CONFIG.series.forEach(s => { secret[s.id] = 0; });
  return {
    v: 1, coins: 50, shards: 0, gems: 0, day: null, nextId: 1, lastMystery: now,
    parcels: [], pity: { sinceRare: 0, sinceEpic: 0, secret },
    owned: {}, future: { owned: {}, unlocked: [], completed: [], decor: [] }, unlocked: CONFIG.startUnlocked.slice(), completed: [],
    stats: { opened: 0, guessed: 0, seriesRight: 0, rarityRight: 0, returned: 0 },
    hearts: {}, demoLuck: false, shopTaps: {}, muted: false, introSeen: false, guideSeen: false,
    hintsSeen: [], firstGoals: { started: false, done: [], off: false },
    deliveryDays: [],
    daily: { day: null, guesses: [], played: [] },
    rush: { day: null, result: null, played: [], owned: [], practice: { day: null, paid: 0 } },
    town: { rep: 0, level: 1, gifts: [], known: [], xrayDay: null, street: 0 },
    board: { day: null, tasks: [], made: [], bonus: false, stamps: 0 },
    quests: { day: null, list: [], bonus: false },
    checkin: { last: null, stamps: 0, cards: 0 },
    streak: { n: 0, best: 0 },
    decor: { owned: [], hidden: [] },
    week: { run: null, rewarded: [], best: 0, wins: 0, played: 0, marks: 0, levels: { hands: 0, shelves: 0, eye: 0 }, event: { week: null, claimed: 0, best: 0, bestSold: 0, plays: 0, seen: 0 } },
    metrics: { first: null, days: [] },
    story: { week: null, id: null, pages: 0, read: 0, finished: false, keep: [] },
    social: { carryDay: null, carryReady: false, sent: 0, got: 0, guildWeek: null, guildPaid: 0 },
  };
}

/** Town level (1..5) for an amount of reputation. */
export function levelFor(rep: number): number {
  let lv = 1;
  CONFIG.townLevels.forEach((need, i) => { if (rep >= need) lv = i + 1; });
  return lv;
}
export function townLevel(state: GameState): number { return levelFor(state.town.rep); }
/** Residents who have moved in at the current town level. */
export function openResidents(state: GameState): Resident[] {
  const lv = townLevel(state);
  return CONFIG.residents.filter(r => r.lv <= lv);
}
/** Time between misdelivered parcels: shorter once Lena (3 hearts) helps with the cart. */
export function mysteryEvery(state: GameState): number {
  const lena = CONFIG.residents.find(r => r.id === 'lena');
  return lena && lena.lv <= townLevel(state) && (state.hearts.lena || 0) >= CONFIG.perkHearts ? CONFIG.lenaMysteryMs : CONFIG.mysteryEveryMs;
}
/** Misdelivered parcels waiting in the lost-parcel bin (urgent parcels are on their own shelf and don't count). */
export function binCount(state: GameState): number { return state.parcels.filter(p => p.kind === 'mystery' && !p.urgent).length; }

export function pick<T>(arr: readonly T[], rng: Rng): T { return arr[Math.floor(rng() * arr.length)]; }

export function normalize(w: RarityTable): RarityTable {
  const t = RARITIES.reduce((a, r) => a + w[r], 0);
  const o = {} as RarityTable;
  RARITIES.forEach(r => { o[r] = t > 0 ? w[r] / t : 0; });
  return o;
}

// Chance of each rarity for the next normal parcel in a series, with pity applied.
// Rare/Epic pity is one global counter for every series; only the secret soft-pity counter is per series.
export function rarityWeights(state: GameState, seriesId: string, kind: ParcelKind): RarityTable {
  if (kind === 'mystery') return Object.assign({}, CONFIG.mysteryOdds);
  const base = state.demoLuck ? CONFIG.demoOdds : CONFIG.odds;
  const P = CONFIG.pity;
  const n = (state.pity.secret[seriesId] || 0) + 1; // index of this box in the series since last secret
  if (n >= P.secretHard) return { common: 0, rare: 0, epic: 0, secret: 1 };
  let ps = base.secret;
  if (n >= P.secretSoftStart) ps = Math.min(1, base.secret + (n - P.secretSoftStart + 1) * P.secretSoftStep);
  const nonSecret = base.common + base.rare + base.epic;
  const w: RarityTable = { common: base.common / nonSecret * (1 - ps), rare: base.rare / nonSecret * (1 - ps), epic: base.epic / nonSecret * (1 - ps), secret: ps };
  if (state.pity.sinceEpic + 1 >= P.epicEvery) { w.common = 0; w.rare = 0; }
  else if (state.pity.sinceRare + 1 >= P.rareEvery) { w.common = 0; }
  return normalize(w);
}

export function rollRarity(w: RarityTable, rng: Rng): Rarity {
  let x = rng();
  for (const r of RARITIES) { if (x < w[r]) return r; x -= w[r]; }
  // floating point fallback: highest non-zero
  for (let i = RARITIES.length - 1; i >= 0; i--) if (w[RARITIES[i]] > 0) return RARITIES[i];
  return 'common';
}

function heldOrPending(state: GameState, itemId: string): boolean {
  if ((state.owned[itemId] || 0) > 0) return true;
  return state.parcels.some(p => p.rolled && p.item === itemId);
}

function pickItem(state: GameState, seriesId: string, rarity: Rarity, rng: Rng) {
  const pool = SERIES[seriesId].items.filter(i => i.r === rarity);
  const fresh = pool.filter(i => !heldOrPending(state, i.id));
  return pick(fresh.length ? fresh : pool, rng);
}

// Decide what is inside a parcel. Called the first time the parcel is picked up, so pity counts parcels in the order you handle them.
export function rollParcel(state: GameState, parcel: Parcel, rng: Rng): Parcel {
  if (parcel.rolled) return parcel;
  const w = rarityWeights(state, parcel.series, parcel.kind);
  const rarity = rollRarity(w, rng);
  const item = pickItem(state, parcel.series, rarity, rng);
  if (parcel.kind !== 'mystery') {
    const p = state.pity;
    p.sinceRare = RANK[rarity] >= 1 ? 0 : p.sinceRare + 1;
    p.sinceEpic = RANK[rarity] >= 2 ? 0 : p.sinceEpic + 1;
    p.secret[parcel.series] = rarity === 'secret' ? 0 : (p.secret[parcel.series] || 0) + 1;
  } else if (rarity === 'secret') {
    state.pity.secret[parcel.series] = 0;
  }
  parcel.rolled = true;
  parcel.item = item.id;
  parcel.rarity = rarity;
  parcel.weight = Math.round((item.w[0] + rng() * (item.w[1] - item.w[0])) * 10) / 10;
  parcel.insured = rng() < CONFIG.insuredChance[rarity];
  return parcel;
}

export function makeParcel(state: GameState, kind: ParcelKind, rng: Rng): Parcel {
  const series = pick(state.unlocked, rng);
  const p: Parcel = { id: state.nextId++, kind, series, rolled: false, item: null, rarity: null, weight: null, insured: null,
    sticker: rng() < CONFIG.stickerChance, postmarkClear: rng() < CONFIG.postmarkClearChance,
    used: { shake: false, weigh: false, look: false, xray: false }, guess: { series: null, rarity: null } };
  if (kind === 'mystery') p.resident = pick(openResidents(state), rng).id;
  return p;
}

/** Whole days from date string a to date string b (YYYY-MM-DD), counted in UTC so clock changes don't matter. */
export function daysBetween(a: string, b: string): number {
  const u = (x: string) => { const [y, m, d] = x.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(b) - u(a)) / 86400000);
}
/** How many recent days the save remembers, so a day already played can't be played again by moving the clock. */
export const DAY_MEMORY = 60;
/** Adds a day to a remembered-days list, newest last, keeping at most DAY_MEMORY. */
export function rememberDay(list: string[], day: string): string[] {
  return list.includes(day) ? list : list.concat(day).slice(-DAY_MEMORY);
}

export function localDay(d: Date): string { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// Daily delivery (top the shelf up to 10) and misdelivered parcels (one every 2 hours, 3 max). Returns what arrived.
export function deliver(state: GameState, now: number, rng: Rng): { normal: number; mystery: number } {
  const out = { normal: 0, mystery: 0 };
  const today = localDay(new Date(now));
  if (state.day !== today) state.day = today;
  if (!state.deliveryDays.includes(today)) {
    state.deliveryDays = rememberDay(state.deliveryDays, today);
    const have = state.parcels.filter(p => p.kind === 'normal').length;
    for (let i = have; i < CONFIG.shelfSize; i++) { state.parcels.push(makeParcel(state, 'normal', rng)); out.normal++; }
  }
  const every = mysteryEvery(state);
  const steps = Math.floor((now - state.lastMystery) / every);
  if (steps > 0) {
    state.lastMystery += steps * every;
    for (let i = 0; i < steps; i++) {
      if (binCount(state) >= CONFIG.mysteryMax) break;
      state.parcels.push(makeParcel(state, 'mystery', rng)); out.mystery++;
    }
  }
  return out;
}

export function seriesProgress(state: GameState, seriesId: string): { have: number; total: number } {
  const items = SERIES[seriesId].items;
  const have = items.filter(i => (state.owned[i.id] || 0) > 0).length;
  return { have, total: items.length };
}

export interface CompleteResult { seriesId: string }

/** Marks a finished series and pays for it. New series open with the town level, not here. */
export function checkComplete(state: GameState, seriesId: string): CompleteResult | null {
  const pr = seriesProgress(state, seriesId);
  if (pr.have < pr.total || state.completed.includes(seriesId)) return null;
  state.completed.push(seriesId);
  state.coins += CONFIG.completeReward;
  state.town.rep += CONFIG.rep.complete;
  return { seriesId };
}

export interface OpenResult {
  parcel: Parcel;
  item: Item;
  rarity: Rarity;
  isNew: boolean;
  count: number;
  coins: number;
  shards: number;
  seriesRight: boolean | null;
  rarityRight: boolean | null;
  complete?: CompleteResult | null;
  rep: number;
}

// Open a parcel: score the guess, add the item, pay coins. Returns a summary for the reveal screen.
export function openParcel(state: GameState, parcelId: number, rng: Rng): OpenResult | null {
  const p = state.parcels.find(x => x.id === parcelId);
  if (!p) return null;
  rollParcel(state, p, rng);
  const item = ITEMS[p.item as string];
  const rarity = p.rarity as Rarity;
  const before = state.owned[item.id] || 0;
  state.owned[item.id] = before + 1;
  const res: OpenResult = { parcel: p, item, rarity, isNew: before === 0, count: before + 1, coins: CONFIG.coinsPerOpen[rarity], shards: 0, seriesRight: null, rarityRight: null, rep: CONFIG.rep.open };
  if (p.guess.series || p.guess.rarity) state.stats.guessed++;
  if (p.guess.series) { res.seriesRight = p.guess.series === p.series; if (res.seriesRight) { res.shards += CONFIG.guessReward.series; state.stats.seriesRight++; } }
  if (p.guess.rarity) { res.rarityRight = p.guess.rarity === rarity; if (res.rarityRight) { res.shards += CONFIG.guessReward.rarity; state.stats.rarityRight++; } }
  if (res.seriesRight) res.rep += CONFIG.rep.guess;
  if (res.rarityRight) res.rep += CONFIG.rep.guess;
  state.coins += res.coins;
  state.shards += res.shards;
  state.town.rep += res.rep;
  state.stats.opened++;
  state.parcels = state.parcels.filter(x => x.id !== parcelId);
  res.complete = checkComplete(state, item.series);
  return res;
}

export function returnParcel(state: GameState, parcelId: number): { resident: Resident | undefined; coins: number; hearts: number } | null {
  const p = state.parcels.find(x => x.id === parcelId);
  if (!p || p.kind !== 'mystery' || !p.resident) return null;
  const residentId = p.resident;
  state.parcels = state.parcels.filter(x => x.id !== parcelId);
  state.coins += CONFIG.returnReward;
  state.hearts[residentId] = (state.hearts[residentId] || 0) + 1;
  state.stats.returned++;
  return { resident: CONFIG.residents.find(r => r.id === residentId), coins: CONFIG.returnReward, hearts: state.hearts[residentId] };
}

export function recycleExtras(state: GameState, seriesId: string): number {
  let got = 0;
  SERIES[seriesId].items.forEach(i => { const c = state.owned[i.id] || 0; if (c > 1) { got += (c - 1) * CONFIG.recycle[i.r]; state.owned[i.id] = 1; } });
  state.shards += got;
  return got;
}

export function extrasValue(state: GameState, seriesId: string): number {
  return SERIES[seriesId].items.reduce((a, i) => a + Math.max(0, (state.owned[i.id] || 0) - 1) * CONFIG.recycle[i.r], 0);
}

export function exchangeItem(state: GameState, itemId: string): { complete: CompleteResult | null } | null {
  const it = ITEMS[itemId];
  const cost = CONFIG.exchange[it.r];
  if (cost == null || (state.owned[itemId] || 0) > 0 || state.shards < cost) return null;
  state.shards -= cost;
  state.owned[itemId] = 1;
  return { complete: checkComplete(state, it.series) };
}
