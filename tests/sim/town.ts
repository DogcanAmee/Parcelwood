// Daily-player town economy model for the M3.2 design check (design section 1.5).
// One "day" is the morning truck plus a full shelf: open every normal parcel with a reasonable guess rate,
// return every misdelivered parcel, then claim the board jobs and daily tasks that finished.
// The model deliberately leaves out the daily puzzle, Rush Hour and gifts, so its reputation rate is a floor.
import { CONFIG } from '../../src/core/config';
import { RARITIES, newState } from '../../src/core/logic';
import type { GameState } from '../../src/core/types';
import { hash, seeded } from '../../src/core/daily';
import { boardNote, claimTask, refreshBoard } from '../../src/core/board';
import { claimQuest, questNote, refreshQuests } from '../../src/core/quests';
import { claimLevelUp, deliverTo, townDeliver, townOpen } from '../../src/core/town';

const DAY = 86400000;
const START = new Date(2026, 0, 1, 9, 0, 0).getTime();

function lv7State(): GameState {
  const s = newState(START);
  s.town.rep = CONFIG.townLevels[6];
  s.town.level = 7;
  s.unlocked = ['snacks', 'toys', 'souvenirs', 'garden', 'market'];
  return s;
}

function playDay(s: GameState, now: number, rng: () => number): void {
  townDeliver(s, now, rng);
  refreshBoard(s, now, rng);
  refreshQuests(s, now, rng);

  for (const p of [...s.parcels].filter(x => x.kind === 'normal')) {
    p.guess.series = rng() < 0.5 ? p.series : s.unlocked[(s.unlocked.indexOf(p.series) + 1) % s.unlocked.length];
    p.guess.rarity = rng() < 0.2 ? null : RARITIES[Math.floor(rng() * RARITIES.length)];
    const res = townOpen(s, p.id, rng, now);
    if (!res) continue;
    const right = (res.seriesRight ? 1 : 0) + (res.rarityRight ? 1 : 0);
    boardNote(s, { k: 'open', item: res.item, right }, now);
    questNote(s, { k: 'open', item: res.item, right }, now);
  }

  for (const p of [...s.parcels].filter(x => x.kind === 'mystery' && x.resident)) {
    if (!deliverTo(s, p.id, p.resident!, now)) continue;
    boardNote(s, { k: 'return' }, now);
    questNote(s, { k: 'return' }, now);
  }

  for (let i = 0; i < s.board.tasks.length; i++) claimTask(s, i);
  for (let i = 0; i < s.quests.list.length; i++) claimQuest(s, i, now, rng);
}

export interface TownSim {
  lv8Days: number[];
  seriesDays: number[];
  baseCoins: number[];
  newCoins: number[];
}

/** Runs `runs` daily players. Lv7-to-Lv8 and series completion stop at `maxDays` (censored as maxDays). */
export function simulateTown(runs: number, maxDays = 240): TownSim {
  const out: TownSim = { lv8Days: [], seriesDays: [], baseCoins: [], newCoins: [] };
  for (let run = 0; run < runs; run++) {
    const rng = seeded(hash('m32-town:' + run));

    // 1. A Lv7 player with the new build: count days until Lv8 opens the Lost Letter Office.
    const s = lv7State();
    let lv8Day = maxDays;
    let unlockDay = -1;
    for (let day = 1; day <= maxDays; day++) {
      playDay(s, START + day * DAY, rng);
      if (claimLevelUp(s).includes(8)) { lv8Day = day; unlockDay = day; break; }
    }
    out.lv8Days.push(lv8Day);
    if (unlockDay < 0) { out.seriesDays.push(maxDays); continue; }

    // 2. Keep playing from Lv8 until the new series is complete (or the cap).
    let seriesDay = maxDays;
    for (let day = unlockDay + 1; day <= maxDays; day++) {
      playDay(s, START + day * DAY, rng);
      claimLevelUp(s);
      if (s.completed.includes('lost-letter-office')) { seriesDay = day - unlockDay; break; }
    }
    out.seriesDays.push(seriesDay);
  }

  // 3. Two 30-day Lv7 runs for the coin curve: the M3.1 base (no Lv8) and M3.2 (Lv8 opens the sixth series).
  for (let run = 0; run < runs; run++) {
    const brng = seeded(hash('m32-base:' + run));
    const base = lv7State();
    for (let day = 1; day <= 30; day++) playDay(base, START + day * DAY, brng);
    out.baseCoins.push(base.coins);

    const nrng = seeded(hash('m32-base:' + run));
    const next = lv7State();
    for (let day = 1; day <= 30; day++) { playDay(next, START + day * DAY, nrng); claimLevelUp(next); }
    out.newCoins.push(next.coins);
  }
  return out;
}

export function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const i = Math.floor(a.length / 2);
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}

export function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
