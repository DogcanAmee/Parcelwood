// @vitest-environment jsdom
// Rush Hour is no longer a web-only mode: the same button and overlay exist on the CrazyGames and
// Discord/platform builds from town Lv2.
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { localDay, newState } from '../src/core/logic';
import { startApp } from '../src/ui/app';
import { CRAZYGAMES_FEATURES } from '../src/platform/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { await new Promise(r => setTimeout(r, 600)); };
let stop: (() => void) | null = null;

function boot(id: 'web' | 'crazygames') {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  const { platform, box } = fakePlatform('ok');
  const now = Date.now();
  const s = newState(now);
  s.introSeen = true;
  s.town.rep = CONFIG.townLevels[1];
  s.town.level = 2;
  box.saved = s;
  stop = startApp(id === 'web' ? platform : { ...platform, id: 'crazygames', features: { ...CRAZYGAMES_FEATURES, ageGate: false }, ageGate: false }, false);
  return box;
}

afterEach(() => { if (stop) { stop(); stop = null; } });

describe('Rush Hour on every build', () => {
  it('CrazyGames at Lv2 shows the Rush button and opens the shift', async () => {
    const box = boot('crazygames');
    expect($('[data-view="rush"]')).not.toBeNull();
    click($('[data-view="rush"]'));
    await flush();
    expect(document.querySelector('.rh')).not.toBeNull();
    expect(box.saved!.town.rep).toBe(CONFIG.townLevels[1]);
    click(document.querySelector('[data-rh="exit"]'));
  });

  it('the Discord/web platform at Lv2 shows the Rush button and opens the shift', async () => {
    boot('web');
    expect($('[data-view="rush"]')).not.toBeNull();
    click($('[data-view="rush"]'));
    await flush();
    expect(document.querySelector('.rh')).not.toBeNull();
    click(document.querySelector('[data-rh="exit"]'));
  });

  it('a Lv1 save shows the Lv2 hint on an empty shelf instead of a working button', () => {
    document.body.innerHTML = ROOTS;
    window.scrollTo = () => {};
    const { platform, box } = fakePlatform('ok');
    const now = Date.now();
    const s = newState(now);
    s.introSeen = true;
    s.parcels = [];
    s.deliveryDays = [localDay(new Date(now))]; // keep the shelf empty for this check
    box.saved = s;
    stop = startApp(platform, false);
    expect($('[data-view="rush"]')).toBeNull();
    expect($('.rush-prompt.locked')).not.toBeNull();
    expect($('.rush-prompt')!.textContent).toContain('Lv2');
  });
});
