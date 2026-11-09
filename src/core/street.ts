// Parcel Street (docs/design-v2.md, step 2): reputation now fixes up the street, one visible repair at a time.
// Eight buildings, four repairs each. Town levels still open features and neighbors; the street is the long goal.
// A building's first repair comes no earlier than its neighbor moves in (Lena Lv4 = 160, the twins Lv5 = 280, Rosa Lv6 = 450, Inés Lv7 = 650).
import { CONFIG } from './config';
import { townLevel } from './logic';
import type { GameState } from './types';

export interface StreetBuilding { id: string; resident: string | null; e: string }
export interface StreetStep { b: string; rep: number; e: string }

export const STREET_COINS = 15;

export const BUILDINGS: readonly StreetBuilding[] = [
  { id: 'station', resident: null, e: '📮' },
  { id: 'bakery', resident: 'theo', e: '🥖' },
  { id: 'house12', resident: 'okafor', e: '🏡' },
  { id: 'corner', resident: 'dube', e: '📫' },
  { id: 'bikes', resident: 'lena', e: '🚲' },
  { id: 'laundry', resident: 'twins', e: '🧺' },
  { id: 'greenhouse', resident: 'rosa', e: '🌿' },
  { id: 'market', resident: 'ines', e: '🍎' },
];

// Index in this list = the repair's id in the text files (src/i18n/street.ts). Reputation only goes up.
export const STREET_STEPS: readonly StreetStep[] = [
  { b: 'station', rep: 15, e: '🪑' },
  { b: 'bakery', rep: 35, e: '⛱️' },
  { b: 'house12', rep: 55, e: '🌷' },
  { b: 'corner', rep: 80, e: '📮' },
  { b: 'station', rep: 105, e: '🏮' },
  { b: 'bakery', rep: 130, e: '🪧' },
  { b: 'house12', rep: 160, e: '🛋️' },
  { b: 'bikes', rep: 190, e: '🔧' },
  { b: 'corner', rep: 220, e: '🪧' },
  { b: 'station', rep: 250, e: '🕰️' },
  { b: 'laundry', rep: 285, e: '💡' },
  { b: 'bakery', rep: 340, e: '☕' },
  { b: 'bikes', rep: 400, e: '🛞' },
  { b: 'house12', rep: 460, e: '🎏' },
  { b: 'greenhouse', rep: 480, e: '🚪' },
  { b: 'corner', rep: 530, e: '🗺️' },
  { b: 'laundry', rep: 600, e: '🧦' },
  { b: 'greenhouse', rep: 640, e: '🌻' },
  { b: 'bikes', rep: 680, e: '🏁' },
  { b: 'market', rep: 700, e: '⛱️' },
  { b: 'laundry', rep: 760, e: '🧼' },
  { b: 'bakery', rep: 850, e: '🔥' },
  { b: 'laundry', rep: 940, e: '🪑' },
  { b: 'greenhouse', rep: 990, e: '🐝' },
  { b: 'market', rep: 1010, e: '🍋' },
  { b: 'house12', rep: 1040, e: '🖼️' },
  { b: 'corner', rep: 1150, e: '🏅' },
  { b: 'market', rep: 1200, e: '🎻' },
  { b: 'bikes', rep: 1270, e: '🔔' },
  { b: 'greenhouse', rep: 1330, e: '🎃' },
  { b: 'market', rep: 1360, e: '🏮' },
  { b: 'station', rep: 1400, e: '🐓' },
];

/** Repairs that the current reputation has paid for. */
export function streetBuilt(rep: number): number { return STREET_STEPS.filter(s => s.rep <= rep).length; }

export interface StreetProgress { built: number; total: number; next: number | null; toNext: number }
export function streetProgress(state: GameState): StreetProgress {
  const built = streetBuilt(state.town.rep);
  const next = built < STREET_STEPS.length ? built : null;
  return { built, total: STREET_STEPS.length, next, toNext: next === null ? 0 : STREET_STEPS[next].rep - state.town.rep };
}

/** Repairs done on one building (indexes into STREET_STEPS), and how many it has in all. */
export function buildingSteps(id: string): number[] { return STREET_STEPS.map((s, i) => (s.b === id ? i : -1)).filter(i => i >= 0); }
export function buildingDone(state: GameState, id: string): number[] { const built = streetBuilt(state.town.rep); return buildingSteps(id).filter(i => i < built); }

/** A building shows on the street once its neighbor has moved in (the station is always there). */
export function buildingOpen(state: GameState, b: StreetBuilding): boolean {
  if (!b.resident) return true;
  const r = CONFIG.residents.find(x => x.id === b.resident);
  return !!r && r.lv <= townLevel(state);
}

/** Announces repairs finished since last time: pays STREET_COINS each and returns their indexes (oldest first). */
export function claimStreet(state: GameState): number[] {
  const built = streetBuilt(state.town.rep);
  if (built <= state.town.street) return [];
  const got = [];
  for (let i = state.town.street; i < built; i++) got.push(i);
  state.town.street = built;
  state.coins += got.length * STREET_COINS;
  return got;
}
