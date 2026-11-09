// This week's story (docs/design-v2.md §14): every Monday one neighbor who has moved in starts a five-chapter story.
// Chapter 1 is there at once; every finished letter of the day (job or wish) is a page, and every two pages open the
// next chapter. The last chapter pays shards and reputation and puts the story's keepsake on the shelf for good.
// A new week starts a new story; pages never carry over and nothing is lost by missing a week.
import { CONFIG } from './config';
import { localDay, townLevel } from './logic';
import type { GameState, StorySave } from './types';

export interface Story { id: string; resident: string; keep: string }

/** Two stories per resident. keep: the keepsake shown on the shelf once the story is finished. */
export const STORIES: readonly Story[] = [
  { id: 'potluck', resident: 'okafor', keep: '🥘' },
  { id: 'oven', resident: 'theo', keep: '🍞' },
  { id: 'route', resident: 'dube', keep: '📒' },
  { id: 'race', resident: 'lena', keep: '🔔' },
  { id: 'sock', resident: 'twins', keep: '🧦' },
  { id: 'seeds', resident: 'rosa', keep: '🌻' },
  { id: 'stall', resident: 'ines', keep: '🍐' },
  { id: 'visit', resident: 'okafor', keep: '🚂' },
  { id: 'contest', resident: 'theo', keep: '🎀' },
  { id: 'penpal', resident: 'dube', keep: '✉️' },
  { id: 'tandem', resident: 'lena', keep: '🚲' },
  { id: 'washday', resident: 'twins', keep: '🧷' },
  { id: 'bees', resident: 'rosa', keep: '🍯' },
  { id: 'night', resident: 'ines', keep: '🏮' },
];
export const STORY_IDS = STORIES.map(s => s.id);
export const storyById = (id: string | null) => STORIES.find(s => s.id === id) || null;

const WEEK_MS = 7 * 86400000;
const EPOCH = Date.UTC(2026, 0, 5); // a Monday

/** The Monday (local date) of the week that `now` falls in. */
export function weekOf(now: number): string {
  const d = new Date(now);
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7));
}
function weekIndex(week: string): number {
  const [y, m, d] = week.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / WEEK_MS);
}

export const emptyStory = (): StorySave => ({ week: null, id: null, pages: 0, read: 0, finished: false, keep: [] });

/** The story for a week: neighbors who live here, stories not finished yet first, rotating by week. */
export function pickStory(state: GameState, week: string): Story | null {
  const lv = townLevel(state);
  const here = STORIES.filter(s => (CONFIG.residents.find(r => r.id === s.resident)?.lv ?? 99) <= lv);
  const fresh = here.filter(s => !state.story.keep.includes(s.id));
  const pool = fresh.length ? fresh : here;
  if (!pool.length) return null;
  const i = weekIndex(week);
  return pool[((i % pool.length) + pool.length) % pool.length];
}

/** Starts this week's story the first time it is asked for in a new week. Returns true when it changed. */
export function refreshStory(state: GameState, now: number): boolean {
  const week = weekOf(now);
  if (state.story.week === week) return false;
  const s = pickStory(state, week);
  state.story = { week, id: s ? s.id : null, pages: 0, read: 0, finished: false, keep: state.story.keep };
  return true;
}

export const PAGE_CAP = (CONFIG.story.chapters - 1) * CONFIG.story.pagesPerChapter;
/** Chapters open so far (1..chapters), or 0 when there is no story this week. */
export function chaptersOpen(st: StorySave): number {
  if (!st.id) return 0;
  return Math.min(CONFIG.story.chapters, 1 + Math.floor(st.pages / CONFIG.story.pagesPerChapter));
}
export function unread(st: StorySave): number { return Math.max(0, chaptersOpen(st) - st.read); }
/** Pages still needed for the next chapter, or null when the story is complete. */
export function pagesToNext(st: StorySave): number | null {
  const n = chaptersOpen(st);
  return n >= CONFIG.story.chapters ? null : n * CONFIG.story.pagesPerChapter - st.pages;
}

export interface StoryProgress { opened: number; finished: { shards: number; rep: number; keep: string } | null }

/** Writes pages for finished letters. Returns the chapters that just opened and the reward when the story ends. */
export function addPages(state: GameState, n: number, now: number): StoryProgress {
  refreshStory(state, now);
  const st = state.story, out: StoryProgress = { opened: 0, finished: null };
  if (!st.id || st.finished || n <= 0) return out;
  const before = chaptersOpen(st);
  st.pages = Math.min(PAGE_CAP, st.pages + n);
  out.opened = chaptersOpen(st) - before;
  if (chaptersOpen(st) === CONFIG.story.chapters) {
    st.finished = true;
    if (!st.keep.includes(st.id)) st.keep = st.keep.concat(st.id);
    state.shards += CONFIG.story.shards;
    state.town.rep += CONFIG.story.rep;
    out.finished = { shards: CONFIG.story.shards, rep: CONFIG.story.rep, keep: storyById(st.id)!.keep };
  }
  return out;
}

/** The player has read every open chapter. */
export function markRead(state: GameState): void { state.story.read = chaptersOpen(state.story); }
