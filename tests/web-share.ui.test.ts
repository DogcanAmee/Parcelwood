// @vitest-environment jsdom
// The daily share button must call the platform's ShareService object (Web Share on phones, clipboard on desktop).
import { afterEach, describe, expect, it } from 'vitest';
import { newState } from '../src/core/logic';
import { startApp } from '../src/ui/app';
import { WEB_FEATURES, type Platform, type ShareService } from '../src/platform/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { await new Promise(r => setTimeout(r, 20)); };
let stop: (() => void) | null = null;

function boot(share?: ShareService) {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  const { platform, box } = fakePlatform('ok');
  const now = Date.now();
  const s = newState(now);
  s.introSeen = true;
  s.guideSeen = true;
  s.stats.opened = 1;
  s.town.level = 2;
  s.town.rep = 1;
  box.saved = s;
  const web: Platform = { ...platform, features: WEB_FEATURES, share };
  stop = startApp(web, false);
  return { box };
}

afterEach(() => { if (stop) { stop(); stop = null; } });

describe('daily share', () => {
  it('calls the platform ShareService with the result text', async () => {
    const calls: { text: string; url?: string }[] = [];
    const share: ShareService = { async share(text, url) { calls.push({ text, url }); return 'sent'; } };
    boot(share);
    click($('.nav [data-view="town"]'));

    for (let i = 0; i < 3; i++) {
      const card = document.querySelector('#daily [data-dpeek]:not([disabled])');
      if (!card) break;
      click(card);
      await flush();
      click($('#modal-root [data-daily]'));
      await flush();
    }
    expect($('#daily-share')).not.toBeNull();
    click($('#daily-share'));
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('Parcelwood');
    expect(calls[0].url).toBeTruthy();
  });
});
