// @vitest-environment jsdom
// The Town page in a fake browser: daily puzzle, a resident request, stories, and all three languages.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { dailyPool } from '../src/core/daily';
import { CONFIG } from '../src/core/config';
import { ITEMS, newState } from '../src/core/logic';
import { requestFits } from '../src/core/requests';
import { fakePlatform, ROOTS } from './helpers';
import { UI, CONTENT } from '../src/i18n/strings';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 31, 9, 0, 0));
  // A save from before this feature (no requests or daily fields), with two copies of every starting item.
  const s: any = newState(Date.now());
  s.introSeen = true;
  CONFIG.startUnlocked.forEach(id => CONFIG.series.find(x => x.id === id)!.items.forEach(i => { s.owned[i.id] = 2; }));
  delete s.requests; delete s.daily;
  s.town = { ...s.town, rep: CONFIG.townLevels[CONFIG.townLevels.length - 1], level: CONFIG.townLevels.length }; // every neighbor has moved in
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('town page', () => {
  it('every language has the same text keys', () => {
    const keys = (l: 'en' | 'zh' | 'es') => Object.keys(UI[l]).sort();
    expect(keys('zh')).toEqual(keys('en'));
    expect(keys('es')).toEqual(keys('en'));
    for (const r of CONFIG.residents) for (const l of ['zh', 'es'] as const) expect(CONTENT[l].residents[r.id][2]).toHaveLength(3);
  });

  it('loads an older save and shows the daily parcel, two requests and the neighbors', () => {
    click(document.querySelector('[data-view="town"]'));
    expect($('#daily')).not.toBeNull();
    expect(document.querySelectorAll('[data-dpeek]').length).toBe(dailyPool().length);
    expect(box.saved!.board.tasks.filter(x => x.kind === 'wish')).toHaveLength(2);
    expect(document.querySelectorAll('.town-street [data-req]').length).toBe(2);
    expect(document.querySelectorAll('.neighbor:not(.locked)').length).toBe(CONFIG.residents.length);
  });

  it('plays the daily parcel to the end and gives a spoiler-free result to copy', () => {
    for (let i = 0; i < 3; i++) {
      const b = [...document.querySelectorAll('[data-dpeek]')].find(x => !(x as HTMLButtonElement).disabled);
      if (!b || $('#daily-share')) break;
      click(b); // a tap only opens a closer look
      expect(box.saved!.daily?.guesses?.length ?? 0).toBe(i);
      click($('#modal-root [data-daily]')); // the guess is made from the closer look
    }
    expect($('#daily-share')).not.toBeNull();
    expect(box.saved!.shards).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-dpeek]:not([disabled])').length).toBe(0);
    click($('#daily-share')); // the test browser has no clipboard, so a box to copy from opens instead
    const txt = ($('#modal-root textarea') as HTMLTextAreaElement).value;
    expect(txt).toMatch(/^Parcelwood Daily #1 [123X]\/3\n📦 [🟥🟩⬜]+$/u);
    const answer = ITEMS[box.saved!.daily.guesses.slice(-1)[0]];
    expect(txt).not.toContain(answer.name);
    $('#modal-root')!.innerHTML = '';
  });

  it('turns down a wrong spare without taking it, then takes a fitting one and unlocks a story', () => {
    const rq = box.saved!.board.tasks[0];
    expect(rq.kind).toBe('wish');
    click(document.querySelector('[data-req="0"]'));
    const gives = [...document.querySelectorAll('[data-give]')] as HTMLElement[];
    expect(gives.length).toBe(16);
    const wrong = gives.find(g => !requestFits(ITEMS[g.dataset.give!], { clues: rq.clues! }))!;
    expect(wrong).toBeTruthy(); // at most 3 of the 16 spares fit
    {
      click(wrong);
      expect(box.saved!.owned[wrong.dataset.give!]).toBe(2);
      expect(box.saved!.board.tasks[0].claimed).toBe(false);
      expect(document.querySelectorAll('[data-give]').length).toBe(16); // the picker stays open
    }
    const right = [...document.querySelectorAll('[data-give]')].find(g => requestFits(ITEMS[(g as HTMLElement).dataset.give!], { clues: rq.clues! })) as HTMLElement;
    const coins = box.saved!.coins;
    click(right);
    expect(box.saved!.owned[right.dataset.give!]).toBe(1);
    expect(box.saved!.board.tasks[0].claimed).toBe(true);
    expect(box.saved!.coins).toBe(coins + CONFIG.requestCoins);
    expect(box.saved!.hearts[rq.by]).toBe(1);
    const tale = CONFIG.residents.find(r => r.id === rq.by)!.tales[0];
    expect($('#modal-root')!.textContent).toContain(tale);
    const happy = $('#modal-root .mface.happy img.face') as HTMLImageElement;
    expect(happy.getAttribute('src')).toBe(`residents/${rq.by}-happy.webp`);
    expect(happy.getAttribute('alt')).toBe('');
    $('#modal-root')!.innerHTML = '';
    expect(document.querySelector('[data-req="0"]')).toBeNull(); // a finished request shows a check, not a button
    click(document.querySelector(`[data-res="${rq.by}"]`)); // tapping the face opens the stories
    expect($('#modal-root')!.textContent).toContain(tale);
    const normal = $('#modal-root .mface img.face') as HTMLImageElement;
    expect(normal.getAttribute('src')).toBe(`residents/${rq.by}-normal.webp`);
    $('#modal-root')!.innerHTML = '';
  });

  it('a puzzle drawn before midnight does not take a guess for the next day', () => {
    vi.setSystemTime(new Date(2026, 10, 1, 23, 59, 0)); // Nov 1, late: a fresh puzzle on screen
    click(document.querySelector('[data-view="station"]')); click(document.querySelector('[data-view="town"]'));
    const card = document.querySelector('[data-dpeek]:not([disabled])');
    expect((card as HTMLElement).dataset.day).toBe('2026-11-01');
    vi.setSystemTime(new Date(2026, 10, 2, 0, 1, 0)); // midnight passes before the tap
    click(card);
    expect(box.saved!.daily.day).toBe('2026-10-31'); // no guess was recorded for either day
    expect((document.querySelector('[data-dpeek]') as HTMLElement).dataset.day).toBe('2026-11-02');
    expect($('#modal-root')!.innerHTML).toBe('');
  });

  it('shows the Town page in Chinese and Spanish', () => {
    for (const [lang, word] of [['zh', '每日之谜'], ['es', 'Cartas de hoy']] as const) {
      const sel = $('#lang') as HTMLSelectElement;
      sel.value = lang;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      expect($('#app')!.textContent).toContain(word);
      expect($('#nav-in')!.textContent).toContain(lang === 'zh' ? '小镇' : 'Pueblo');
    }
  });
});
