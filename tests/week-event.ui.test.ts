// @vitest-environment jsdom
// A Friday preview of the weekend event: the station card shows the theme and the three reward tiers,
// the nav gets its badge, and a finished run pays the finish tier once and marks it on the card.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { CONFIG } from '../src/core/config';
import { newState } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';

const { platform, box } = fakePlatform('ok');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const settle = async () => { await vi.dynamicImportSettled(); await Promise.resolve(); };

beforeAll(() => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 6, 9, 0, 0)); // Friday
  const s = newState(Date.now());
  s.introSeen = true;
  s.town.rep = CONFIG.townLevels[3]; s.town.level = 4;
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('weekend event card', () => {
  it('shows the open window, this week theme, all three rewards and the nav badge', () => {
    const card = $('.week-card')!;
    expect(card.textContent).toContain('Weekend event open');
    expect(card.textContent).toContain('This week:');
    expect(card.textContent).toContain('Finish a week: +30 coins');
    expect(card.textContent).toContain('Win the week: +30 coins, +10 shards');
    expect(card.textContent).toContain('Three stars: +20 shards');
    expect(card.querySelector('.week-rewards')).not.toBeNull();
    expect($('[data-view="station"] .badge')).not.toBeNull();
  });

  it('pays the finish tier on a finished run and shows it as claimed', async () => {
    const coins0 = box.saved!.coins;
    click($('#week-open'));
    await settle();
    expect($('.wk')!.textContent).toContain('Weekend rewards');
    click($('.wk [data-w="start"]'));
    for (let d = 0; d < 5; d++) {
      const end = $('.wk [data-w="end"]');
      if (!end) break;
      click(end);
      const again = $('.wk [data-w="end"]');
      if (again) click(again);
      const pick = $('.wk [data-w="pick"]');
      if (pick) click(pick);
    }
    expect($('.wk-over')).not.toBeNull();
    expect($('.wk-over')!.textContent).toContain('Weekend reward');
    expect(box.saved!.week.event.claimed & 1).toBe(1);
    expect(box.saved!.coins).toBeGreaterThanOrEqual(coins0 + 30);
    expect(box.saved!.week.event.plays).toBe(1);
    click($('.wk-over [data-w="exit"]'));
    expect($('.week-card .week-rewards li.done')).not.toBeNull();
    expect($('#week-share')).not.toBeNull();
  });
});
