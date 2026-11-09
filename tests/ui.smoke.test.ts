// @vitest-environment jsdom
// Plays one parcel end to end in a fake browser, then switches language. Catches broken wiring after the port.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('web build smoke test', () => {
  it('shows a full shelf and saves on start', () => {
    if ($('#intro-ok')) click($('#intro-ok'));
    expect(document.querySelectorAll('[data-parcel]').length).toBeGreaterThanOrEqual(10);
    expect(box.saved?.parcels.length).toBeGreaterThanOrEqual(10);
  });

  it('hides the developer panel outside dev builds', () => {
    click(document.querySelector('[data-view="shop"]'));
    expect($('#dev-unlock')).toBeNull();
    expect($('#open-odds')).not.toBeNull();
    click(document.querySelector('[data-view="station"]'));
  });

  it('keeps Rush Hour locked on a new game (it opens at town Lv2)', () => {
    const nav = document.querySelectorAll('#nav-in button');
    expect(nav).toHaveLength(4);
    expect(document.querySelector('[data-view="rush"]')).toBeNull();
    // A brand-new Lv1 first screen shows the shelf, the wallet and one goal only.
    expect($('#first-goal')).not.toBeNull();
    expect($('#town-strip')).toBeNull();
    expect($('.pity')).toBeNull();
  });

  it('opens one parcel and adds it to the album', () => {
    const before = box.saved!.stats.opened;
    const normal = box.saved!.parcels.find(p => p.kind === 'normal')!;
    click(document.querySelector(`[data-parcel="${normal.id}"]`));
    expect($('#sheet-root')!.innerHTML).not.toBe('');
    click($('#go-open'));
    vi.advanceTimersByTime(5000);
    if ($('#skip')) click($('#skip'));
    vi.advanceTimersByTime(5000);
    expect(box.saved!.stats.opened).toBe(before + 1);
    expect(Object.values(box.saved!.owned).reduce((a, b) => a + b, 0)).toBe(before + 1);
  });

  it('switches to Chinese and Spanish', () => {
    for (const [lang, word] of [['zh', '今天'], ['es', 'hoy']] as const) {
      const sel = $('#lang') as HTMLSelectElement | null; // the header re-renders on each switch
      expect(sel).not.toBeNull();
      sel!.value = lang;
      sel!.dispatchEvent(new Event('change', { bubbles: true }));
      expect(document.documentElement.lang).toBe(lang === 'zh' ? 'zh-Hans' : 'es');
      expect($('#app')!.textContent).toContain(word);
    }
  });
});
