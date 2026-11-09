// @vitest-environment jsdom
// M3.2 in a fake browser: ?devlv=8 raises a Lv7 save to Lv8, the level-up popup names the Lost Letter Office,
// and the album shows its sixth series tab with all 8 items and the secret glow.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };

beforeAll(() => {
  window.history.replaceState({}, '', '/?devlv=8');
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 7, 9, 0, 0));
  const s = newState(Date.now());
  s.introSeen = true;
  s.guideSeen = true;
  s.hintsSeen = ['town', 'album', 'shop', 'daily', 'rush', 'week'];
  s.firstGoals = { started: true, done: [], off: true };
  s.town.rep = CONFIG.townLevels[6];
  s.town.level = 7;
  s.unlocked = ['snacks', 'toys', 'souvenirs', 'garden', 'market'];
  for (const it of CONFIG.series.find(x => x.id === 'lost-letter-office')!.items) s.owned[it.id] = 1;
  box.saved = s;
  startApp(platform, true, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('M3.2 Lv8 and the Lost Letter Office', () => {
  it('shows one Lv8 level-up popup with the new series', () => {
    expect($('#modal-root')!.textContent).toContain('Lv 8');
    expect($('#modal-root')!.textContent).toContain('Lost letter night');
    expect($('#level-up')!.textContent).toContain('Lost Letter Office');
    expect(box.saved!.town.level).toBe(8);
    expect(box.saved!.unlocked).toContain('lost-letter-office');
    click($('#modal-root [data-close]'));
    expect($('#modal-root')!.innerHTML).toBe('');
  });

  it('shows all six series tabs and the 8 new album cards', () => {
    click(document.querySelector('[data-view="album"]'));
    const tabs = [...document.querySelectorAll('.marks [data-tab]')].map(x => x.getAttribute('data-tab'));
    for (const id of ['snacks', 'toys', 'souvenirs', 'garden', 'market', 'lost-letter-office']) expect(tabs).toContain(id);
    click(document.querySelector('.marks [data-tab="lost-letter-office"]'));
    expect(document.querySelectorAll('.sbook .stk-slot')).toHaveLength(8);
    for (const it of CONFIG.series.find(x => x.id === 'lost-letter-office')!.items) {
      expect(document.querySelector(`.sbook [data-item="${it.id}"]`), it.id).not.toBeNull();
    }
    expect(document.querySelector('.sbook [data-item="paper-crane"] .itm.glow-crane')).not.toBeNull();
  });
});
