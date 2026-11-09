// @vitest-environment jsdom
// Cut 1 of "fewer words, more picture": the station, the inspect counter and the reveal show pictures and numbers,
// while every control still has a name for screen readers. Also prints how many words are left on screen.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
// Words a sighted player sees: text outside screen-reader-only elements, the hidden select and the shop sign.
function visibleWords(root: Element | null): number {
  if (!root) return 0;
  const c = root.cloneNode(true) as Element;
  c.querySelectorAll('.sr, select, script').forEach(e => e.remove());
  const txt = c.textContent || '';
  return (txt.match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length + (txt.match(/[一-鿿]/g) || []).length;
}

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('game feel, cut 1', () => {
  it('station is a scene: a pointing finger on the first parcel, no paragraphs', () => {
    expect($('.counter .shelf')).not.toBeNull();
    expect(document.querySelectorAll('.slot .finger').length).toBe(1);
    // the finger points at an ordinary parcel, not the misdelivered one a new save starts with
    const pointed = Number($('.slot .finger')!.closest('[data-parcel]')!.getAttribute('data-parcel'));
    expect(box.saved!.parcels.find(p => p.id === pointed)!.kind).toBe('normal');
    // the welcome words are still there for screen readers
    expect($('#app .sr')!.textContent!.length).toBeGreaterThan(0);
    expect($('#app p:not(.sr)')).toBeNull();
    expect(visibleWords($('.counter'))).toBeLessThan(25);
    // every nav button still has a name
    document.querySelectorAll('.nav button').forEach(b => expect((b.querySelector('.sr')?.textContent || '').trim().length).toBeGreaterThan(0));
  });

  it('the inspect counter shows clues as stickers and keeps them in words for screen readers', () => {
    const normal = box.saved!.parcels.find(p => p.kind === 'normal')!;
    click(document.querySelector(`[data-parcel="${normal.id}"]`));
    expect(box.saved!.introSeen).toBe(true);
    expect($('.finger.wiggle')).not.toBeNull();
    document.querySelectorAll('[data-tool], [data-gs], [data-gr], #go-open, #sheet-close').forEach(b => expect(b.getAttribute('aria-label')).toBeTruthy());
    const before = document.querySelectorAll('#sheet-root ul.sr li').length;
    click($('[data-tool="weigh"]'));
    expect($('#bigbox .stk.wt')).not.toBeNull();
    expect(document.querySelectorAll('#sheet-root ul.sr li').length).toBe(before + 1);
    vi.advanceTimersByTime(100);
    expect($('#sr-live')!.textContent).toMatch(/oz|lb/); // the new weight clue is spoken, not an older one
    expect(visibleWords($('#sheet-root'))).toBeLessThan(20);
  });

  it('the reveal flies rewards to the counters and the album tab gets a badge', () => {
    click($('[data-gs]'));
    click($('#go-open'));
    expect($('#swipe')).not.toBeNull();
    click($('#skip'));
    vi.advanceTimersByTime(4000);
    expect($('.result-scene')).not.toBeNull();
    expect($('#back-shelf')!.getAttribute('aria-label')).toBeTruthy();
    const coins = $('#sheet-root [data-hud="coins"] .num')!.textContent;
    expect(Number(coins)).toBe(box.saved!.coins); // the count-up ends on the saved total
    expect($('[data-view="album"] .badge')!.textContent).toBe('1');
    expect($('[data-view="album"] .sr')!.textContent).toContain('1');
    click($('#back-shelf'));
    click($('[data-view="album"]'));
    expect($('[data-view="album"] .badge')).toBeNull();
    click($('[data-view="station"]'));
  });

  it('reports the words left on screen in each language', () => {
    const out: Record<string, number> = {};
    for (const lang of ['en', 'zh', 'es']) {
      const sel = $('#lang') as HTMLSelectElement; sel.value = lang; sel.dispatchEvent(new Event('change', { bubbles: true }));
      out[lang + ' station'] = visibleWords($('.counter'));
      const p = box.saved!.parcels.find(x => x.kind === 'normal')!;
      click(document.querySelector(`[data-parcel="${p.id}"]`));
      out[lang + ' inspect'] = visibleWords($('#sheet-root'));
      click($('#go-open')); click($('#skip')); vi.advanceTimersByTime(4000);
      out[lang + ' result'] = visibleWords($('#sheet-root'));
      click($('#back-shelf'));
    }
    console.log('visible words/characters', out);
    expect(out['en station']).toBeLessThan(25);
  });
});
