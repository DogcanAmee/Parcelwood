// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
let stop: () => void;

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.useFakeTimers();
  stop = startApp(platform, false);
});

afterAll(() => {
  stop();
  vi.useRealTimers();
});

describe('reduced motion', () => {
  it('skips the unboxing suspense delay and shows the result immediately', () => {
    if ($('#intro-ok')) $('#intro-ok')!.click();
    const parcel = box.saved!.parcels.find(p => p.kind === 'normal')!;
    $(`[data-parcel="${parcel.id}"]`)!.click();
    $('#go-open')!.click();
    for (let i = 0; i < 3; i++) $('#tape')!.click();
    vi.advanceTimersByTime(350);
    expect($('.reveal')).not.toBeNull();
    expect(box.saved!.stats.opened).toBe(1);
  });
});
