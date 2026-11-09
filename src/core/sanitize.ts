// Checks a save before the game uses it. A save from the cloud or from browser storage is untrusted:
// anything that is not the exact shape the game writes is rejected, so no text from a save can reach the page.
import { CONFIG } from './config';
import { DAY_MEMORY, ITEMS, RARITIES, SERIES, levelFor } from './logic';
import { bootstrapRep } from './town';
import { isRushItem } from './rushHour';
import { TASK_NEED } from './board';
import { replay, RUN_LOG_MAX, ZERO_MODS } from './run';
import { STREET_STEPS, streetBuilt } from './street';
import { METRIC_DAYS } from './metrics';
import { PAGE_CAP, STORY_IDS, emptyStory } from './story';
import { emptySocial } from './social';
import { FIRST_GOAL_IDS, HINT_IDS } from './types';
import type { BoardSave, BoardTask, CheckinSave, Clue, DecorSave, FirstGoalId, FutureSave, GameState, MetricDay, MetricsSave, Parcel, QuestKind, QuestSave, QuestTask, Rarity, Request, RushResult, StreakSave, TaskKind, StorySave, SocialSave, WeekEventSave, WeekLedger, WeekMods, WeekSave } from './types';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isString = (x: unknown): x is string => typeof x === 'string';
const isRarity = (x: unknown): x is Rarity => typeof x === 'string' && (RARITIES as string[]).includes(x);
const isSeries = (x: unknown): x is string => typeof x === 'string' && Object.prototype.hasOwnProperty.call(SERIES, x);
const isItem = (x: unknown): x is string => typeof x === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, x);
const isResident = (x: unknown) => typeof x === 'string' && CONFIG.residents.some(r => r.id === x);
const SERIES_IDS = Object.keys(SERIES);
// A newer build may add item, series or resident ids. Drop the ids that this build does not know and keep the rest
// of the save, so an old build never replaces a newer cloud save just because it cannot read one id.
const cleanIds = (v: unknown, ids: readonly string[]) => Array.isArray(v)
  ? Array.from(new Set(v.filter(id => typeof id === 'string' && ids.includes(id)))) : null;
const cleanCounts = (o: unknown, key: (k: string) => boolean): Record<string, number> | null => {
  if (!isObj(o)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!key(k)) continue; // unknown ids are dropped
    if (!isInt(v)) return null; // a known id with a bad count is still a broken save
    out[k] = v;
  }
  return out;
};
// A newer build can write item, series and decor ids this build does not know. Keep them in `future` instead of
// deleting them, so the next build can put them back. The cap stops a tampered save from growing without bound.
const FUTURE_ID = /^[a-z0-9-]{1,40}$/;
const FUTURE_MAX = 200;
const emptyFuture = (): FutureSave => ({ owned: {}, unlocked: [], completed: [], decor: [] });
function sanitizeFuture(x: unknown): FutureSave {
  const out = emptyFuture();
  if (!isObj(x)) return out;
  if (isObj(x.owned)) {
    for (const [k, v] of Object.entries(x.owned)) if (FUTURE_ID.test(k) && isInt(v)) out.owned[k] = v;
  }
  const list = (v: unknown) => Array.isArray(v)
    ? [...new Set(v.filter((id): id is string => typeof id === 'string' && FUTURE_ID.test(id)))] : [];
  out.unlocked = list(x.unlocked);
  out.completed = list(x.completed);
  out.decor = list(x.decor);
  return trimFuture(out);
}
function trimFuture(f: FutureSave): FutureSave {
  const out = emptyFuture();
  let left = FUTURE_MAX;
  for (const [k, v] of Object.entries(f.owned)) { if (left-- <= 0) break; out.owned[k] = v; }
  for (const id of f.unlocked) { if (left-- <= 0) break; out.unlocked.push(id); }
  for (const id of f.completed) { if (left-- <= 0) break; out.completed.push(id); }
  for (const id of f.decor) { if (left-- <= 0) break; out.decor.push(id); }
  return out;
}
const weekMods = (o: unknown): WeekMods => {
  if (!isObj(o)) return { ...ZERO_MODS };
  const level = (v: unknown, max: number) => isInt(v) && (v as number) <= max ? v as number : 0;
  return { ap: level(o.ap, 1), storage: level(o.storage, 2), checks: level(o.checks, 1), coins: level(o.coins, 2), keen: level(o.keen, 1) };
};
const weekLevels = (o: unknown): WeekLedger => {
  const levels = isObj(o) ? o : {};
  const level = (v: unknown, max: number) => isInt(v) && (v as number) <= max ? v as number : 0;
  return { hands: level(levels.hands, 2), shelves: level(levels.shelves, 2), eye: level(levels.eye, 2) };
};
// Newer save blocks: a missing or malformed value starts only that block over, never the whole save.
const QUEST_KINDS: readonly QuestKind[] = ['guess', 'return', 'rush', 'daily'];
const QUEST_LIST_MAX = 3; // daily tasks are always three; the town board has its own cap
const questNeed = (kind: QuestKind) => kind === 'guess' ? CONFIG.quests.guessNeed : 1;
const defaultQuests = (): QuestSave => ({ day: null, list: [], bonus: false });
const defaultCheckin = (): CheckinSave => ({ last: null, stamps: 0, cards: 0 });
const defaultStreak = (): StreakSave => ({ n: 0, best: 0 });
const defaultDecor = (): DecorSave => ({ owned: [], hidden: [] });
const DECOR_IDS = new Set(CONFIG.decor.items.map(d => d.id));
function sanitizeStreak(x: unknown): StreakSave {
  if (!isObj(x) || !isInt(x.n) || !isInt(x.best)) return defaultStreak();
  const n = Math.min(1e9, x.n as number), best = Math.min(1e9, x.best as number);
  return { n, best: Math.max(n, best) };
}
function sanitizeDecor(x: unknown): DecorSave {
  if (!isObj(x) || !Array.isArray(x.owned) || !Array.isArray(x.hidden)) return defaultDecor();
  const owned = [...new Set((x.owned as unknown[]).filter((v): v is string => typeof v === 'string' && DECOR_IDS.has(v)))].slice(0, CONFIG.decor.items.length);
  const hidden = [...new Set((x.hidden as unknown[]).filter((v): v is string => typeof v === 'string' && owned.includes(v)))].slice(0, CONFIG.decor.items.length);
  return { owned, hidden };
}
const defaultPractice = () => ({ day: null as string | null, paid: 0 });
function sanitizeQuests(x: unknown): QuestSave {
  if (x === undefined) return defaultQuests();
  if (!isObj(x) || !isDay(x.day) || typeof x.bonus !== 'boolean' || !Array.isArray(x.list)) return defaultQuests();
  if (x.list.length > QUEST_LIST_MAX) return defaultQuests();
  const list: QuestTask[] = [];
  for (const t of x.list) {
    if (!isObj(t) || typeof t.kind !== 'string' || !(QUEST_KINDS as readonly string[]).includes(t.kind)) return defaultQuests();
    if (!isInt(t.need) || t.need !== questNeed(t.kind as QuestKind) || !isInt(t.got) || typeof t.claimed !== 'boolean') return defaultQuests();
    const got = Math.min(t.need as number, t.got as number);
    list.push({ kind: t.kind as QuestKind, need: t.need as number, got, claimed: t.claimed && got >= (t.need as number) });
  }
  // A day with no tasks would hide them until the next calendar day; make a fresh list instead.
  if (x.day !== null && list.length === 0) return defaultQuests();
  return { day: x.day as string | null, list, bonus: x.bonus as boolean };
}
function sanitizeCheckin(x: unknown): CheckinSave {
  if (x === undefined) return defaultCheckin();
  if (!isObj(x) || !isDay(x.last) || !isInt(x.stamps) || !isInt(x.cards)) return defaultCheckin();
  return { last: x.last as string | null, stamps: Math.min(CONFIG.checkin.card - 1, x.stamps as number), cards: Math.min(10000, x.cards as number) };
}

// Shape is strict: a real parcel field with the wrong type is a broken save. Id membership is separate:
// a parcel that names an id this build does not know is dropped, and the rest of the save survives.
function parcelShape(p: unknown): p is Parcel {
  if (!isObj(p)) return false;
  if (!isInt(p.id) || (p.kind !== 'normal' && p.kind !== 'mystery') || !isString(p.series) || !isBool(p.rolled)) return false;
  if (!(p.item === null || isString(p.item)) || !(p.rarity === null || isRarity(p.rarity))) return false;
  if (!(p.weight === null || isNum(p.weight)) || !(p.insured === null || isBool(p.insured))) return false;
  if (!isBool(p.sticker) || !isBool(p.postmarkClear)) return false;
  const u = p.used, g = p.guess;
  if (!isObj(u) || !['shake', 'weigh', 'look', 'xray'].every(k => isBool(u[k]))) return false;
  if (!isObj(g) || !(g.series === null || isString(g.series)) || !(g.rarity === null || isRarity(g.rarity))) return false;
  if (p.kind === 'mystery' ? !isString(p.resident) : p.resident !== undefined) return false;
  if (p.urgent !== undefined && !(p.kind === 'mystery' && isInt(p.urgent))) return false;
  if (p.anon !== undefined && !(p.kind === 'mystery' && isBool(p.anon))) return false;
  if (p.misses !== undefined && !(p.anon === true && isInt(p.misses))) return false;
  if (p.urgent !== undefined && p.anon) return false;
  return true;
}
function parcelKnown(p: Parcel): boolean {
  if (!isSeries(p.series)) return false;
  if (p.item !== null && !isItem(p.item)) return false;
  if (p.kind === 'mystery' && !isResident(p.resident)) return false;
  return p.guess.series === null || isSeries(p.guess.series);
}

// A real calendar date (2026-02-30 and 9999-99-99 are rejected).
const isDay = (x: unknown) => {
  if (x === null) return true;
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d; // any year: a wrong device clock must never cost a save
};
const SOUNDS: string[] = [...new Set(Object.values(ITEMS).map(i => i.snd))]; // every sound an item can make
const isWeight = (x: unknown) => isInt(x) && (x as number) <= 100;

function validClue(c: unknown): c is Clue {
  if (!isObj(c)) return false;
  if (Object.keys(c).some(k => k !== 'k' && k !== 'v')) return false;
  switch (c.k) {
    case 'snd': return typeof c.v === 'string' && SOUNDS.includes(c.v);
    case 'series': return isSeries(c.v);
    case 'rarity': return isRarity(c.v);
    case 'under': case 'over': return isWeight(c.v);
    default: return false;
  }
}
function validRequest(r: unknown): r is Request {
  if (!(isObj(r) && isResident(r.resident) && isBool(r.done) && Array.isArray(r.clues) && r.clues.length >= 1 && r.clues.length <= 4 && r.clues.every(validClue))) return false;
  const cl = r.clues as Clue[], ks = cl.map(c => c.k);
  if (new Set(ks).size !== ks.length) return false; // each kind of clue at most once
  const under = cl.find(c => c.k === 'under'), over = cl.find(c => c.k === 'over');
  return !(under && over && over.v >= under.v); // no clue pair that nothing could fit
}
function validTask(x: unknown): x is BoardTask {
  if (!isObj(x) || typeof x.kind !== 'string' || !Object.prototype.hasOwnProperty.call(TASK_NEED, x.kind) || !isResident(x.by) || !isBool(x.claimed)) return false;
  const kind = x.kind as TaskKind;
  if (x.need !== TASK_NEED[kind] || !isInt(x.got) || (x.got as number) > (x.need as number)) return false;
  if (x.claimed && x.got !== x.need) return false;
  if (kind === 'wish') return x.arg === null && validRequest({ resident: x.by, clues: x.clues, done: false });
  if (x.clues !== undefined) return false;
  if (kind === 'sound') return typeof x.arg === 'string' && SOUNDS.includes(x.arg);
  if (kind === 'series') return isSeries(x.arg);
  return x.arg === null;
}

/** Returns the save if it is well-formed, otherwise null. Older saves get safe defaults for fields added after they were written. */
export function sanitizeState(x: unknown): GameState | null {
  if (!isObj(x) || x.v !== 1) return null;
  if (![x.coins, x.shards, x.gems, x.nextId, x.lastMystery].every(isInt)) return null;
  if (!isDay(x.day)) return null;
  if (!Array.isArray(x.parcels) || x.parcels.length > 500 || !x.parcels.every(parcelShape)) return null;
  const parcels = x.parcels.filter(parcelKnown);
  const pity = x.pity;
  if (!isObj(pity) || !isInt(pity.sinceRare) || !isInt(pity.sinceEpic)) return null;
  const secretPity = cleanCounts(pity.secret, isSeries);
  if (!secretPity) return null;
  const owned = cleanCounts(x.owned, isItem);
  const hearts = cleanCounts(x.hearts, isResident);
  const shopTaps = cleanCounts(x.shopTaps, k => /^[a-z0-9]{1,20}$/.test(k));
  if (!owned || !hearts || !shopTaps) return null;
  const future = sanitizeFuture(x.future);
  // Unknown item ids go into the carry-over bag before cleanCounts drops them.
  for (const [k, v] of Object.entries(x.owned as Record<string, unknown>)) {
    if (isItem(k) || !FUTURE_ID.test(k) || !isInt(v)) continue;
    future.owned[k] = Math.max(future.owned[k] ?? 0, v);
  }
  // The starting series are always unlocked; a save without them would leave nothing to deliver or ask for.
  const unlocked = cleanIds(x.unlocked, SERIES_IDS);
  const completed = cleanIds(x.completed, SERIES_IDS);
  if (!unlocked || !completed || !CONFIG.startUnlocked.every(s => unlocked.includes(s))) return null;
  const keepUnknown = (v: unknown, target: string[]) => {
    if (!Array.isArray(v)) return;
    for (const id of v) if (typeof id === 'string' && FUTURE_ID.test(id) && !SERIES_IDS.includes(id) && !target.includes(id)) target.push(id);
  };
  keepUnknown(x.unlocked, future.unlocked);
  keepUnknown(x.completed, future.completed);
  // Ids in the bag that this build knows go back where they belong; the rest stay for a later build.
  for (const [k, v] of Object.entries(future.owned)) {
    if (isItem(k)) { owned[k] = Math.max(owned[k] ?? 0, v); delete future.owned[k]; }
  }
  for (const id of [...future.unlocked]) {
    if (!isSeries(id)) continue;
    if (!unlocked.includes(id)) unlocked.push(id);
    future.unlocked = future.unlocked.filter(x => x !== id);
  }
  for (const id of [...future.completed]) {
    if (!isSeries(id)) continue;
    if (!completed.includes(id)) completed.push(id);
    future.completed = future.completed.filter(x => x !== id);
  }
  const st = x.stats;
  if (!isObj(st) || !['opened', 'guessed', 'seriesRight', 'rarityRight', 'returned'].every(k => isInt(st[k]))) return null;
  if (![x.demoLuck, x.muted, x.introSeen].every(isBool)) return null;
  // The how-to guide arrived after the first saves. Existing players get a dot on the ? button, not a forced modal.
  const guideSeen = x.guideSeen === undefined ? false : x.guideSeen;
  if (!isBool(guideSeen)) return null;
  // Onboarding added in M1. A save from before it gets empty defaults; the UI marks long-time players as seen.
  const hintsSeen = x.hintsSeen === undefined ? [] : cleanIds(x.hintsSeen, HINT_IDS);
  if (!hintsSeen) return null;
  const fg = x.firstGoals === undefined ? { started: false, done: [], off: false } : x.firstGoals;
  if (!isObj(fg) || !isBool(fg.started) || !isBool(fg.off) || !Array.isArray(fg.done)) return null;
  const done = cleanIds(fg.done, FIRST_GOAL_IDS);
  if (!done) return null;
  const firstGoals = { started: fg.started as boolean, done: done as FirstGoalId[], off: fg.off as boolean };
  const dl = x.daily === undefined ? { day: null, guesses: [], played: [] } : x.daily;
  if (!isObj(dl) || !isDay(dl.day) || !Array.isArray(dl.guesses)) return null;
  const guesses = (dl.guesses as unknown[]).filter(isItem);
  if (guesses.length > CONFIG.dailyTries || new Set(guesses).size !== guesses.length) return null;
  const days = (v: unknown) => v === undefined ? [] : (Array.isArray(v) && v.length <= DAY_MEMORY && v.every(d => d !== null && isDay(d)) ? (v as string[]).slice() : null);
  const played = days(dl.played);
  if (!played) return null;
  // A save from before this field was added has already used today's delivery if it has a day.
  const deliveryDays = x.deliveryDays === undefined ? (x.day === null ? [] : [x.day]) : days(x.deliveryDays);
  if (!deliveryDays) return null;
  const ru = x.rush === undefined ? { day: null, result: null, played: [], owned: [], practice: undefined } : x.rush;
  if (!isObj(ru) || !isDay(ru.day)) return null;
  const rr = ru.result;
  const validResult = (r: unknown): r is RushResult => isObj(r) && ['score', 'grade', 'opened', 'correct'].every(k => isInt(r[k])) && (r.grade as number) <= 3 && isBool(r.win);
  if (!(rr === null || validResult(rr))) return null;
  if (!Array.isArray(ru.owned) || ru.owned.length > 100 || !ru.owned.every(o => typeof o === 'string' && isRushItem(o)) || new Set(ru.owned).size !== ru.owned.length) return null;
  const rushPlayed = days(ru.played);
  if (!rushPlayed) return null;
  const bd = x.board === undefined ? { day: null, tasks: [], made: [], bonus: false, stamps: 0 } : x.board;
  if (!isObj(bd) || !isDay(bd.day) || !isBool(bd.bonus) || !isInt(bd.stamps) || !Array.isArray(bd.tasks) || bd.tasks.length > CONFIG.board.tasks) return null;
  // A task that names an id from a newer build (or any other bad task) is dropped; the rest of the board stays.
  const boardTasks = bd.tasks.filter(validTask) as BoardTask[];
  const jobKinds = boardTasks.filter(k => k.kind !== 'wish').map(k => k.kind);
  if (new Set(jobKinds).size !== jobKinds.length) return null;
  if (boardTasks.filter(k => k.kind === 'wish').length > CONFIG.requestsPerDay) return null;
  const boardMade = days(bd.made);
  if (!boardMade) return null;
  // Letters replaced requests (step 1b). A save that still has requests gets today's letters again on load:
  // its board day is forgotten, so the next refresh pays what the old board owed and posts new letters.
  const oldRequests = x.requests !== undefined;
  const boardDay = oldRequests ? null : bd.day as string | null;
  const boardDays = oldRequests ? boardMade.filter(d => d !== bd.day) : boardMade;
  const tw = x.town === undefined ? null : x.town;
  const isGift = (g: unknown) => typeof g === 'string' && /^\d{4}-\d{2}-\d{2}\|[a-z]{1,12}$/.test(g) && isDay(g.slice(0, 10)) && isResident(g.slice(11));
  // A newer build may have more levels. Clamp to the last level this build knows instead of rejecting the save:
  // the level is recomputed from reputation anyway, so the player keeps all progress.
  if (tw !== null && !(isObj(tw) && isInt(tw.rep) && isInt(tw.level) && (tw.level as number) >= 1 &&
    Array.isArray(tw.gifts) && tw.gifts.length <= 60 && Array.isArray(tw.known) && isDay(tw.xrayDay))) return null;
  // Gifts and favourite-gift records that name an unknown resident are dropped, not the whole town.
  const gifts = tw ? Array.from(new Set((tw.gifts as unknown[]).filter(isGift) as string[])) : [];
  const known = tw ? Array.from(new Set((tw.known as unknown[]).filter(isResident) as string[])) : [];
  // A save from before town levels starts at the level its progress has already earned, without a level-up flood.
  const bootRep = tw ? 0 : bootstrapRep({ stats: st as unknown as GameState['stats'], hearts, completed, daily: { played }, rush: { played: rushPlayed } });
  // Street repairs: a save from before the street counts what its reputation already paid for, so nothing floods in.
  const repNow = tw ? tw.rep as number : bootRep;
  const street = tw && isInt(tw.street) && (tw.street as number) <= STREET_STEPS.length ? Math.min(tw.street as number, streetBuilt(repNow)) : streetBuilt(repNow);
  const town = tw
    ? { rep: tw.rep as number, level: Math.min(tw.level as number, CONFIG.townLevels.length), gifts, known, xrayDay: tw.xrayDay as string | null, street }
    : { rep: bootRep, level: levelFor(bootRep), gifts: [], known: [], xrayDay: null, street };
  // Rebuilt from known fields only, so nothing extra in a save rides along into these blocks.
  const daily = { day: dl.day, guesses, played };
  const result = rr === null ? null : { score: rr.score, grade: rr.grade, opened: rr.opened, correct: rr.correct, win: rr.win };
  // Practice counters are new: a missing or bad value starts only this counter over.
  const rp = ru.practice;
  const practice = isObj(rp) && isDay(rp.day) && isInt(rp.paid)
    ? { day: rp.day as string | null, paid: Math.min(CONFIG.rushPractice.paidPerDay, rp.paid as number) }
    : defaultPractice();
  const rush = { day: ru.day, result, played: rushPlayed, owned: (ru.owned as string[]).slice(), practice };
  const board: BoardSave = { day: boardDay, made: boardDays, bonus: bd.bonus as boolean, stamps: bd.stamps as number,
    tasks: boardTasks.map(k => ({ kind: k.kind, by: k.by, need: k.need, got: k.got, arg: k.arg, claimed: k.claimed,
      ...(k.clues ? { clues: k.clues.map(c => ({ k: c.k, v: c.v }) as Clue) } : {}) })) };
  // Station Week never costs the rest of the save: a broken record starts over, a run that no longer replays is dropped.
  const wk = x.week;
  const weekRewarded = isObj(wk) ? days(wk.rewarded) : null;
  const emptyWeekEvent = (): WeekEventSave => ({ week: null, claimed: 0, best: 0, bestSold: 0, plays: 0, seen: 0 });
  const weekEvent = (o: unknown): WeekEventSave => isObj(o) && isDay(o.week) && isInt(o.claimed) && (o.claimed as number) <= 7
    && isInt(o.best) && (o.best as number) <= 3 && isInt(o.bestSold) && isInt(o.plays)
    ? { week: o.week as string | null, claimed: o.claimed as number, best: o.best as number, bestSold: o.bestSold as number, plays: o.plays as number,
        seen: typeof o.seen === 'number' && Number.isFinite(o.seen) && o.seen >= 0
          ? Math.min(Math.floor(o.seen), Number.MAX_SAFE_INTEGER) : 0 }
    : emptyWeekEvent();
  const week: WeekSave = isObj(wk) && weekRewarded && isInt(wk.best) && (wk.best as number) <= 3 && isInt(wk.wins) && isInt(wk.played)
    ? { run: null, rewarded: weekRewarded, best: wk.best as number, wins: wk.wins as number, played: wk.played as number,
        marks: isInt(wk.marks) ? wk.marks as number : 0, levels: weekLevels(wk.levels), event: weekEvent(wk.event) }
    : { run: null, rewarded: [], best: 0, wins: 0, played: 0, marks: 0, levels: { hands: 0, shelves: 0, eye: 0 }, event: emptyWeekEvent() };
  const wr = isObj(wk) ? wk.run : null;
  const wrMods = isObj(wr) ? weekMods(wr.mods) : { ...ZERO_MODS };
  if (isObj(wr) && isInt(wr.seed) && Array.isArray(wr.log) && wr.log.length <= RUN_LOG_MAX && wr.log.every(a => typeof a === 'string') && replay(wr.seed as number, wr.log as string[], wrMods)) {
    week.run = { seed: wr.seed as number, log: (wr.log as string[]).slice(), mods: wrMods };
  }
  // Play counters never cost the rest of the save: anything malformed starts the counters over.
  const mt = x.metrics;
  const validDay = (r: unknown): r is MetricDay => isObj(r) && typeof r.d === 'string' && isDay(r.d) && r.d !== null && isInt(r.o) && isInt(r.g) && (r.g as number) <= (r.o as number) && (r.dl === 0 || r.dl === 1 || r.dl === 2) && isInt(r.sh);
  const sortedDays = (a: MetricDay[]) => a.every((r, i) => i === 0 || a[i - 1].d < r.d);
  const metrics: MetricsSave = isObj(mt) && (mt.first === null || (typeof mt.first === 'string' && isDay(mt.first))) && Array.isArray(mt.days) && mt.days.length <= METRIC_DAYS && mt.days.every(validDay) && sortedDays(mt.days as MetricDay[])
    ? { first: mt.first as string | null, days: (mt.days as MetricDay[]).map(r => ({ d: r.d, o: r.o, g: r.g, dl: r.dl, sh: r.sh })) }
    : { first: null, days: [] };
  // This week's story never costs the rest of the save either: anything malformed starts the week over.
  const so = x.story;
  const isStory = (v: unknown) => typeof v === 'string' && STORY_IDS.includes(v);
  const story: StorySave = isObj(so) && isDay(so.week) && (so.id === null || isStory(so.id)) &&
    isInt(so.pages) && (so.pages as number) <= PAGE_CAP && isInt(so.read) && (so.read as number) <= CONFIG.story.chapters && isBool(so.finished) &&
    Array.isArray(so.keep) && so.keep.length <= STORY_IDS.length && so.keep.every(isStory) && new Set(so.keep).size === so.keep.length
    ? { week: so.week as string | null, id: so.id as string | null, pages: so.pages as number, read: so.read as number, finished: so.finished as boolean, keep: (so.keep as string[]).slice() }
    : { ...emptyStory(), keep: isObj(so) && Array.isArray(so.keep) ? [...new Set((so.keep as unknown[]).filter(isStory) as string[])] : [] };
  // Social counters: anything malformed starts them over (the server keeps the real carry and board records).
  const so2 = x.social;
  const social: SocialSave = isObj(so2) && isDay(so2.carryDay) && isBool(so2.carryReady) && isInt(so2.sent) && isInt(so2.got) &&
    isDay(so2.guildWeek) && isInt(so2.guildPaid) && (so2.guildPaid as number) <= CONFIG.social.guildGoals.length
    ? { carryDay: so2.carryDay as string | null, carryReady: so2.carryReady as boolean, sent: so2.sent as number, got: so2.got as number, guildWeek: so2.guildWeek as string | null, guildPaid: so2.guildPaid as number }
    : emptySocial();
  const rest: Record<string, unknown> = { ...x };
  delete rest.requests;
  const quests = sanitizeQuests(x.quests);
  const checkin = sanitizeCheckin(x.checkin);
  const streak = sanitizeStreak(x.streak);
  const decor = sanitizeDecor(x.decor);
  // Decor ids from a newer build ride along too; known ones come back to this build's shelf.
  if (isObj(x.decor) && Array.isArray(x.decor.owned)) {
    for (const id of x.decor.owned) if (typeof id === 'string' && FUTURE_ID.test(id) && !DECOR_IDS.has(id) && !future.decor.includes(id)) future.decor.push(id);
  }
  for (const id of [...future.decor]) {
    if (!DECOR_IDS.has(id)) continue;
    if (!decor.owned.includes(id)) decor.owned.push(id);
    future.decor = future.decor.filter(x => x !== id);
  }
  return { ...rest, parcels, pity: { ...pity, secret: secretPity }, owned, future: trimFuture(future), hearts, shopTaps, unlocked, completed,
    guideSeen, hintsSeen, firstGoals, deliveryDays, daily, rush, town, board, quests, checkin, streak, decor, week, metrics, story, social } as unknown as GameState;
}
