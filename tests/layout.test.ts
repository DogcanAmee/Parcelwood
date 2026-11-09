// @vitest-environment jsdom
// Landscape layout hooks (CrazyGames, Discord, desktop): each page puts its main panels and side panels in the
// wrappers the landscape CSS turns into two columns. In portrait those wrappers are display:contents.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { newState } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
box.saved = newState(Date.now()); box.saved.introSeen = true; // a save with progress keeps every panel
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const go = (v: string) => (document.querySelector(`[data-view="${v}"]`) as HTMLElement).click();

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('landscape layout', () => {
  it('has no prototype label in the header, in any language', () => {
    expect($('.brand .tag')).toBeNull();
    for (const lang of ['en', 'zh', 'es']) {
      const sel = $('#lang') as HTMLSelectElement;
      sel.value = lang; sel.dispatchEvent(new Event('change', { bubbles: true }));
      expect($('header.top')!.textContent).not.toMatch(/prototype|prototipo|原型/i);
    }
    const sel = $('#lang') as HTMLSelectElement; sel.value = 'en'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });

  it('station: shelf in the main column, guarantees, Main Street and the town level on the side', () => {
    go('station');
    expect($('.cols .col-main .shelf')).not.toBeNull();
    expect($('.cols .col-side .street')).not.toBeNull();
    expect($('.cols .col-side .pity')).not.toBeNull();
    expect($('.cols .col-side #town-strip')).not.toBeNull();
  });

  it('town: board and daily parcel in the main column, street and town level on the side', () => {
    go('town');
    expect($('.cols .col-main #daily')).not.toBeNull();
    expect($('.cols .col-main .board-panel')).not.toBeNull();
    expect($('.cols .col-side .town-street .houses')).not.toBeNull();
    expect($('.cols .col-side #town-level')).not.toBeNull();
  });

  it('shop without a dev panel is a single centered column', () => {
    go('shop');
    expect($('.cols.solo .col-main #open-odds')).not.toBeNull();
    expect($('.col-side')).toBeNull();
  });

  it('inspect sheet: parcel on the left, tools and guesses on the right', () => {
    go('station');
    const p = box.saved!.parcels[0];
    (document.querySelector(`[data-parcel="${p.id}"]`) as HTMLElement).click();
    expect($('.sheet-cols .sheet-left #bigbox')).not.toBeNull();
    expect($('.sheet-cols .sheet-right .tools')).not.toBeNull();
    expect($('.sheet-cols .sheet-right #go-open')).not.toBeNull();
  });
});
