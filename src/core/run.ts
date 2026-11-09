// Station Week: a roguelite shift mode that sits next to Rush Hour. Pure rules, no DOM, no clock, no saves yet.
// One run is five working days. Each morning parcels and residents' orders arrive. Inspecting a parcel costs action
// points, so not everything can be checked. Every parcel goes to a shop, to an order, or back to the depot (misdelivered).
// Evenings check the takings target and offer one of three stamps, which is where each run's build comes from.
// Mistakes and missed early targets add complaints; three complaints end the run. Day 5's target is the week's goal. Parcels left over carry to tomorrow up to the storage size.
// Parcels and clue logic come from Rush Hour (rollTrayParcel, candidates), so both modes read the same way.
// The state is plain JSON: every random roll is derived from the seed, so a run can be saved and resumed anywhere.
import { CONFIG } from './config';
import { hash, seeded } from './daily';
import { ITEMS, SERIES } from './logic';
import { clueFits } from './requests';
import { candidates, rollTrayParcel, SERIES_IDS } from './rushHour';
import type { TrayClue, TrayParcel } from './rushHour';
import type { Clue, Rng, Sound, WeekMods } from './types';

export const RUN = {
  days: 5,
  ap: 10,
  complaintsMax: 3,
  storage: 3,
  parcels: [7, 8, 9, 10, 11],
  orders: [2, 2, 3, 3, 3],
  cost: { shake: 1, weigh: 1, postmark: 1, xray: 3 } as Record<RunTool, number>,
  price: { common: 8, rare: 18, epic: 40, secret: 90 },
  wrongShop: 0.5,
  orderCoins: 15,
  returnCoins: 10,
  /** Takings (all coins earned this run) needed by the end of these days. Missing an early one adds a complaint;
   *  the last one is the week's goal: missing it loses the run. */
  targets: { 2: 130, 4: 360, 5: 640 } as Record<number, number>,
  hot: 1.5,
  cold: 0.75,
  rerollCost: [10, 20, 35],
  eventDay: 3,
  bossDay: 5,
};

export type RunTool = 'shake' | 'weigh' | 'postmark' | 'xray';
export const RUN_TOOLS: readonly RunTool[] = ['postmark', 'shake', 'weigh', 'xray'];
export type RunEvent = 'rain' | 'powercut' | 'moving' | 'audit' | 'holiday';
/** Day-3 events reuse the town's events; day 5 is a boss day. */
export const RUN_EVENTS: readonly RunEvent[] = ['rain', 'powercut', 'moving'];
export const RUN_BOSSES: readonly RunEvent[] = ['audit', 'holiday'];

export type School = 'sound' | 'insured' | 'blind' | 'storage' | 'regulars' | 'general';
export type StampId =
  | 'tuning-fork' | 'echo' | 'appraiser' | 'bonded' | 'hunch' | 'lucky-cat' | 'shelving' | 'full-crate'
  | 'thank-you' | 'favourite' | 'extra-hands' | 'second-scale' | 'magnifier' | 'lamp';
export interface StampDef { id: StampId; school: School }
export const STAMPS: readonly StampDef[] = [
  { id: 'tuning-fork', school: 'sound' },   // the first 3 shakes each day are free
  { id: 'echo', school: 'sound' },          // right sales of shaken parcels build a streak: +2 coins per step (max 5)
  { id: 'appraiser', school: 'insured' },   // insured parcels sell for +50%
  { id: 'bonded', school: 'insured' },      // the first mistake on an insured parcel each day is forgiven
  { id: 'hunch', school: 'blind' },         // right sales of parcels you never inspected pay +60%
  { id: 'lucky-cat', school: 'blind' },     // the first mistake on a never-inspected parcel each day is forgiven
  { id: 'shelving', school: 'storage' },    // +2 storage
  { id: 'full-crate', school: 'storage' },  // from the 3rd right sale of one series in a day: +6 coins each
  { id: 'thank-you', school: 'regulars' },  // orders pay +50%
  { id: 'favourite', school: 'regulars' },  // an order answered with the resident's favourite sound gives +2 action points
  { id: 'extra-hands', school: 'general' }, // +2 action points every day
  { id: 'second-scale', school: 'general' },// weighing is free
  { id: 'magnifier', school: 'general' },   // the postmark check reads the whole postmark, never a smudge
  { id: 'lamp', school: 'general' },        // the X-ray costs 2
];
export const STAMP: Record<StampId, StampDef> = Object.fromEntries(STAMPS.map(s => [s.id, s])) as Record<StampId, StampDef>;

export interface RunParcel {
  p: TrayParcel;
  shown: TrayClue[];
  checks: RunTool[];
  insured: boolean;
}
export interface RunOrder { resident: string; clue: Clue; done: boolean }
export interface DayCounters { shakes: number; sold: Record<string, number>; streak: number; bonded: boolean; luckyCat: boolean }
export interface RunStats { sold: number; right: number; orders: number; returned: number; mistakes: number; lost: number; targetsMissed: number }
export type RunPhase = 'day' | 'evening' | 'over';

export interface RunState {
  v: 1;
  seed: number;
  mods: WeekMods;
  freeChecks: number;
  day: number;
  phase: RunPhase;
  ap: number;
  complaints: number;
  coins: number;
  earned: number;
  desk: RunParcel[];
  orders: RunOrder[];
  demand: Record<string, number>;
  event: RunEvent | null;
  stamps: StampId[];
  offer: StampId[];
  rerolls: number;
  next: number;
  today: DayCounters;
  stats: RunStats;
  win: boolean | null;
}

export type RunRoute = { k: 'shop'; series: string } | { k: 'order'; order: number } | { k: 'return' };
export interface RouteOutcome { ok: boolean; coins: number; right: boolean; mistake: boolean; forgiven: boolean }

export const has = (run: RunState, id: StampId) => run.stamps.includes(id);

function rngFor(run: RunState, tag: string, n = 0): Rng { return seeded(hash(run.seed + ':' + run.day + ':' + tag + ':' + n)); }
function pickWith<T>(arr: readonly T[], rng: Rng): T { return arr[Math.floor(rng() * arr.length)]; }
function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export const ZERO_MODS: WeekMods = { ap: 0, storage: 0, checks: 0, coins: 0, keen: 0 };

export function storageSize(run: RunState): number { return RUN.storage + run.mods.storage + (has(run, 'shelving') ? 2 : 0); }

export function startRun(seed: number, mods: WeekMods = ZERO_MODS): RunState {
  const m: WeekMods = { ...ZERO_MODS, ...mods };
  const run: RunState = {
    v: 1, seed: seed >>> 0, mods: m, freeChecks: 0, day: 0, phase: 'evening', ap: 0, complaints: 0, coins: m.coins * 10, earned: 0,
    desk: [], orders: [], demand: {}, event: null, stamps: [], offer: [], rerolls: 0, next: 0,
    today: { shakes: 0, sold: {}, streak: 0, bonded: false, luckyCat: false },
    stats: { sold: 0, right: 0, orders: 0, returned: 0, mistakes: 0, lost: 0, targetsMissed: 0 },
    win: null,
  };
  startDay(run);
  return run;
}

function eventFor(run: RunState): RunEvent | null {
  if (run.day === RUN.eventDay) return pickWith(RUN_EVENTS, rngFor(run, 'event'));
  if (run.day === RUN.bossDay) return pickWith(RUN_BOSSES, rngFor(run, 'event'));
  return null;
}

/** The two events a seed will bring, without starting a run: day 3 from the town pool, day 5 the boss.
 *  The card shows these so every player can see this week's theme before they start. */
export function weekTheme(seed: number): [RunEvent, RunEvent] {
  const at = (day: number) => seeded(hash(seed + ':' + day + ':event:0'));
  const ev = RUN_EVENTS[Math.floor(at(RUN.eventDay)() * RUN_EVENTS.length)];
  const boss = RUN_BOSSES[Math.floor(at(RUN.bossDay)() * RUN_BOSSES.length)];
  return [ev, boss];
}

/** Orders ask for one thing a parcel on the desk really holds, so every order can be answered today. */
function makeOrders(run: RunState, n: number, rng: Rng): RunOrder[] {
  const pool = run.desk.filter(rp => rp.p.kind !== 'decoy');
  const out: RunOrder[] = [];
  for (const rp of shuffled(pool, rng).slice(0, n)) {
    const item = ITEMS[rp.p.item];
    const opts: Clue[] = [{ k: 'series', v: item.series }, { k: 'snd', v: item.snd }, { k: 'under', v: Math.ceil(item.w[1]) }];
    if (Math.floor(item.w[0]) >= 1) opts.push({ k: 'over', v: Math.floor(item.w[0]) });
    out.push({ resident: pickWith(CONFIG.residents, rng).id, clue: pickWith(opts, rng), done: false });
  }
  return out;
}

function startDay(run: RunState): void {
  run.day += 1;
  run.phase = 'day';
  run.offer = [];
  run.rerolls = 0;
  run.event = eventFor(run);
  run.today = { shakes: 0, sold: {}, streak: 0, bonded: false, luckyCat: false };
  run.ap = RUN.ap + run.mods.ap + (has(run, 'extra-hands') ? 2 : 0) - (run.event === 'powercut' ? 2 : 0);
  run.freeChecks = run.mods.checks;
  const rng = rngFor(run, 'day');
  const order = shuffled(SERIES_IDS, rng);
  run.demand = Object.fromEntries(SERIES_IDS.map(s => [s, s === order[0] ? RUN.hot : s === order[1] ? RUN.cold : 1]));
  let n = RUN.parcels[run.day - 1] ?? RUN.parcels[RUN.parcels.length - 1];
  if (run.event === 'moving') n += 3;
  if (run.event === 'holiday') n = Math.round(n * 1.5);
  for (let i = 0; i < n; i++) {
    const p = rollTrayParcel(rng, run.next, run.next + 1);
    run.next += 1;
    run.desk.push({ p, shown: [], checks: [], insured: p.kind !== 'decoy' && rng() < CONFIG.insuredChance[p.rarity] });
  }
  run.orders = makeOrders(run, (RUN.orders[run.day - 1] ?? 3) + (run.event === 'holiday' ? 1 : 0), rng);
}

export function toolAvailable(run: RunState, tool: RunTool): boolean {
  if (tool === 'postmark' && run.event === 'rain') return false;
  if (tool === 'xray' && run.event === 'powercut') return false;
  return true;
}

function rawToolCost(run: RunState, tool: RunTool): number {
  if (tool === 'shake' && has(run, 'tuning-fork') && run.today.shakes < 3) return 0;
  if (tool === 'weigh' && has(run, 'second-scale')) return 0;
  if (tool === 'xray' && has(run, 'lamp')) return 2;
  return RUN.cost[tool];
}

/** What the next check actually costs. Free ledger checks cover the basic tools, never the X-ray. */
export function toolCost(run: RunState, tool: RunTool): number {
  const cost = rawToolCost(run, tool);
  return cost > 0 && tool !== 'xray' && run.freeChecks > 0 ? 0 : cost;
}

function clueFor(run: RunState, rp: RunParcel, tool: RunTool): TrayClue {
  if (tool === 'shake') return 'sound';
  if (tool === 'weigh') return 'weight';
  if (tool === 'xray') return rp.p.kind === 'decoy' ? 'postmark' : 'sticker';
  return rp.p.smudge.length && !has(run, 'magnifier') && !run.mods.keen ? 'smudge' : 'postmark';
}

export function canInspect(run: RunState, index: number, tool: RunTool): boolean {
  const rp = run.desk[index];
  return run.phase === 'day' && !!rp && !rp.checks.includes(tool) && toolAvailable(run, tool) && toolCost(run, tool) <= run.ap;
}

/** Spends action points on one check. Returns the clue it showed, or null when the check is not allowed. */
export function inspect(run: RunState, index: number, tool: RunTool): TrayClue | null {
  if (!canInspect(run, index, tool)) return null;
  const rp = run.desk[index];
  const raw = rawToolCost(run, tool);
  const free = raw > 0 && tool !== 'xray' && run.freeChecks > 0;
  run.ap -= free ? 0 : raw;
  if (free) run.freeChecks -= 1;
  if (tool === 'shake') run.today.shakes += 1;
  rp.checks.push(tool);
  const clue = clueFor(run, rp, tool);
  if (!rp.shown.includes(clue)) rp.shown.push(clue);
  return clue;
}

/** Series the parcel may belong to from what has been checked. Empty: misdelivered. */
export function seriesLeft(rp: RunParcel): string[] { return candidates(rp.p, rp.shown); }

/** Items the parcel may hold from what has been checked. */
export function itemsLeft(rp: RunParcel): string[] {
  const snd = rp.shown.includes('sound'), wt = rp.shown.includes('weight');
  return seriesLeft(rp).flatMap(s => SERIES[s].items
    .filter(it => (!snd || it.snd === rp.p.sound) && (!wt || (rp.p.weight >= it.w[0] && rp.p.weight <= it.w[1])))
    .map(it => it.id));
}

export function salePrice(run: RunState, rp: RunParcel, series: string): number {
  const base = RUN.price[rp.p.rarity] * (run.demand[series] ?? 1);
  return Math.round(rp.p.series === series ? base : base * RUN.wrongShop);
}

function mistake(run: RunState, rp: RunParcel): boolean {
  run.today.streak = 0;
  run.stats.mistakes += 1;
  if (rp.insured && has(run, 'bonded') && !run.today.bonded) { run.today.bonded = true; return true; }
  if (!rp.checks.length && has(run, 'lucky-cat') && !run.today.luckyCat) { run.today.luckyCat = true; return true; }
  run.complaints += 1;
  if (run.complaints >= RUN.complaintsMax) { run.phase = 'over'; run.win = false; }
  return false;
}

function earn(run: RunState, coins: number): number {
  run.coins += coins;
  run.earned += coins;
  return coins;
}

const FAIL: RouteOutcome = { ok: false, coins: 0, right: false, mistake: false, forgiven: false };

/** Sends one desk parcel away. Routing is free; only checks cost action points. */
export function route(run: RunState, index: number, to: RunRoute): RouteOutcome {
  const rp = run.desk[index];
  if (run.phase !== 'day' || !rp) return FAIL;
  const decoy = rp.p.kind === 'decoy';
  if (to.k === 'order') {
    const order = run.orders[to.order];
    if (!order || order.done) return FAIL;
    run.desk.splice(index, 1);
    if (decoy || !clueFits(ITEMS[rp.p.item], order.clue)) {
      const forgiven = mistake(run, rp);
      return { ok: true, coins: 0, right: false, mistake: true, forgiven };
    }
    order.done = true;
    run.stats.orders += 1;
    const like: Sound | undefined = CONFIG.residents.find(r => r.id === order.resident)?.like;
    if (has(run, 'favourite') && like === rp.p.sound) run.ap += 2;
    const coins = Math.round((RUN.orderCoins + RUN.price[rp.p.rarity]) * (has(run, 'thank-you') ? 1.5 : 1));
    return { ok: true, coins: earn(run, coins), right: true, mistake: false, forgiven: false };
  }
  if (to.k === 'return') {
    run.desk.splice(index, 1);
    if (!decoy) return { ok: true, coins: 0, right: false, mistake: false, forgiven: false };
    run.stats.returned += 1;
    const coins = RUN.returnCoins * (run.event === 'moving' ? 2 : 1);
    return { ok: true, coins: earn(run, coins), right: true, mistake: false, forgiven: false };
  }
  if (!SERIES_IDS.includes(to.series)) return FAIL;
  run.desk.splice(index, 1);
  run.stats.sold += 1;
  if (decoy) {
    const forgiven = mistake(run, rp);
    return { ok: true, coins: 0, right: false, mistake: true, forgiven };
  }
  const right = rp.p.series === to.series;
  let coins = salePrice(run, rp, to.series);
  if (!right) {
    if (rp.insured || run.event === 'audit') {
      const forgiven = mistake(run, rp);
      return { ok: true, coins: earn(run, coins), right: false, mistake: true, forgiven };
    }
    run.today.streak = 0;
    if (!rp.checks.length && has(run, 'lucky-cat') && !run.today.luckyCat) {
      run.today.luckyCat = true;
      coins = Math.round(RUN.price[rp.p.rarity] * (run.demand[to.series] ?? 1));
    }
    return { ok: true, coins: earn(run, coins), right: false, mistake: false, forgiven: false };
  }
  run.stats.right += 1;
  const base = coins;
  if (rp.insured && has(run, 'appraiser')) coins += Math.round(base * 0.5);
  if (!rp.checks.length && has(run, 'hunch')) coins += Math.round(base * 0.6);
  if (rp.checks.includes('shake') && has(run, 'echo')) { run.today.streak = Math.min(5, run.today.streak + 1); coins += 2 * run.today.streak; }
  run.today.sold[to.series] = (run.today.sold[to.series] || 0) + 1;
  if (has(run, 'full-crate') && run.today.sold[to.series] >= 3) coins += 6;
  return { ok: true, coins: earn(run, coins), right: true, mistake: false, forgiven: false };
}

/** Closes the day: leftovers carry over up to the storage size (the rest go back to the depot unpaid), then the target is checked. */
export function endDay(run: RunState): boolean {
  if (run.phase !== 'day') return false;
  const keep = storageSize(run);
  run.stats.lost += Math.max(0, run.desk.length - keep);
  run.desk = run.desk.slice(0, keep);
  const target = RUN.targets[run.day];
  const missed = target !== undefined && run.earned < target;
  if (missed) run.stats.targetsMissed += 1;
  if (run.day >= RUN.days) { run.phase = 'over'; run.win = !missed && run.complaints < RUN.complaintsMax; return true; }
  if (missed) run.complaints += 1;
  if (run.complaints >= RUN.complaintsMax) { run.phase = 'over'; run.win = false; return true; }
  run.phase = 'evening';
  run.offer = makeOffer(run);
  return true;
}

function makeOffer(run: RunState): StampId[] {
  const pool = STAMPS.map(s => s.id).filter(id => !has(run, id));
  return shuffled(pool, rngFor(run, 'offer', run.rerolls)).slice(0, 3);
}

export function rerollCost(run: RunState): number | null { return RUN.rerollCost[run.rerolls] ?? null; }

export function reroll(run: RunState): boolean {
  const cost = rerollCost(run);
  if (run.phase !== 'evening' || cost === null || run.coins < cost) return false;
  run.coins -= cost;
  run.rerolls += 1;
  run.offer = makeOffer(run);
  return true;
}

/** Takes one stamp from the evening offer (or none) and opens the next day. */
export function choosePick(run: RunState, id: StampId | null): boolean {
  if (run.phase !== 'evening' || (id !== null && !run.offer.includes(id))) return false;
  if (id) run.stamps.push(id);
  startDay(run);
  return true;
}

/** End-of-run grade 0..3: week goal met, no missed targets, no complaints. */
export function runGrade(run: RunState): number {
  if (!run.win) return 0;
  return 1 + (run.stats.targetsMissed === 0 ? 1 : 0) + (run.complaints === 0 ? 1 : 0);
}

/**
 * One player action as a short string, so a run saves as its seed plus a log and is rebuilt by replaying the rules.
 * i:<parcel>:<tool> inspect · s:<parcel>:<series> sell · o:<parcel>:<order> hand to an order · b:<parcel> send back ·
 * e end the day · x reroll the offer · p:<stamp> take a stamp (p: takes none).
 */
export type RunAction = string;

export function applyAction(run: RunState, a: RunAction): boolean {
  const [k, x, y] = a.split(':');
  const n = Number(x);
  const idx = /^\d{1,3}$/.test(x ?? '') ? n : -1;
  switch (k) {
    case 'i': return idx >= 0 && (RUN_TOOLS as readonly string[]).includes(y) && inspect(run, idx, y as RunTool) !== null;
    case 's': return idx >= 0 && route(run, idx, { k: 'shop', series: y }).ok;
    case 'o': return idx >= 0 && /^\d{1,2}$/.test(y ?? '') && route(run, idx, { k: 'order', order: Number(y) }).ok;
    case 'b': return idx >= 0 && y === undefined && route(run, idx, { k: 'return' }).ok;
    case 'e': return x === undefined && endDay(run);
    case 'x': return x === undefined && reroll(run);
    case 'p': return y === undefined && (x === '' ? choosePick(run, null) : STAMPS.some(s => s.id === x) && choosePick(run, x as StampId));
    default: return false;
  }
}

export const RUN_LOG_MAX = 3000;

/** Rebuilds a run from its seed and log. Null when any action is not allowed at that point (a broken or edited save). */
export function replay(seed: number, log: readonly RunAction[], mods: WeekMods = ZERO_MODS): RunState | null {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || log.length > RUN_LOG_MAX) return null;
  const run = startRun(seed, mods);
  for (const a of log) if (typeof a !== 'string' || a.length > 40 || !applyAction(run, a)) return null;
  return run;
}
