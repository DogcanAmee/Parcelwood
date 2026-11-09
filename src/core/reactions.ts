// One neighbor reacts to every opened parcel. Picked from the residents who have moved in, by day and parcel id,
// so the same parcel always gets the same line. No state is written.
import { hash } from './daily';
import { openResidents } from './logic';
import type { GameState, Item, Resident } from './types';

export const REACTION_LINES = 4;

export interface Reaction {
  resident: Resident;
  /** 'line' = an everyday remark (index into the resident's lines); 'like' = the item makes the sound they love. */
  kind: 'line' | 'like';
  line: number;
  /** For 'like': whether the player already knows this neighbor's favorite (only then may the text name it). */
  known: boolean;
}

export function reactionFor(state: GameState, item: Item, parcelId: number, day: string): Reaction | null {
  const here = openResidents(state);
  if (!here.length) return null;
  const h = hash('parcelwood-react:' + day + ':' + parcelId);
  const fan = here.find(r => r.like === item.snd);
  if (fan && h % 2 === 0) return { resident: fan, kind: 'like', line: 0, known: state.town.known.includes(fan.id) };
  const resident = here[h % here.length];
  return { resident, kind: 'line', line: Math.floor(h / here.length) % REACTION_LINES, known: state.town.known.includes(resident.id) };
}
