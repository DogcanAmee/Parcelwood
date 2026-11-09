// @vitest-environment jsdom
// Web / H5 reward videos in the game UI: the free-rewards panel, the reward, the ad-blocked fallback,
// and the M1 developer switch for "remove ads".
import { afterEach, describe, expect, it } from 'vitest';
import { localDay, newState } from '../src/core/logic';
import { startApp } from '../src/ui/app';
import { WEB_FEATURES, type AdService, type Platform } from '../src/platform/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { await new Promise(r => setTimeout(r, 20)); };
let stop: (() => void) | null = null;

function ads(available = true) {
  const calls: { noAds: boolean[]; rewarded: number; midgame: number } = { noAds: [], rewarded: 0, midgame: 0 };
  const service: AdService = {
    available: () => available,
    async rewarded(onStart) { calls.rewarded++; onStart(); return 'rewarded'; },
    async midgame(onStart) { calls.midgame++; onStart(); return 'failed'; },
    setNoAds(on) { calls.noAds.push(on); },
  };
  return { service, calls };
}

function boot(opts: { available?: boolean; devTools?: boolean; shelfEmpty?: boolean } = {}) {
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
  if (opts.shelfEmpty) { s.parcels = []; s.deliveryDays = [localDay(new Date(now))]; }
  box.saved = s;
  const made = ads(opts.available ?? true);
  const web: Platform = { ...platform, features: WEB_FEATURES, ads: made.service };
  stop = startApp(web, opts.devTools ?? false);
  return { box, calls: made.calls };
}

afterEach(() => { if (stop) { stop(); stop = null; } });

describe('web reward video', () => {
  it('shows the free-rewards panel beside the paid shop', () => {
    boot();
    click($('[data-view="shop"]'));
    expect($('[data-ad-watch="parcels"]')).not.toBeNull();
    expect($('[data-ad-coins="parcels"]')).not.toBeNull();
  });

  it('watching the test ad adds the reward', async () => {
    const { box, calls } = boot({ shelfEmpty: true });
    click($('[data-view="shop"]'));
    const before = box.saved!.parcels.length;
    click($('[data-ad-watch="parcels"]'));
    await flush();
    expect(calls.rewarded).toBe(1);
    expect(box.saved!.parcels.length).toBe(before + 3);
  });

  it('when ads are blocked the ad button is gone and coins stay usable', () => {
    boot({ available: false });
    click($('[data-view="shop"]'));
    expect($('[data-ad-watch="parcels"]')).toBeNull();
    expect($('[data-ad-coins="parcels"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Ads are not available');
  });

  it('the remove-ads dev switch is saved and forwarded to the ad adapter', async () => {
    const { box, calls } = boot({ devTools: true, shelfEmpty: true });
    click($('[data-view="shop"]'));
    const box4 = $('#dev-noads') as HTMLInputElement | null;
    expect(box4).not.toBeNull();
    box4!.checked = true;
    box4!.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(box.kv.get('parcelwood.noads')).toBe('1');
    expect(calls.noAds).toContain(true);
    expect(($('#dev-noads') as HTMLInputElement).checked).toBe(true);
    // Reward videos stay available after buying remove-ads.
    click($('[data-ad-watch="parcels"]'));
    await flush();
    expect(calls.rewarded).toBe(1);
  });

  it('turning the switch off clears the flag', async () => {
    const { box, calls } = boot({ devTools: true });
    box.kv.set('parcelwood.noads', '1');
    click($('[data-view="shop"]'));
    const input = $('#dev-noads') as HTMLInputElement;
    expect(input.checked).toBe(true);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(box.kv.get('parcelwood.noads')).toBeNull();
    expect(calls.noAds).toContain(false);
  });
});
