// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { CONFIG } from '../src/core/config';
import { DECOR, buyDecor, decorOpen, decorOwned, decorPrice, shownDecor, toggleDecor } from '../src/core/decor';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';
import { unlocksAt } from '../src/core/town';
import { fakePlatform, ROOTS } from './helpers';

const T0 = new Date(2026, 10, 2, 9, 0, 0).getTime();
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };

describe('decoration shop core', () => {
  it('has fourteen decorations: ten album display models and four station pieces with their own picture', () => {
    expect(DECOR).toHaveLength(14);
    for (const d of DECOR) {
      expect(!!d.item !== !!d.img, d.id).toBe(true);
      if (d.item) expect(CONFIG.series.some(s => s.items.some(i => i.id === d.item))).toBe(true);
      if (d.img) expect(d.img).toMatch(/^items\/decor-[a-z0-9-]+\.webp$/);
    }
    expect(DECOR.filter(d => d.img).map(d => d.id).sort()).toEqual(['garland', 'horn', 'scale', 'trolley']);
  });

  it('never sells a secret album item', () => {
    for (const d of DECOR.filter(x => x.item)) {
      const item = CONFIG.series.flatMap(s => s.items).find(i => i.id === d.item);
      expect(item).toBeTruthy();
      expect(item!.r).not.toBe('secret');
    }
  });

  it('buys with coins and marks the decoration owned', () => {
    const s = newState(T0);
    s.coins = 500;
    expect(buyDecor(s, 'lantern')).toBe(true);
    expect(s.coins).toBe(380);
    expect(decorOwned(s, 'lantern')).toBe(true);
    expect(shownDecor(s).map(d => d.id)).toContain('lantern');
  });

  it('refuses a locked decoration, short coins and a second copy without changing coins', () => {
    const s = newState(T0);
    s.coins = 500;
    expect(decorOpen(s, 'chime')).toBe(false);
    expect(buyDecor(s, 'chime')).toBe(false);
    expect(s.coins).toBe(500);

    const poor = newState(T0);
    poor.coins = 0;
    expect(buyDecor(poor, 'lantern')).toBe(false);
    expect(poor.coins).toBe(0);
    expect(poor.decor.owned).toEqual([]);

    s.coins = 500;
    expect(buyDecor(s, 'lantern')).toBe(true);
    const after = s.coins;
    expect(buyDecor(s, 'lantern')).toBe(false);
    expect(s.coins).toBe(after);
    expect(s.decor.owned).toEqual(['lantern']);
  });

  it('takes 20% off when the album item was already found', () => {
    const s = newState(T0);
    expect(decorPrice(s, 'lantern')).toBe(120);
    s.owned['paper-lantern'] = 1;
    expect(decorPrice(s, 'lantern')).toBe(96);
    s.coins = 96;
    expect(buyDecor(s, 'lantern')).toBe(true);
    expect(s.coins).toBe(0);
  });

  it('hides and shows an owned decoration without losing it', () => {
    const s = newState(T0);
    s.coins = 500;
    buyDecor(s, 'lantern');
    expect(toggleDecor(s, 'lantern')).toBe(true);
    expect(s.decor.hidden).toEqual(['lantern']);
    expect(shownDecor(s)).toEqual([]);
    expect(toggleDecor(s, 'lantern')).toBe(true);
    expect(s.decor.hidden).toEqual([]);
    expect(shownDecor(s).map(d => d.id)).toEqual(['lantern']);
    expect(toggleDecor(s, 'not-owned')).toBe(false);
  });

  it('opens new decorations with the town level, including the two Lv8 pieces that arrive with the series', () => {
    expect(unlocksAt(2).decor).toEqual(expect.arrayContaining(['chime', 'cactus']));
    expect(unlocksAt(5).decor).toEqual(['ferris', 'scale']);
    expect(unlocksAt(6).decor).toEqual(['garland']);
    expect(unlocksAt(8).decor).toEqual(['horn', 'trolley']);
  });

  it('buys a station piece at full price and never applies the album discount to it', () => {
    const s = newState(T0);
    s.town.rep = CONFIG.townLevels[7];
    s.coins = 500;
    expect(decorPrice(s, 'scale')).toBe(450);
    s.owned['paper-lantern'] = 1;
    expect(decorPrice(s, 'scale')).toBe(450);
    expect(buyDecor(s, 'scale')).toBe(true);
    expect(s.coins).toBe(50);
    expect(shownDecor(s).map(d => d.id)).toContain('scale');
    expect(decorPrice(s, 'horn')).toBe(900);
    expect(decorPrice(s, 'trolley')).toBe(1000);
  });

  it('sanitizes good decor, drops unknown ids and duplicates, and never nulls the save', () => {
    const s = newState(T0) as unknown as Record<string, unknown>;
    s.decor = { owned: ['lantern', 'lantern', 'chime', 'nope'], hidden: ['chime', 'lantern', 'nope'] };
    const out = sanitizeState(s)!;
    expect(out).not.toBeNull();
    expect(out.decor.owned).toEqual(['lantern', 'chime']);
    expect(out.decor.hidden).toEqual(['chime', 'lantern']);

    for (const bad of [undefined, null, 'x', { owned: 'lantern', hidden: [] }, { owned: ['lantern'], hidden: 'chime' }]) {
      const b = newState(T0) as unknown as Record<string, unknown>;
      b.decor = bad;
      const clean = sanitizeState(b);
      expect(clean).not.toBeNull();
      expect(clean!.decor).toEqual({ owned: [], hidden: [] });
    }
  });

  it('keeps a good streak and resets only a broken one', () => {
    const s = newState(T0) as unknown as Record<string, unknown>;
    s.streak = { n: 4, best: 6 };
    expect(sanitizeState(s)!.streak).toEqual({ n: 4, best: 6 });
    const bad = newState(T0) as unknown as Record<string, unknown>;
    bad.streak = { n: -1, best: 3 };
    expect(sanitizeState(bad)!.streak).toEqual({ n: 0, best: 0 });
  });
});

describe('decoration shop on the station front', () => {
  const { platform, box } = fakePlatform('ok');

  beforeAll(() => {
    document.body.innerHTML = ROOTS;
    window.scrollTo = () => {};
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
    const s: any = newState(Date.now());
    s.introSeen = true; s.guideSeen = true; s.coins = 500;
    box.saved = s;
    startApp(platform, false);
  });

  it('a tap on empty space disarms the two-tap buy and restores its label', () => {
    click($('[data-view="shop"]'));
    click($('[data-decor-buy="lantern"]'));
    expect($('[data-decor-buy="lantern"]')!.textContent).toContain('Buy for 120');
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect($('[data-decor-buy="lantern"]')!.textContent).not.toContain('Buy for');
    expect($('[data-decor-buy="lantern"]')!.textContent).toContain('120');
  });

  it('buys the lantern in two taps, shows it on the facade, and keeps it after a sanitize round-trip', () => {
    click($('[data-view="shop"]'));
    expect($('#decor-shop')).not.toBeNull();
    const first = $('[data-decor-buy="lantern"]');
    expect(first!.textContent).toContain('120');
    click(first);
    const second = $('[data-decor-buy="lantern"]');
    expect(second!.textContent).toContain('Buy for 120');
    click(second);
    expect(box.saved!.coins).toBe(380);
    expect(box.saved!.decor.owned).toContain('lantern');

    click($('[data-view="station"]'));
    const img = document.querySelector('.facade img.deco-awn-l') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('paper-lantern');

    const round = sanitizeState(JSON.parse(JSON.stringify(box.saved)))!;
    expect(round.decor.owned).toContain('lantern');
    expect(shownDecor(round).map(d => d.id)).toContain('lantern');
  });

  it('the paint button opens the Shop at the decoration section', () => {
    click($('[data-view="station"]'));
    click($('#decor-open'));
    expect($('#decor-shop')).not.toBeNull();
  });

  it('hides and shows the lantern from the shop card', () => {
    click($('[data-view="shop"]'));
    click($('[data-decor-toggle="lantern"]'));
    expect(box.saved!.decor.hidden).toContain('lantern');
    click($('[data-view="station"]'));
    expect(document.querySelector('.facade img.deco-awn-l')).toBeNull();
    click($('[data-view="shop"]'));
    click($('[data-decor-toggle="lantern"]'));
    expect(box.saved!.decor.hidden).not.toContain('lantern');
  });
});
