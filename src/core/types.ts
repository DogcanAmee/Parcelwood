// Shared game types. Core code must not touch the DOM, storage or any platform API.

export type Rarity = 'common' | 'rare' | 'epic' | 'secret';
/** One-time feature tips. Each id is shown once and then remembered in the save. */
export const HINT_IDS = ['town', 'album', 'shop', 'daily', 'rush', 'week'] as const;
export type HintId = typeof HINT_IDS[number];
/** The three short goals after the first reveal: guess a series, return a lost parcel, visit Town. */
export const FIRST_GOAL_IDS = ['series', 'return', 'town'] as const;
export type FirstGoalId = typeof FIRST_GOAL_IDS[number];
export interface FirstGoals { started: boolean; done: FirstGoalId[]; off: boolean }
export type RarityTable = Record<Rarity, number>;
export type ParcelKind = 'normal' | 'mystery';
export type Sound = 'rustle' | 'thud' | 'slosh' | 'clack' | 'squeak' | 'clank' | 'chime' | 'jingle';

export interface ItemDef {
  id: string;
  img?: string;
  name: string;
  e: string; // emoji fallback
  r: Rarity;
  snd: Sound;
  w: [number, number]; // weight range in oz
  note: string;
}

export interface Item extends ItemDef {
  series: string;
}

export interface SeriesDef {
  id: string;
  name: string;
  color: string;
  postmark: string;
  shop: string;
  items: ItemDef[];
}

export interface Resident {
  id: string;
  name: string;
  story: string;
  tales: [string, string, string]; // short stories unlocked by hearts (see TALE_HEARTS)
  lv: number; // town level at which this resident moves in
  like: Sound; // favourite kind of gift, found out by giving spares
}

export type TownFeature = 'requests' | 'urgent' | 'events' | 'rush' | 'anon';
export type TownEvent = 'rain' | 'powercut' | 'moving';

/** A fixed spot on the station front for a decoration display model. */
export type DecorSlot = 'sky' | 'hill-l' | 'hill-r' | 'awn-l' | 'awn-r' | 'front-1' | 'front-2' | 'front-3' | 'front-4' | 'front-5' | 'front-2b' | 'front-3b' | 'sign-top' | 'wall-r';

/** One decoration in the shop at a fixed spot, opened at a town level. Exactly one of `item` (a display copy of
 *  an album item, so its picture and name come from ITEMS) or `img` (the decoration's own picture) is set. */
export interface DecorDef { id: string; item?: string; img?: string; slot: DecorSlot; lv: number; price: number }

/** Correct-guess streak. n: right series guesses in a row; best: the highest n ever reached. */
export interface StreakSave { n: number; best: number }

/** Bought decorations. owned: ids bought; hidden: owned ids put away, a subset of owned. */
export interface DecorSave { owned: string[]; hidden: string[] }

/** Ids written by a newer build that this build does not know. Cleanup keeps them here, and a later build
 *  moves the ids it knows back into owned/unlocked/completed/decor. Nothing else reads this field. */
export interface FutureSave {
  owned: Record<string, number>;
  unlocked: string[];
  completed: string[];
  decor: string[];
}

export interface GameConfig {
  shelfSize: number;
  odds: RarityTable;
  demoOdds: RarityTable;
  mysteryOdds: RarityTable;
  pity: { rareEvery: number; epicEvery: number; secretSoftStart: number; secretSoftStep: number; secretHard: number };
  mysteryEveryMs: number;
  mysteryMax: number;
  coinsPerOpen: RarityTable;
  recycle: RarityTable;
  exchange: Record<Rarity, number | null>;
  guessReward: { series: number; rarity: number };
  xrayCost: number;
  returnReward: number;
  completeReward: number;
  requestCoins: number;
  requestBonusShards: number;
  requestsPerDay: number;
  taleHearts: [number, number, number];
  dailyTries: number;
  dailyReward: number[];
  dailyFailReward: number;
  dailyEpoch: string;
  insuredChance: RarityTable;
  stickerChance: number;
  postmarkClearChance: number;
  series: SeriesDef[];
  startUnlocked: string[];
  residents: Resident[];
  townLevels: number[];
  townFeatures: Record<TownFeature, number>;
  weekLevel: number;
  weekEvent: { coinsFinish: number; coinsWin: number; shardsWin: number; shardsThree: number };
  rushPractice: { coinsPerStar: number; paidPerDay: number };
  seriesLevels: Record<string, number>;
  rep: { open: number; guess: number; ret: number; anon: number; anonMiss: number; request: number; gift: number; giftFav: number; daily: number; dailyLost: number; urgent: number; complete: number; rush: number };
  urgentMs: number;
  urgentBonus: number;
  anonBonus: number;
  anonChance: number;
  anonChancePowercut: number;
  movingBonus: number;
  perkHearts: number;
  theoCoins: number;
  lenaMysteryMs: number;
  board: { tasks: number; coins: number; rep: number; bonusShards: number; bonusRep: number };
  quests: { coins: number; rep: number; bonusShards: number; bonusLost: number; guessNeed: number };
  checkin: { card: number; coins: number; bigParcels: number; bigShards: number };
  // Correct series guesses in a row pay coins on a growing curve, capped; milestones get a neighbour line.
  streak: { step: number; cap: number; milestones: number[]; every: number };
  // Decoration shop: display models of album items shown on the station front. Coins only.
  decor: { foundOff: number; items: DecorDef[] };
  story: { chapters: number; pagesPerChapter: number; shards: number; rep: number };
  social: { carryShards: number; guildGoals: number[]; guildShards: number };
}

export interface Parcel {
  id: number;
  kind: ParcelKind;
  series: string;
  rolled: boolean;
  item: string | null;
  rarity: Rarity | null;
  weight: number | null;
  insured: boolean | null;
  sticker: boolean;
  postmarkClear: boolean;
  used: { shake: boolean; weigh: boolean; look: boolean; xray: boolean };
  guess: { series: string | null; rarity: Rarity | null };
  resident?: string;
  urgent?: number; // deadline (ms) of an urgent parcel for a named resident
  anon?: boolean; // no name on the label: the player works out who it is for
  misses?: number; // wrong guesses on an unnamed parcel
}

export interface GameState {
  v: 1;
  coins: number;
  shards: number;
  gems: number;
  day: string | null;
  nextId: number;
  lastMystery: number;
  parcels: Parcel[];
  pity: { sinceRare: number; sinceEpic: number; secret: Record<string, number> };
  owned: Record<string, number>;
  future: FutureSave;
  unlocked: string[];
  completed: string[];
  stats: { opened: number; guessed: number; seriesRight: number; rarityRight: number; returned: number };
  hearts: Record<string, number>;
  demoLuck: boolean;
  shopTaps: Record<string, number>;
  muted: boolean;
  introSeen: boolean;
  guideSeen: boolean;
  // Onboarding after TAO-25: feature tips that were shown once, and the three short goals after the first parcel.
  hintsSeen: HintId[];
  firstGoals: FirstGoals;
  // Recent days whose morning delivery already ran, so moving the clock back can't refill the shelf.
  deliveryDays: string[];
  // played: recent days that already had a puzzle, so moving the clock can't repeat it.
  daily: { day: string | null; guesses: string[]; played: string[] };
  rush: RushSave;
  town: TownSave;
  board: BoardSave;
  quests: QuestSave;
  checkin: CheckinSave;
  streak: StreakSave;
  decor: DecorSave;
  week: WeekSave;
  metrics: MetricsSave;
  story: StorySave;
  social: SocialSave;
}

/** Discord social (src/core/social.ts). carryDay: the day a carry parcel was last earned. sent/got: parcels carried
 *  out and in. guildWeek/guildPaid: the week of the server board and how many of its goals were paid. */
export interface SocialSave { carryDay: string | null; carryReady: boolean; sent: number; got: number; guildWeek: string | null; guildPaid: number }

/** This week's story (src/core/story.ts). week: its Monday. pages: finished letters this week. read: chapters seen.
 *  keep: stories ever finished (their keepsakes stay on the shelf). */
export interface StorySave { week: string | null; id: string | null; pages: number; read: number; finished: boolean; keep: string[] }

/** One day of play counters (src/core/metrics.ts). */
export interface MetricDay { d: string; o: number; g: number; dl: 0 | 1 | 2; sh: number }
export interface MetricsSave { first: string | null; days: MetricDay[] }

export type LedgerId = 'hands' | 'shelves' | 'eye';
export type WeekLedger = Record<LedgerId, number>;

/** Permanent Station Week upgrades. Snapshotted into a run at its start so replay stays deterministic. */
export interface WeekMods {
  ap: number;       // extra action points each day
  storage: number;  // extra crates that can wait overnight
  checks: number;   // free basic checks each day (X-ray excluded)
  coins: number;    // +10 starting coins per point, for an extra stamp reroll
  keen: number;     // 1: postmarks never smudge
}

/** The weekly event record. week: the Monday of the week it belongs to. claimed: bit mask of the three
 *  weekend reward tiers already paid (1 finish, 2 win, 4 three stars). best/bestSold: the week's best result.
 *  plays: finished runs inside the weekend window. seen: the latest device time this record has accepted, so a
 *  clock moved back cannot open an old weekend again. */
export interface WeekEventSave { week: string | null; claimed: number; best: number; bestSold: number; plays: number; seen: number }

/** Station Week: run = the run in progress as its seed and action log (rebuilt by replaying the rules),
 *  with the upgrades it started under. rewarded: recent days whose first finished run already paid marks.
 *  best: best grade (0..3). marks: ledger marks; levels: permanent upgrade tiers. event: this week's event. */
export interface WeekSave {
  run: { seed: number; log: string[]; mods?: WeekMods } | null;
  rewarded: string[];
  best: number;
  wins: number;
  played: number;
  marks: number;
  levels: WeekLedger;
  event: WeekEventSave;
}

/** What a town board task asks for. open/guess/sound/series happen at the counter; the rest out in town. */
/** 'request' only appears on boards saved before letters replaced requests (docs/design-v2.md, step 1b). */
export type TaskKind = 'open' | 'guess' | 'sound' | 'series' | 'return' | 'gift' | 'daily' | 'request' | 'rush' | 'wish';

/** One of today's letters. by: the resident who wrote it. arg: the sound or series it names.
 *  clues: only on a 'wish' letter, the riddle a spare item must fit. */
export interface BoardTask { kind: TaskKind; by: string; need: number; got: number; arg: string | null; claimed: boolean; clues?: Clue[] }

/** Today's town board. made: recent days that already had a board, so moving the clock can't repost one.
 *  bonus: the full-board stamp was given today. stamps: full boards over all time. */
export interface BoardSave { day: string | null; tasks: BoardTask[]; made: string[]; bonus: boolean; stamps: number }

/** Town level progress. rep: reputation earned. street: repairs announced. level: highest level already announced. gifts: "day|resident" gifts given. known: residents whose favourite gift was found. xrayDay: day Mr. Dube's free X-ray was used. */
export interface TownSave {
  rep: number;
  level: number;
  gifts: string[];
  known: string[];
  xrayDay: string | null;
  /** Parcel Street repairs already announced (src/core/street.ts). */
  street: number;
}

/** Result of one Rush Hour shift. */
export interface RushResult { score: number; grade: number; opened: number; correct: number; win: boolean }

/** Rush Hour progress. day/result: today's official shift (the first one started that day). played: days whose official shift already started. owned: limited keepsakes. practice: the day and how many paid practice shifts were used. */
export interface RushSave {
  day: string | null;
  result: RushResult | null;
  played: string[];
  owned: string[];
  practice: { day: string | null; paid: number };
}

/** What a daily task asks for. */
export type QuestKind = 'guess' | 'return' | 'rush' | 'daily';

/** One of today's three fixed daily tasks. */
export interface QuestTask { kind: QuestKind; need: number; got: number; claimed: boolean }

/** Today's daily tasks. A new list is made on the first start or tick of a new day. */
export interface QuestSave { day: string | null; list: QuestTask[]; bonus: boolean }

/** The check-in card. stamps 0..(card-1); cards: how many cards were finished. */
export interface CheckinSave { last: string | null; stamps: number; cards: number }

/** One line of a resident's riddle. under/over are weights in oz. */
export type Clue =
  | { k: 'snd'; v: Sound }
  | { k: 'series'; v: string }
  | { k: 'rarity'; v: Rarity }
  | { k: 'under'; v: number }
  | { k: 'over'; v: number };

/** A resident's request: any spare item that fits every clue is accepted. */
export interface Request { resident: string; clues: Clue[]; done: boolean }

/** Random source returning a float in [0, 1). Math.random in the game, seeded in tests. */
export type Rng = () => number;
