// @vitest-environment jsdom
// The Station Week share button must pass the clean page address, never the preview's ?devlv and ?devday flags.
import { afterEach, describe, expect, it } from 'vitest';
import { startApp } from '../src/ui/app';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { weekOf } from '../src/core/story';
import type { ShareService } from '../src/platform/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { await new Promise(r => setTimeout(r, 20)); };
let stop: (() => void) | null = null;

afterEach(() => {
  if (stop) { stop(); stop = null; }
  window.history.replaceState({}, '', '/');
});

describe('station week share', () => {
  it('shares the clean page address without preview parameters', async () => {
    document.body.innerHTML = ROOTS;
    window.scrollTo = () => {};
    window.history.replaceState({}, '', '/?devlv=2&devday=3#week');
    const calls: { text: string; url?: string }[] = [];
    const share: ShareService = { async share(text, url) { calls.push({ text, url }); return 'sent'; } };
    const { platform, box } = fakePlatform('ok');
    const now = Date.now();
    const s = newState(now);
    s.introSeen = true;
    s.guideSeen = true;
    s.hintsSeen = ['week'];
    s.town.level = 4;
    s.town.rep = CONFIG.townLevels[3];
    s.week.event = { week: weekOf(now), claimed: 1, best: 1, bestSold: 12, plays: 1, seen: 0 };
    box.saved = s;
    stop = startApp({ ...platform, share }, false);

    click($('#week-share'));
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('Parcelwood');
    expect(calls[0].url).toBe(window.location.origin + window.location.pathname);
    expect(calls[0].url).not.toContain('devlv');
    expect(calls[0].url).not.toContain('devday');
  });
});
