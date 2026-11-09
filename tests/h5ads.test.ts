// @vitest-environment jsdom
// Web / H5 test ads (M1): the local test overlay, the ad-blocker fallback, and the remove-ads switch.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createH5Ads, detectAdBlocker } from '../src/web/ads';

const make = (opts: Partial<Parameters<typeof createH5Ads>[0]> = {}) =>
  createH5Ads({ doc: document, local: true, detectBlocker: false, seconds: { rewarded: 2, midgame: 1 }, ...opts });

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('local test ad', () => {
  it('plays a rewarded test ad and returns the reward only after it finishes', async () => {
    const ads = make();
    const started = vi.fn();
    const result = ads.rewarded(started);
    expect(started).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.web-test-ad')).not.toBeNull();
    expect(document.querySelector('.web-test-ad-tag')!.textContent).toContain('TEST AD');

    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('.web-test-ad-count')!.textContent).toBe('1');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('rewarded');
    expect(document.querySelector('.web-test-ad')).toBeNull();
  });

  it('closing early gives no reward', async () => {
    const ads = make();
    const result = ads.rewarded(() => {});
    document.querySelector<HTMLElement>('[data-test-ad-close]')!.click();
    await expect(result).resolves.toBe('failed');
    expect(document.querySelector('.web-test-ad')).toBeNull();
  });

  it('a break ad is short and can be skipped', async () => {
    const ads = make();
    const result = ads.midgame(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('rewarded');
  });
});

describe('ad blocker and remove-ads', () => {
  it('a blocked session hides the ad path and keeps the coin path usable', async () => {
    const ads = make({ blocked: true });
    await ads.init?.();
    expect(ads.available()).toBe(false);
    await expect(ads.rewarded(() => {})).resolves.toBe('unavailable');
    await expect(ads.midgame(() => {})).resolves.toBe('unavailable');
    expect(document.querySelector('.web-test-ad')).toBeNull();
  });

  it('detects a bait element hidden by an ad blocker', () => {
    const style = document.createElement('style');
    style.textContent = '.adsbox { display: none !important; }';
    document.head.appendChild(style);
    expect(detectAdBlocker(document)).toBe(true);
    style.remove();
    expect(detectAdBlocker(document)).toBe(false);
  });

  it('remove ads turns break ads off but keeps rewarded ads optional', async () => {
    const ads = make();
    ads.setNoAds?.(true);
    await expect(ads.midgame(() => {})).resolves.toBe('unavailable');
    expect(document.querySelector('.web-test-ad')).toBeNull();

    const result = ads.rewarded(() => {});
    expect(document.querySelector('.web-test-ad')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe('rewarded');
  });
});
