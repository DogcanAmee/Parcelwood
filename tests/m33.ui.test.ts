// @vitest-environment jsdom
// M3.3 C1-C3: four station decor pieces with their own art, event and Station Week banners, and Mr. Dube
// as the guide in the coach and hint bubbles. Layout maths is ordinary DOM work, so these tests run in jsdom.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { CONFIG } from '../src/core/config';
import { DECOR } from '../src/core/decor';
import { newState } from '../src/core/logic';
import { HINT_IDS } from '../src/core/types';
import type { GameState } from '../src/core/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const $$ = (s: string) => Array.from(document.querySelectorAll(s)) as HTMLElement[];
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
let stop: (() => void) | null = null;

function boot(saved: GameState | null = null) {
  document.body.innerHTML = ROOTS;
  const fp = fakePlatform('ok');
  if (saved) fp.box.saved = saved;
  stop = startApp(fp.platform, false, createBackend({}, fp.platform.kv, 'http://localhost/'));
  return fp;
}
function started() {
  const s = newState(Date.now());
  s.introSeen = true; s.guideSeen = true; s.stats.opened = 1;
  s.hintsSeen = [...HINT_IDS];
  s.firstGoals = { started: true, done: [], off: true };
  return s;
}
function atLevel(s: GameState, level: number) {
  s.town.rep = CONFIG.townLevels[level - 1];
  s.town.level = level;
  return s;
}

beforeAll(() => {
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 5, 9, 0, 0));
});
afterEach(() => { if (stop) { stop(); stop = null; } });

describe('M3.3 station decor on the facade', () => {
  it('shows the four new pieces at their own slots when every decoration is bought', () => {
    const s = atLevel(started(), 8);
    s.decor = { owned: DECOR.map(d => d.id), hidden: [] };
    boot(s);
    const expectSrc = (slot: string, file: string) => {
      const img = document.querySelector('.facade img.deco-' + slot) as HTMLImageElement | null;
      expect(img, slot).not.toBeNull();
      expect(img!.getAttribute('src')).toContain(file);
    };
    expectSrc('front-2b', 'decor-scale.webp');
    expectSrc('sign-top', 'decor-garland.webp');
    expectSrc('wall-r', 'decor-horn.webp');
    expectSrc('front-3b', 'decor-trolley.webp');
    expect($$('.facade img.deco')).toHaveLength(DECOR.length);
    expect($('.facade-wrap #decor-open')).not.toBeNull();
  });

  it('names the new pieces in English, Chinese and Spanish and shows their own picture in the shop', () => {
    const s = atLevel(started(), 8);
    s.coins = 5000;
    boot(s);
    click($('[data-view="shop"]'));
    const card = () => Array.from(document.querySelectorAll('.decor-card')).find(c => c.textContent!.includes('scale') || c.textContent!.includes('秤') || c.textContent!.includes('Báscula')) as HTMLElement | undefined;
    expect(card()).toBeTruthy();
    expect(card()!.querySelector('img')!.getAttribute('src')).toContain('decor-scale.webp');
    expect(card()!.textContent).toContain('Brass parcel scale');

    let sel = $('#lang') as HTMLSelectElement;
    sel.value = 'zh'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(card()!.textContent).toContain('黄铜邮包秤');
    sel = $('#lang') as HTMLSelectElement;
    sel.value = 'es'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(card()!.textContent).toContain('Báscula de paquetes');
    sel = $('#lang') as HTMLSelectElement;
    sel.value = 'en'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
});

describe('M3.3 event and Station Week banners', () => {
  it('puts the event banner on the event card and the week banner on the week card', () => {
    const s = atLevel(started(), 8);
    boot(s);
    const ev = $('.event-card') as HTMLElement | null;
    expect(ev).not.toBeNull();
    const banner = ev!.querySelector('img.ev-banner') as HTMLImageElement | null;
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('src')).toMatch(/^ui\/banner-(rain|powercut|moving)\.webp$/);
    expect(banner!.getAttribute('width')).toBe('750');
    expect(banner!.getAttribute('height')).toBe('250');
    const week = $('.week-card img.week-banner') as HTMLImageElement | null;
    expect(week).not.toBeNull();
    expect(week!.getAttribute('src')).toBe('ui/banner-week.webp');
  });

  it('drops back to the old icon row when a banner file is missing', () => {
    const s = atLevel(started(), 8);
    boot(s);
    const ev = $('.event-card') as HTMLElement;
    const banner = ev.querySelector('img.ev-banner') as HTMLImageElement;
    banner.dispatchEvent(new Event('error'));
    expect(ev.querySelector('img.ev-banner')).toBeNull();
    expect(ev.classList.contains('has-banner')).toBe(false);

    const week = $('.week-card') as HTMLElement;
    const weekBanner = week.querySelector('img.week-banner') as HTMLImageElement;
    weekBanner.dispatchEvent(new Event('error'));
    expect(week.querySelector('img.week-banner')).toBeNull();
    expect(week.classList.contains('has-banner')).toBe(false);
  });
});

describe('M3.3 Mr. Dube as the guide', () => {
  it('shows Dube pointing in the coach and in one-time hints', () => {
    const s = started();
    s.hintsSeen = [];
    boot(s);
    const hintImg = () => $('#hint-root img.coach-guide') as HTMLImageElement | null;
    expect(hintImg()).not.toBeNull();
    expect(hintImg()!.getAttribute('src')).toBe('ui/guide-point.webp');
    click($('#hint-skip'));
    click($('[data-view="town"]'));
    expect(hintImg()).not.toBeNull();
    expect(hintImg()!.getAttribute('src')).toBe('ui/guide-point.webp');
    click($('#hint-skip'));
  });

  it('shows Dube pointing through the walkthrough and cheering on the reveal', () => {
    boot();
    const bubbleImg = () => $('#coach-root img.coach-guide') as HTMLImageElement | null;
    expect(bubbleImg()!.getAttribute('src')).toBe('ui/guide-point.webp');
    click($('[data-guide="parcel"]'));
    expect(bubbleImg()!.getAttribute('src')).toBe('ui/guide-point.webp');
    click($('[data-tool="shake"]'));
    click($('[data-gs]'));
    click($('#go-open'));
    click($('#tape'));
    click($('#tape'));
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(1300);
    expect(bubbleImg()).not.toBeNull();
    expect(bubbleImg()!.getAttribute('src')).toBe('ui/guide-cheer.webp');
  });

  it('falls back to the emoji when a guide picture is missing', () => {
    boot();
    const img = $('#coach-root img.coach-guide') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    expect($('#coach-root img.coach-guide')).toBeNull();
    expect($('#coach-root .coach-ico')).not.toBeNull();
  });

  it('places the bubble with its real height, so a tall bubble never covers the target', () => {
    const rect = Element.prototype.getBoundingClientRect;
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Element.prototype.getBoundingClientRect = function () {
      if (this instanceof Element && this.matches('[data-guide="parcel"]')) {
        return { top: 500, bottom: 520, left: 0, right: 100, width: 100, height: 20, x: 0, y: 500, toJSON() {} } as DOMRect;
      }
      return rect.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() { return this.classList.contains('coach-bubble') ? 150 : 0; },
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    try {
      boot();
      const bubble = $('#coach-root .coach-bubble') as HTMLElement;
      expect(bubble.style.top).toBe('338px');
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', desc);
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    }
  });

  it('does not scroll the page for a coach step the player already left', () => {
    // Browsers measure a detached element as all zeros. Mimic that, and give every element on the page a rect
    // that is already in view, so any scroll can only come from a stale (detached) target.
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (!this.isConnected) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
      return { top: 200, bottom: 240, left: 0, right: 100, width: 100, height: 40, x: 0, y: 200, toJSON() {} } as DOMRect;
    };
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1000 });
    const scrollBy = vi.fn();
    const oldScrollBy = window.scrollBy;
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
    try {
      boot();
      click($('[data-guide="parcel"]')); // leave the first step within the 900 ms re-placement window
      vi.advanceTimersByTime(1000);
      expect(scrollBy).not.toHaveBeenCalled();
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      window.scrollBy = oldScrollBy;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    }
  });

  it('stops after one fallback when the drawn face icon is missing too', () => {
    const s = started();
    boot(s);
    click($('[data-view="town"]'));
    const img = $('img.face') as HTMLImageElement;
    expect(img).not.toBeNull();
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe('icons/face.svg');
    expect(img.classList.contains('fallback')).toBe(true);
    img.setAttribute('src', 'marker');
    img.dispatchEvent(new Event('error')); // face.svg failed as well: leave it alone instead of retrying forever
    expect(img.getAttribute('src')).toBe('marker');
  });
});
