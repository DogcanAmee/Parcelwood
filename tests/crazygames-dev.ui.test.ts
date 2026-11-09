// @vitest-environment jsdom
// The CrazyGames preview build has dev tools on. Its stage layout has no side column, so the dev panel
// needs its own Shop tab; otherwise QA cannot unlock items or move the day on that build.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { newState } from '../src/core/logic';
import { CRAZYGAMES_FEATURES, type AdResult, type AdService, type HostHooks } from '../src/platform/types';
import { fakePlatform, ROOTS } from './helpers';

const { platform: base, box } = fakePlatform(null);
const ads: AdService = {
  available: () => true,
  rewarded: onStart => { onStart(); return Promise.resolve('rewarded' as AdResult); },
  midgame: onStart => { onStart(); return Promise.resolve('rewarded' as AdResult); },
};
const host: HostHooks = {
  gameplayStart: () => {}, gameplayStop: () => {}, happy: () => {},
  muted: () => false, onMutedChange: () => {},
};
const platform = { ...base, id: 'crazygames' as const, features: CRAZYGAMES_FEATURES, ads, host, ageGate: false };
const START = new Date(2026, 10, 2, 12, 0, 0).getTime();
const state = newState(START);
state.introSeen = true;
state.town = { ...state.town, rep: 1e9 };
box.saved = state;

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };

let stop: () => void;
beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(START);
  stop = startApp(platform, true);
});
afterAll(() => {
  stop();
  vi.useRealTimers();
});

describe('CrazyGames preview dev tab', () => {
  it('renders the dev panel from a Shop tab and the tools work', () => {
    click(document.querySelector('[data-view="shop"]'));
    click(document.querySelector('[data-stagetab="shop:dev"]'));

    expect($('#dev-unlock')).not.toBeNull();
    expect($('#dev-day-next')).not.toBeNull();
    expect($('#dev-parcels')).not.toBeNull();

    const parcelsBefore = box.saved!.parcels.length;
    click($('#dev-parcels'));
    expect(box.saved!.parcels.length).toBe(parcelsBefore + 10);

    const ownedBefore = Object.values(box.saved!.owned).filter(n => (n || 0) > 0).length;
    click($('#dev-unlock'));
    expect(Object.values(box.saved!.owned).filter(n => (n || 0) > 0).length).toBeGreaterThan(ownedBefore);

    // Unlock leaves a spare of every item, so a street request bubble opens the hand-over picker instead of a toast.
    click(document.querySelector('[data-view="town"]'));
    click(document.querySelector('[data-stagetab="town:street"]'));
    click(document.querySelector('[data-req="0"]'));
    expect(document.querySelectorAll('[data-give]').length).toBeGreaterThan(0);
  });
});
