// @vitest-environment jsdom
// Cut 2 of "fewer words, more picture": the town is a street with a golden daily parcel, the album is a sticker book.
// Rules stay behind ⓘ, every control keeps a name for screen readers, and nothing about the rules or the save changes.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { CONFIG } from '../src/core/config';
import { ITEMS, newState } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
function visibleWords(root: Element | null): number {
  if (!root) return 0;
  const c = root.cloneNode(true) as Element;
  c.querySelectorAll('.sr, select, script').forEach(e => e.remove());
  const txt = c.textContent || '';
  return (txt.match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length + (txt.match(/[一-鿿]/g) || []).length;
}
// A control has a name when it carries an aria-label, a screen-reader span, or real words.
const named = (b: Element) => !!(b.getAttribute('aria-label') || b.querySelector('.sr')?.textContent?.trim() || /[A-Za-zÀ-ÿ一-鿿]{2,}/.test(b.textContent || ''));
const setLang = (l: string) => { const sel = $('#lang') as HTMLSelectElement; sel.value = l; sel.dispatchEvent(new Event('change', { bubbles: true })); };
const startIds = CONFIG.startUnlocked.flatMap(id => CONFIG.series.find(x => x.id === id)!.items.map(i => i.id));

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 31, 9, 0, 0));
  // mid-game: about half of each starting series, a few spares, some hearts and shards
  const s: any = newState(Date.now()); s.introSeen = true;
  CONFIG.startUnlocked.forEach(id => CONFIG.series.find(x => x.id === id)!.items.forEach((i, k) => { if (k % 2 === 0) s.owned[i.id] = k % 4 === 0 ? 2 : 1; }));
  s.hearts = { okafor: 2, theo: 1 };
  s.shards = 200;
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('game feel, cut 2', () => {
  it('town and album show under 20 words in every language, and every control has a name', () => {
    const out: Record<string, number> = {};
    for (const lang of ['en', 'zh', 'es']) {
      setLang(lang);
      click($('[data-view="town"]'));
      out[lang + ' town'] = visibleWords($('#app'));
      expect($('#app p:not(.sr)')).toBeNull();
      document.querySelectorAll('#app button').forEach(b => expect(named(b), b.outerHTML.slice(0, 120)).toBe(true));
      click($('[data-view="album"]'));
      out[lang + ' album'] = visibleWords($('#app'));
      document.querySelectorAll('#app button').forEach(b => expect(named(b), b.outerHTML.slice(0, 120)).toBe(true));
    }
    console.log('WORDS', JSON.stringify(out));
    Object.values(out).forEach(n => expect(n).toBeLessThan(20));
    setLang('en');
  });

  it('the street: one house per resident, a face opens their stories, ⓘ holds the rules', () => {
    click($('[data-view="town"]'));
    expect(document.querySelectorAll('.town-street .house').length).toBe(CONFIG.residents.length);
    const okafor = CONFIG.residents.find(r => r.id === 'okafor')!;
    click($('[data-res="okafor"]'));
    const m = $('#modal-root')!.textContent!;
    const n = CONFIG.taleHearts.filter(need => need <= 2).length; // Mrs. Okafor has 2 hearts
    okafor.tales.forEach((tl, i) => i < n ? expect(m).toContain(tl) : expect(m).not.toContain(tl));
    expect(document.querySelectorAll('#modal-root .tale.lock').length).toBe(okafor.tales.length - n);
    $('#modal-root')!.innerHTML = '';
    click($('#town-help'));
    expect(visibleWords($('#modal-root'))).toBeGreaterThan(20); // the rules moved here, they did not disappear
    $('#modal-root')!.innerHTML = '';
  });

  it('a daily card opens a closer look; the guess there still checks the day', () => {
    click($('[data-view="town"]'));
    const card = $('[data-dpeek]:not([disabled])')!;
    click(card);
    const go = $('#modal-root [data-daily]')!;
    expect(go.dataset.daily).toBe(card.dataset.dpeek);
    expect(go.getAttribute('aria-label')).toContain(ITEMS[card.dataset.dpeek!].name);
    expect(visibleWords($('#modal-root'))).toBeLessThan(20);
    vi.setSystemTime(new Date(2026, 10, 1, 0, 1, 0)); // midnight passes while the closer look is open
    click(go);
    expect(box.saved!.daily?.guesses?.length ?? 0).toBe(0);
    expect($('#modal-root')!.innerHTML).toBe('');
    expect($('[data-dpeek]')!.dataset.day).toBe('2026-11-01');
    vi.setSystemTime(new Date(2026, 9, 31, 9, 0, 0));
  });

  it('the sticker book: owned stickers open details, a price tag trades shards for a missing one', () => {
    click($('[data-view="album"]'));
    expect($('.scene.book .sbook')).not.toBeNull();
    const have = $('.stk-slot.have[data-item]')!;
    click(have);
    expect($('#modal-root')!.textContent).toContain(ITEMS[have.dataset.item!].name);
    $('#modal-root')!.innerHTML = '';
    const tag = [...document.querySelectorAll('.ptag[data-ex]')].find(b => !(b as HTMLButtonElement).disabled) as HTMLElement;
    const id = tag.dataset.ex!;
    expect(startIds).toContain(id);
    const shards = box.saved!.shards;
    click(tag);
    expect(box.saved!.owned[id]).toBe(1);
    expect(box.saved!.shards).toBeLessThan(shards);
    expect($(`.stk-slot.have[data-item="${id}"]`)).not.toBeNull();
    click($('#album-help'));
    expect(visibleWords($('#modal-root'))).toBeGreaterThan(10);
    $('#modal-root')!.innerHTML = '';
  });
});
