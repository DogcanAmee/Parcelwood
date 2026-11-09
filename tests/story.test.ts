import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';
import { PAGE_CAP, STORIES, addPages, chaptersOpen, markRead, pagesToNext, pickStory, refreshStory, unread, weekOf } from '../src/core/story';
import { STORY_UI } from '../src/i18n/story';

const MON = new Date(2026, 10, 2, 9, 0, 0).getTime(); // Monday 2 Nov 2026
const DAY = 86400000;

describe('this week\'s story', () => {
  it('a week starts on Monday, local time', () => {
    expect(weekOf(MON)).toBe('2026-11-02');
    expect(weekOf(MON + 6 * DAY)).toBe('2026-11-02'); // Sunday
    expect(weekOf(MON + 7 * DAY)).toBe('2026-11-09');
    expect(weekOf(new Date(2026, 10, 1, 23, 59).getTime())).toBe('2026-10-26');
  });

  it('only picks a neighbor who has moved in, and stories not finished yet first', () => {
    const s = newState(MON);
    for (let w = 0; w < 20; w++) {
      const st = pickStory(s, weekOf(MON + w * 7 * DAY))!;
      expect(['okafor', 'theo']).toContain(st.resident); // Lv1 town
    }
    const lv1 = ['potluck', 'oven', 'visit', 'contest'];
    s.story.keep = ['potluck', 'oven', 'visit'];
    for (let w = 0; w < 10; w++) expect(pickStory(s, weekOf(MON + w * 7 * DAY))!.id).toBe('contest');
    s.story.keep = lv1;
    expect(lv1).toContain(pickStory(s, '2026-11-02')!.id); // everything read: the rotation starts over
    s.town.rep = CONFIG.townLevels[5];
    for (let w = 0; w < 10; w++) expect(lv1).not.toContain(pickStory(s, weekOf(MON + w * 7 * DAY))!.id);
    expect(STORIES).toHaveLength(CONFIG.residents.length * 2);
    for (const r of CONFIG.residents) expect(STORIES.filter(x => x.resident === r.id)).toHaveLength(2);
  });

  it('opens chapter 1 at once and one more chapter every two finished letters', () => {
    const s = newState(MON);
    expect(refreshStory(s, MON)).toBe(true);
    expect(refreshStory(s, MON + DAY)).toBe(false);
    expect(chaptersOpen(s.story)).toBe(1);
    expect(unread(s.story)).toBe(1);
    expect(pagesToNext(s.story)).toBe(CONFIG.story.pagesPerChapter);
    expect(addPages(s, 1, MON).opened).toBe(0);
    expect(addPages(s, 1, MON).opened).toBe(1);
    expect(chaptersOpen(s.story)).toBe(2);
    markRead(s);
    expect(unread(s.story)).toBe(0);
    expect(addPages(s, 3, MON).opened).toBe(1);
    expect(unread(s.story)).toBe(1);
  });

  it('pays the end of the story once and keeps the keepsake', () => {
    const s = newState(MON);
    const shards = s.shards, rep = s.town.rep;
    const p = addPages(s, 50, MON);
    expect(p.opened).toBe(CONFIG.story.chapters - 1);
    expect(p.finished).toEqual({ shards: CONFIG.story.shards, rep: CONFIG.story.rep, keep: STORIES.find(x => x.id === s.story.id)!.keep });
    expect(s.story.pages).toBe(PAGE_CAP);
    expect(s.shards).toBe(shards + CONFIG.story.shards);
    expect(s.town.rep).toBe(rep + CONFIG.story.rep);
    expect(s.story.keep).toEqual([s.story.id]);
    expect(addPages(s, 5, MON + DAY)).toEqual({ opened: 0, finished: null });
    expect(s.shards).toBe(shards + CONFIG.story.shards);
  });

  it('a new week brings a new story; pages start over and keepsakes stay', () => {
    const s = newState(MON);
    addPages(s, 50, MON);
    const first = s.story.id;
    addPages(s, 1, MON + 7 * DAY);
    expect(s.story.week).toBe('2026-11-09');
    expect(s.story.id).not.toBe(first);
    expect(s.story.pages).toBe(1);
    expect(s.story.finished).toBe(false);
    expect(s.story.keep).toEqual([first]);
  });

  it('loads saves without a story, keeps real ones and starts a broken one over without losing keepsakes', () => {
    const s: any = JSON.parse(JSON.stringify(newState(MON)));
    delete s.story;
    expect(sanitizeState(s)!.story).toEqual({ week: null, id: null, pages: 0, read: 0, finished: false, keep: [] });
    const good = { week: '2026-11-02', id: 'oven', pages: 4, read: 2, finished: false, keep: ['potluck'] };
    expect(sanitizeState({ ...s, story: good })!.story).toEqual(good);
    for (const bad of [{ ...good, id: '<b>' }, { ...good, pages: PAGE_CAP + 1 }, { ...good, week: 'monday' }, { ...good, read: 9 }, { ...good, junk: 1, pages: -1 }, 'x']) {
      const out = sanitizeState({ ...s, story: bad });
      expect(out).not.toBeNull();
      expect(out!.story.pages).toBe(0);
    }
    expect(sanitizeState({ ...s, story: { ...good, pages: 99, keep: ['potluck', 'nope', 'potluck'] } })!.story.keep).toEqual(['potluck']);
    expect(sanitizeState({ ...s, story: { ...good, keep: STORIES.map(x => x.id) } })!.story.keep).toHaveLength(STORIES.length);
    expect(sanitizeState({ ...s, story: { ...good, extra: '<img>' } }) as any).not.toHaveProperty('story.extra');
  });

  it('every story has a title, five chapters and a keepsake name in every language', () => {
    for (const l of ['en', 'zh', 'es'] as const) {
      expect(Object.keys(STORY_UI[l]).sort()).toEqual(Object.keys(STORY_UI.en).sort());
      for (const st of STORIES) {
        const [title, chapters, keep] = STORY_UI[l].storyTexts[st.id];
        expect(title.length).toBeGreaterThan(0);
        expect(chapters).toHaveLength(CONFIG.story.chapters);
        expect(keep.length).toBeGreaterThan(0);
      }
    }
  });
});
