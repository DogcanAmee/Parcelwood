// @vitest-environment jsdom
// This week's story on the Town page: claimed letters open chapters, the card shows them, the reader marks them read.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { refreshBoard } from '../src/core/board';
import { seeded } from '../src/core/daily';
import { fakePlatform, ROOTS } from './helpers';
import { STORY_UI } from '../src/i18n/story';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
  const s: any = newState(Date.now());
  s.introSeen = true; s.guideSeen = true;
  refreshBoard(s, Date.now(), seeded(1));
  s.board.tasks.forEach((x: any) => { if (x.kind !== 'wish') x.got = x.need; });
  delete s.story; // a save from before this feature
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('this week\'s story', () => {
  it('shows this week\'s story with chapter 1 open', () => {
    click($('[data-view="town"]'));
    expect($('#story')).not.toBeNull();
    expect(box.saved!.story.week).toBe('2026-11-02');
    expect(document.querySelectorAll('#story .story-dots i.on').length).toBe(1);
    expect($('#story .story-new')!.textContent).toBe('1');
  });

  it('two claimed letters open chapter 2, and reading clears the badge', () => {
    click($('[data-claim="0"]'));
    click($('[data-claim="1"]'));
    expect(box.saved!.story.pages).toBe(2);
    expect(document.querySelectorAll('#story .story-dots i.on').length).toBe(2);
    expect($('#story .story-new')!.textContent).toBe('2');
    click($('[data-story-read]'));
    const [, chapters] = STORY_UI.en.storyTexts[box.saved!.story.id!];
    expect($('#modal-root')!.textContent).toContain(chapters[1]);
    expect($('#modal-root')!.textContent).not.toContain(chapters[2]);
    expect(box.saved!.story.read).toBe(2);
    $('#modal-root')!.innerHTML = '';
    expect($('#story .story-new')).toBeNull();
  });

  it('explains the rules behind ⓘ', () => {
    click($('#story-help'));
    expect($('#modal-root')!.textContent).toContain('+' + CONFIG.story.shards);
    $('#modal-root')!.innerHTML = '';
  });
});
