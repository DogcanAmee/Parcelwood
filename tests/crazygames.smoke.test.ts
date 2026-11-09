// @vitest-environment jsdom
// The game as CrazyGames runs it (all ages): no age screen, no sign-in, no shop for money, no outside links;
// ads or coins for extra parcels; break ads.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { AD_RULES } from '../src/core/ads';
import { newState } from '../src/core/logic';
import { CRAZYGAMES_FEATURES, type AdResult, type AdService, type HostHooks } from '../src/platform/types';
import { fakePlatform, ROOTS } from './helpers';

const { platform: base, box } = fakePlatform(null);
let next: AdResult = 'rewarded';
const log: string[] = [];
const ads: AdService = {
  available: () => true,
  rewarded: onStart => { log.push('rewarded'); onStart(); return Promise.resolve(next); },
  midgame: onStart => { log.push('midgame'); onStart(); return Promise.resolve('rewarded'); },
};
const host: HostHooks = {
  gameplayStart: () => log.push('start'), gameplayStop: () => log.push('stop'), happy: () => log.push('happy'),
  muted: () => false, onMutedChange: () => {},
};
const platform = { ...base, id: 'crazygames' as const, features: { ...CRAZYGAMES_FEATURES, ageGate: false }, ads, host, ageGate: false };
const START = new Date(2026, 10, 2, 12, 0, 0).getTime();
box.saved = { ...newState(START), coins: 500, introSeen: true }; // returning player; the shop needs coins and the fixed tab bar

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const normalCount = () => box.saved!.parcels.filter(p => p.kind === 'normal').length;

function openOne() {
  const p = box.saved!.parcels.find(x => x.kind === 'normal')!;
  click(document.querySelector(`[data-parcel="${p.id}"]`));
  click($('#go-open'));
  vi.advanceTimersByTime(5000);
  if ($('#skip')) click($('#skip'));
  vi.advanceTimersByTime(5000);
}

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(START);
  startApp(platform, false);
});

describe('CrazyGames build', () => {
  it('lands straight on the shelf: no age screen, no sign-in, no paid currency', () => {
    expect(document.querySelector('[data-view="rush"]')).toBeNull();
    expect($('#age-gate')).toBeNull();
    expect(document.querySelectorAll('[data-parcel]').length).toBeGreaterThanOrEqual(10);
    expect($('#account')).toBeNull();
    expect($('#app')!.textContent).not.toContain('💎');
    expect(log).toContain('start');
    expect(document.querySelector('a[href]')).toBeNull(); // no links out of the game at all
  });

  it('shows free rewards instead of the shop, with the odds, and no links out', () => {
    click(document.querySelector('[data-view="shop"]'));
    expect(document.querySelector('[data-offer]')).toBeNull();
    expect(document.querySelector('[data-buy]')).toBeNull(); // ads only: nothing is sold for money
    expect($('#app')!.textContent).not.toMatch(/\$\d/);
    expect(document.querySelector('[data-ad-watch="parcels"]')).not.toBeNull();
    expect(document.querySelector('[data-ad-coins="mystery"]')).not.toBeNull();
    expect($('#open-odds')).not.toBeNull();
    expect(document.querySelector('a[href]')).toBeNull();
    expect(document.querySelectorAll('.shop-earn .today-list li')).toHaveLength(3);
    expect(document.querySelectorAll('.ad-offer .ad-art')).toHaveLength(2);
    // The fixed CrazyGames stage has a tab for today's station; the web/Discord shop keeps it in the side column.
    click(document.querySelector('[data-stagetab="shop:today"]'));
    expect(document.querySelector('.shop-today .today-list')).not.toBeNull();
    click(document.querySelector('[data-stagetab="shop:rewards"]'));
    click(document.querySelector('[data-view="station"]'));
  });

  it('says on screen how to cut the tape on the first parcels, and uses drawn art instead of emoji', () => {
    expect($('#app')!.textContent).not.toMatch(/[🍜🧸🎡👆🎬]/u);
    click(document.querySelector('[data-stagetab="station:street"]'));
    expect(document.querySelector('.street .sicon')).not.toBeNull();
    const p = box.saved!.parcels.find(x => x.kind === 'normal')!;
    click(document.querySelector(`[data-parcel="${p.id}"]`));
    click($('#go-open'));
    vi.advanceTimersByTime(5000);
    const hint = $('#cut-hint');
    expect(hint).not.toBeNull();
    expect(hint!.classList.contains('cut-hint')).toBe(true);
    expect(hint!.textContent).toContain('Swipe across the tape');
    expect($('#swipe .hand')).not.toBeNull();
    expect($('#sheet-root')!.textContent).not.toContain('👆');
    click($('#skip'));
    vi.advanceTimersByTime(5000);
    click($('#back-shelf'));
  });

  it('a break ad comes only on "Next parcel", after 3 parcels and the first 3 minutes', async () => {
    for (let i = 0; i < AD_RULES.midgameEveryOpens; i++) { openOne(); click($('#next-parcel')); await flush(); click($('#sheet-close')); }
    expect(log).not.toContain('midgame'); // too early in the session
    vi.setSystemTime(Date.now() + AD_RULES.midgameFirstAfterMs);
    openOne(); click($('#back-shelf')); await flush();
    expect(log).not.toContain('midgame'); // a navigation button never triggers one
    openOne(); click($('#next-parcel')); await flush();
    expect(log.filter(x => x === 'midgame').length).toBe(1);
    expect($('#ad-root')!.innerHTML).toBe('');
    expect($('#sheet-close')).not.toBeNull(); // carried on to the next parcel after the ad
    click($('#sheet-close'));
  });

  it('watching to the end adds parcels; closing early adds nothing; then the cooldown shows', async () => {
    const before = normalCount();
    expect(before).toBeLessThan(10);
    next = 'failed';
    click(document.querySelector('[data-ad-watch="parcels"]')); await flush();
    expect(normalCount()).toBe(before);
    next = 'rewarded';
    click(document.querySelector('[data-ad-watch="parcels"]')); await flush();
    expect(normalCount()).toBe(Math.min(10, before + AD_RULES.parcelsPerReward));
    expect(log).toContain('stop');
    openOne(); click($('#back-shelf')); // make room on the shelf, so the row shows the cooldown rather than "full"
    click(document.querySelector('[data-view="shop"]'));
    const btn = document.querySelector('[data-ad-watch="parcels"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector('[data-ad-until]')).not.toBeNull();
    click(document.querySelector('[data-view="station"]'));
  });

  it('coins buy a misdelivered parcel without an ad', () => {
    click(document.querySelector('[data-view="shop"]'));
    const s = box.saved!;
    const mysteryBefore = s.parcels.filter(p => p.kind === 'mystery').length;
    const coinsBefore = s.coins;
    expect(coinsBefore).toBeGreaterThanOrEqual(AD_RULES.coinPrice.mystery);
    expect(mysteryBefore).toBeLessThan(3);
    click(document.querySelector('[data-ad-coins="mystery"]'));
    expect(box.saved!.coins).toBe(coinsBefore - AD_RULES.coinPrice.mystery);
    expect(box.saved!.parcels.filter(p => p.kind === 'mystery').length).toBe(mysteryBefore + 1);
  });
});
