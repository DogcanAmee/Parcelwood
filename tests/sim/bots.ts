// Bots that play Station Week runs with no UI, for balance numbers and regression checks.
import { hash, seeded } from '../../src/core/daily';
import {
  RUN_TOOLS, STAMP, ZERO_MODS, canInspect, choosePick, endDay, inspect, itemsLeft, route, seriesLeft, startRun, storageSize,
} from '../../src/core/run';
import type { RunParcel, RunState, School, StampId } from '../../src/core/run';
import { clueFits } from '../../src/core/requests';
import { ITEMS } from '../../src/core/logic';
import type { WeekMods } from '../../src/core/types';

/** careful: check, then guess safe leftovers (sender known, not insured) and send the rest back.
 *  bold: check, then guess every leftover that is not insured, misdelivered or not. blind: never check. */
export type Play = 'careful' | 'bold' | 'blind';
export type PickPolicy = 'none' | 'random' | School;

const knowsSender = (rp: RunParcel) => rp.shown.some(c => c === 'smudge' || c === 'postmark' || c === 'sticker');

function bestShop(run: RunState, series: string[]): string {
  return series.slice().sort((a, b) => (run.demand[b] ?? 1) - (run.demand[a] ?? 1))[0];
}

function inspectAll(run: RunState): void {
  for (let i = 0; i < run.desk.length; i++) {
    for (const tool of RUN_TOOLS) {
      const rp = run.desk[i];
      if (seriesLeft(rp).length <= 1 && knowsSender(rp)) break;
      if (canInspect(run, i, tool)) inspect(run, i, tool);
    }
  }
}

function routeAll(run: RunState, play: Play): void {
  let i = 0;
  const unsure: number[] = [];
  while (i < run.desk.length && run.phase === 'day') {
    const rp = run.desk[i];
    const series = seriesLeft(rp);
    if (play === 'blind') { route(run, i, { k: 'shop', series: bestShop(run, series) }); continue; }
    if (!series.length) { route(run, i, { k: 'return' }); continue; }
    if (knowsSender(rp)) {
      const items = itemsLeft(rp);
      const order = run.orders.findIndex(o => !o.done && items.length > 0 && items.every(id => clueFits(ITEMS[id], o.clue)));
      if (order >= 0) { route(run, i, { k: 'order', order }); continue; }
      if (series.length === 1) { route(run, i, { k: 'shop', series: series[0] }); continue; }
    }
    unsure.push(i);
    i++;
  }
  if (run.phase !== 'day') return;
  const keep = storageSize(run);
  for (let n = unsure.length - 1; n >= keep; n--) {
    const rp = run.desk[unsure[n]];
    if (!rp) continue;
    const safe = (play === 'bold' || knowsSender(rp)) && !rp.insured && run.event !== 'audit';
    route(run, unsure[n], safe ? { k: 'shop', series: bestShop(run, seriesLeft(rp)) } : { k: 'return' });
  }
}

function pickStamp(run: RunState, policy: PickPolicy, rnd: () => number): StampId | null {
  if (policy === 'none' || !run.offer.length) return null;
  if (policy !== 'random') {
    const own = run.offer.find(id => STAMP[id].school === policy);
    if (own) return own;
  }
  return run.offer[Math.floor(rnd() * run.offer.length)];
}

export function playRun(seed: number, play: Play, policy: PickPolicy, mods: WeekMods = ZERO_MODS): RunState {
  const run = startRun(seed, mods);
  const rnd = seeded(hash('bot:' + seed));
  while (run.phase !== 'over') {
    if (run.phase === 'day') {
      if (play !== 'blind') inspectAll(run);
      routeAll(run, play);
      if (run.phase === 'day') endDay(run);
    } else {
      choosePick(run, pickStamp(run, policy, rnd));
    }
  }
  return run;
}

export interface SimRow { label: string; runs: number; winRate: number; avgEarned: number; avgComplaints: number }

export function simulate(label: string, runs: number, play: Play, policy: PickPolicy, offset = 0, mods: WeekMods = ZERO_MODS): SimRow {
  let wins = 0, earned = 0, complaints = 0;
  for (let s = 0; s < runs; s++) {
    const run = playRun(offset + s, play, policy, mods);
    if (run.win) wins++;
    earned += run.earned;
    complaints += run.complaints;
  }
  return { label, runs, winRate: wins / runs, avgEarned: earned / runs, avgComplaints: complaints / runs };
}
