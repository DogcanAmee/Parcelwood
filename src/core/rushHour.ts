// Rush Hour: a timed sorting shift. Pure rules, no DOM.
// Every day has one shift that is the same for every player (parcels, oversized parcel and tool offers come from the date).
// The first shift started on a day is the official one: it is recorded and pays shards once. Later shifts that day are practice.
// The oversized parcel holds that day's limited keepsake; opening it on any shift that day adds it to the collection.
import { CONFIG } from './config';
import { hash, seeded } from './daily';
import { ITEMS, SERIES, daysBetween, localDay, pick, rememberDay, rollRarity } from './logic';
import type { GameState, Rarity, Rng, RushResult, Sound } from './types';

export const RUSH_HOUR_DURATION = 90;
export const RUSH_HOUR_BOSS_AT = 42;
export const RUSH_HOUR_STRIKES = 3;
export const TOOL_MAX = 3;
export const QUEUE_CAP = 5;
export const RUSH_EASY_PARCELS = 3;
export const RUSH_DECOY_CHANCE = 0.15;
export const RUSH_REWARD = [2, 5, 8, 12];

export type TrayClue = 'sticker' | 'postmark' | 'smudge' | 'sound' | 'weight';
export type TrayToolId = 'scissors' | 'xray' | 'scale' | 'ear' | 'tea' | 'rush' | 'helper' | 'star';
export type TrayLevels = Partial<Record<TrayToolId, number>>;
export type TrayKind = 'normal' | 'boss' | 'decoy';

export const TRAY_TOOLS: readonly TrayToolId[] = ['scissors', 'xray', 'scale', 'ear', 'tea', 'rush', 'helper', 'star'];
/** Rush Hour and Station Week sort into the three original shops; later series stay in the main game. */
export const SERIES_IDS: readonly string[] = ['snacks', 'toys', 'souvenirs'];
/** Postmarks of towns with no series here. Each has a letter no series postmark has. */
export const FOREIGN_POSTMARKS: readonly string[] = ['SEA PIER', 'BUS DEPOT', 'FISH PORT', 'SKY FARM'];

export interface RushItem { id: string; e: string; name: string; note: string }
export const RUSH_ITEMS: readonly RushItem[] = [
  { id: 'night-badge', e: '🎖️', name: 'Night Shift Badge', note: 'Given to whoever is still sorting at nine.' },
  { id: 'belt-bell', e: '🔔', name: 'Belt Bell', note: 'Rings when the belt is about to overflow. Usually a bit late.' },
  { id: 'station-teapot', e: '🫖', name: 'Station Teapot', note: 'Theo refills it every night on his way to the oven.' },
  { id: 'lucky-ribbon', e: '🎀', name: 'Lucky Ribbon', note: 'Tied around the one parcel that was never late.' },
  { id: 'route-map', e: '🗺️', name: 'Night Route Map', note: "Mr. Dube's shortcuts, marked in red ink." },
  { id: 'counter-lamp', e: '🏮', name: 'Counter Lantern', note: 'Stays lit until the last parcel is opened.' },
  { id: 'post-horn', e: '📯', name: 'Post Horn', note: 'Blown once, when the oversized parcel finally clears.' },
];
export const RUSH_ITEM: Record<string, RushItem> = Object.fromEntries(RUSH_ITEMS.map(i => [i.id, i]));

export interface TrayParcel {
  id: number;
  kind: TrayKind;
  series: string;
  item: string;
  rarity: Rarity;
  postmark: string;
  smudge: string[];
  sound: Sound;
  weight: number;
  xray: number;
  clues: TrayClue[];
  layers: number;
  prize: string | null;
}

const letters = (s: string) => [...new Set(s.replace(/[^A-Z]/g, '').split(''))];

/** Series that fit every clue in `shown`. Empty means nothing here fits: a misdelivered parcel. */
export function candidates(parcel: TrayParcel, shown: readonly TrayClue[]): string[] {
  return SERIES_IDS.filter(id => {
    const s = SERIES[id];
    if (shown.includes('sticker') && (parcel.kind === 'decoy' || id !== parcel.series)) return false;
    if (shown.includes('postmark') && s.postmark !== parcel.postmark) return false;
    if (shown.includes('smudge') && !parcel.smudge.every(l => s.postmark.includes(l))) return false;
    const needSound = shown.includes('sound'), needWeight = shown.includes('weight');
    if (!needSound && !needWeight) return true;
    return s.items.some(it => (!needSound || it.snd === parcel.sound) && (!needWeight || (parcel.weight >= it.w[0] && parcel.weight <= it.w[1])));
  });
}

function pickLetters(source: string, n: number, rng: Rng): string[] {
  const pool = letters(source), out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

function baseParcel(id: number, kind: TrayKind, rng: Rng, rarity?: Rarity): TrayParcel {
  const series = pick(SERIES_IDS, rng);
  const r: Rarity = rarity || rollRarity(CONFIG.odds, rng);
  const pool = SERIES[series].items.filter(it => it.r === r);
  const item = pick(pool.length ? pool : SERIES[series].items, rng);
  return {
    id, kind, series, item: item.id, rarity: item.r, postmark: SERIES[series].postmark, smudge: [],
    sound: item.snd, weight: Math.round((item.w[0] + rng() * (item.w[1] - item.w[0])) * 10) / 10,
    xray: rng(), clues: [], layers: 0, prize: null,
  };
}

function unique(p: TrayParcel, shown: TrayClue[]): boolean {
  const c = candidates(p, shown);
  return c.length === 1 && c[0] === p.series;
}

/**
 * Rolls a parcel. Easy parcels show a clear series clue. Later ones show a smudged postmark that fits two series,
 * so the sound has to settle it; parcels whose sound can't settle it get letters only their own postmark has.
 * Decoys show letters no series postmark has.
 */
export function rollTrayParcel(rng: Rng, index: number, id = index + 1): TrayParcel {
  if (index >= RUSH_EASY_PARCELS && rng() < RUSH_DECOY_CHANCE) {
    const p = baseParcel(id, 'decoy', rng);
    p.postmark = pick(FOREIGN_POSTMARKS, rng);
    const known = new Set(SERIES_IDS.flatMap(s => letters(SERIES[s].postmark)));
    const odd = letters(p.postmark).filter(l => !known.has(l));
    const shared = letters(p.postmark).filter(l => known.has(l));
    p.smudge = [pick(odd, rng)].concat(shared.length && rng() < 0.7 ? [pick(shared, rng)] : []).sort(() => rng() - 0.5);
    p.clues = ['smudge', 'sound'];
    return p;
  }
  const p = baseParcel(id, 'normal', rng);
  if (index < RUSH_EASY_PARCELS) {
    p.clues = [rng() < 0.5 ? 'postmark' : 'sticker', 'sound'];
    return p;
  }
  for (let tries = 0; tries < 40; tries++) {
    p.smudge = pickLetters(p.postmark, rng() < 0.5 ? 1 : 2, rng);
    if (candidates(p, ['smudge']).length >= 2 && unique(p, ['smudge', 'sound'])) {
      p.clues = rng() < 0.35 ? ['smudge', 'sound', 'weight'] : ['smudge', 'sound'];
      return p;
    }
  }
  for (let tries = 0; tries < 40; tries++) {
    p.smudge = pickLetters(p.postmark, 1, rng);
    if (unique(p, ['smudge'])) { p.clues = ['smudge', 'sound']; return p; }
  }
  p.smudge = [];
  p.clues = ['postmark', 'sound'];
  return p;
}

/** The oversized parcel: a smudged postmark first, then weight and sound as layers come off. Postmark and sound settle it. Holds the day's keepsake. */
export function rollBoss(rng: Rng, id: number, prize: string): TrayParcel {
  const p = baseParcel(id, 'boss', rng, 'epic');
  p.layers = 3;
  p.prize = prize;
  for (let tries = 0; tries < 60; tries++) {
    p.smudge = pickLetters(p.postmark, tries < 30 ? 1 : 2, rng);
    if (candidates(p, ['smudge']).length >= 2 && unique(p, ['smudge', 'sound'])) break;
  }
  if (!unique(p, ['smudge', 'sound'])) p.smudge = letters(p.postmark).filter(l => SERIES_IDS.every(s => s === p.series || !SERIES[s].postmark.includes(l))).slice(0, 1);
  p.clues = ['smudge', 'weight', 'sound'];
  return p;
}

/** Clues on show. Boss parcels reveal one more per peeled layer. Tools add clues on top. */
export function visibleClues(parcel: TrayParcel, levels: TrayLevels, peeled = 0): TrayClue[] {
  const out = parcel.kind === 'boss' ? parcel.clues.slice(0, 1 + peeled) : parcel.clues.slice();
  const add = (c: TrayClue) => { if (!out.includes(c)) out.push(c); };
  if ((levels.scale || 0) > 0) add('weight');
  if ((levels.ear || 0) > 0) add('sound');
  if (parcel.xray < (levels.xray || 0) * 0.3) add(parcel.kind === 'decoy' ? 'postmark' : 'sticker');
  return out;
}

export function toolOffer(levels: TrayLevels, rng: Rng): TrayToolId[] {
  const pool = TRAY_TOOLS.filter(id => (levels[id] || 0) < TOOL_MAX);
  const out: TrayToolId[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export function applyTool(levels: TrayLevels, id: TrayToolId): TrayLevels {
  return { ...levels, [id]: Math.min(TOOL_MAX, (levels[id] || 0) + 1) };
}

/** Correct calls needed for the next tool pick, after `picks` tools already taken. */
export function toolThreshold(picks: number): number {
  return 2 + picks;
}

export function deliveryMs(elapsed: number, levels: TrayLevels): number {
  const base = Math.max(2600, 6200 - elapsed * 45);
  return base * (1 + (levels.tea || 0) * 0.15);
}

export function scoreFor(parcel: TrayParcel, correct: boolean, combo: number, levels: TrayLevels): number {
  const base = parcel.kind === 'decoy' ? CONFIG.coinsPerOpen.rare : CONFIG.coinsPerOpen[parcel.rarity];
  const multiplier = 1 + Math.max(0, combo - 1) * 0.15 + (levels.rush || 0) * 0.1 + (levels.star || 0) * 0.15;
  const value = base * multiplier * (parcel.kind === 'boss' ? 3 : 1);
  return correct ? Math.max(1, Math.round(value)) : 0;
}

export function gradeFor(win: boolean, accuracy: number, strikes: number): number {
  if (!win) return accuracy >= 0.6 ? 1 : 0;
  return 1 + (accuracy >= 0.75 ? 1 : 0) + (strikes === 0 ? 1 : 0);
}

// ---------- the daily shift ----------

export function rushNumber(day: string): number { return Math.max(1, daysBetween(CONFIG.dailyEpoch, day) + 1); }
export function rushPrize(day: string): string { return RUSH_ITEMS[(rushNumber(day) - 1) % RUSH_ITEMS.length].id; }
function shiftRng(day: string, stream: string, i: number): Rng { return seeded(hash('parcelwood-rush:' + day + ':' + stream + ':' + i)); }
export function shiftParcel(day: string, index: number): TrayParcel { return rollTrayParcel(shiftRng(day, 'parcel', index), index); }
export function shiftBoss(day: string): TrayParcel { return rollBoss(shiftRng(day, 'boss', 0), 999, rushPrize(day)); }
export function shiftOffer(day: string, pickNo: number, levels: TrayLevels): TrayToolId[] { return toolOffer(levels, shiftRng(day, 'tool', pickNo)); }

export interface RushToday { day: string; n: number; prize: string; prizeOwned: boolean; official: boolean; result: RushResult | null }

export function rushToday(state: GameState, now: number): RushToday {
  const day = localDay(new Date(now));
  const prize = rushPrize(day);
  return {
    day, n: rushNumber(day), prize, prizeOwned: state.rush.owned.includes(prize),
    official: !state.rush.played.includes(day),
    result: state.rush.day === day ? state.rush.result : null,
  };
}

/** Starts a shift. Returns true when it is the day's official shift; it then counts as played even if abandoned. */
export function rushBegin(state: GameState, day: string): boolean {
  if (state.rush.played.includes(day)) return false;
  state.rush = { ...state.rush, day, result: { score: 0, grade: 0, opened: 0, correct: 0, win: false }, played: rememberDay(state.rush.played, day) };
  return true;
}

export interface RushFinishResult { shards: number; prize: string | null; coins: number; practiceLeft: number | null }

/** Practice counters for a day; a new day starts with all paid shifts left. */
export function rushPracticeFor(state: GameState, day: string): { day: string | null; paid: number } {
  if (state.rush.practice.day !== day) state.rush = { ...state.rush, practice: { day, paid: 0 } };
  return state.rush.practice;
}

/** Paid practice shifts left today (0 when the day's limit is used up). */
export function rushPracticeLeft(state: GameState, day: string): number {
  const p = state.rush.practice;
  const paid = p.day === day ? p.paid : 0;
  return Math.max(0, CONFIG.rushPractice.paidPerDay - paid);
}

/** Ends a shift. Records the official result and pays its shards; a practice shift pays coins per star,
 *  for at most `paidPerDay` shifts that day. Adds the keepsake if the oversized parcel was opened. */
export function rushFinish(state: GameState, day: string, official: boolean, result: RushResult): RushFinishResult {
  let shards = 0, prize: string | null = null, coins = 0, practiceLeft: number | null = null;
  if (official && state.rush.day === day) {
    state.rush = { ...state.rush, result: { ...result } };
    shards = RUSH_REWARD[Math.max(0, Math.min(3, result.grade))];
    state.shards += shards;
    state.town.rep += CONFIG.rep.rush;
  } else if (!official) {
    const practice = rushPracticeFor(state, day);
    if (practice.paid < CONFIG.rushPractice.paidPerDay) {
      coins = Math.max(0, Math.min(3, result.grade)) * CONFIG.rushPractice.coinsPerStar;
      state.coins += coins;
      practice.paid += 1;
    }
    practiceLeft = Math.max(0, CONFIG.rushPractice.paidPerDay - practice.paid);
  }
  const p = rushPrize(day);
  if (result.win && !state.rush.owned.includes(p)) {
    state.rush = { ...state.rush, owned: state.rush.owned.concat(p) };
    prize = p;
  }
  return { shards, prize, coins, practiceLeft };
}

/** Spoiler-free result for a group chat. */
export function rushShare(title: string, n: number, result: RushResult, marks: string[]): string {
  const stars = '★'.repeat(result.grade) + '☆'.repeat(3 - result.grade);
  return title + ' #' + n + ' ' + stars + '\n' + marks.slice(0, 16).join('') + '\n📦 ' + result.correct + '/' + result.opened + ' · ' + result.score;
}

export function itemSoundsOf(seriesId: string): Sound[] {
  return [...new Set(SERIES[seriesId].items.map(i => i.snd))];
}

export function isRushItem(id: string): boolean { return Object.prototype.hasOwnProperty.call(RUSH_ITEM, id); }
export function itemWeights(id: string): [number, number] { return ITEMS[id].w; }
