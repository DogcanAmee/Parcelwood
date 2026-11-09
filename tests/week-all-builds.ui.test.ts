// @vitest-environment jsdom
// Station Week is no longer web-only: the CrazyGames stage gets its own tab and the Discord/platform
// build shows the same station card, from town Lv4.
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { startApp } from '../src/ui/app';
import { CRAZYGAMES_FEATURES, DISCORD_FEATURES } from '../src/platform/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { await new Promise(r => setTimeout(r, 250)); };
let stop: (() => void) | null = null;

function boot(features = DISCORD_FEATURES) {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  const { platform, box } = fakePlatform('ok', undefined, features);
  const s = newState(Date.now());
  s.introSeen = true;
  s.town.rep = CONFIG.townLevels[3];
  s.town.level = 4;
  box.saved = s;
  stop = startApp(platform, false);
  return box;
}

afterEach(() => { if (stop) { stop(); stop = null; } });

describe('Station Week on every build', () => {
  it('CrazyGames at Lv4 has a Week tab that opens the mode', async () => {
    boot(CRAZYGAMES_FEATURES);
    const tab = $('[data-stagetab="station:week"]');
    expect(tab).not.toBeNull();
    click(tab);
    expect($('.week-card')).not.toBeNull();
    expect($('#week-open')).not.toBeNull();
    click($('#week-open'));
    await flush();
    expect(document.querySelector('.wk')).not.toBeNull();
    click(document.querySelector('.wk [data-w="exit"]'));
  });

  it('the Discord/platform build shows the station card and opens the mode', async () => {
    boot(DISCORD_FEATURES);
    expect($('.week-card')).not.toBeNull();
    click($('#week-open'));
    await flush();
    expect(document.querySelector('.wk')).not.toBeNull();
    click(document.querySelector('.wk [data-w="exit"]'));
  });
});
