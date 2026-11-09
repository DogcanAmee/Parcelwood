// @vitest-environment jsdom
// Station Week in a fake browser: the station shows the entry, a run starts, a parcel is checked and sold,
// the day closes into the evening stamp pick, and leaving and coming back resumes the same run from the save.
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
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
  const s = newState(Date.now());
  s.introSeen = true;
  s.town.rep = CONFIG.townLevels[3]; s.town.level = 4;
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('station week in the game', () => {
  it('the station offers Station Week from town level 4', () => {
    expect($('.week-card')!.textContent).toContain('Station Week');
    expect($('#week-open')!.textContent).toContain('Start the week');
  });

  it('starts a run, checks a parcel and sells it', async () => {
    click($('#week-open'));
    await settle();
    expect($('.wk')).not.toBeNull();
    click($('.wk [data-w="start"]'));
    expect($('.wk-kicker')!.textContent).toContain('Day 1/5');
    expect(box.saved!.week.run).not.toBeNull();
    click($('.wk [data-w="sel"][data-i="0"]'));
    const ap = Number($('#wk-ap')!.textContent);
    click($('.wk [data-w="inspect"][data-t="shake"]'));
    expect(Number($('#wk-ap')!.textContent)).toBe(ap - 1);
    expect($('.wk-lines')!.textContent).toContain('Sound');
    click($('.wk [data-w="sell"]'));
    expect($('.wk-feedback')!.textContent).not.toBe('');
    expect(box.saved!.week.run!.log).toEqual(['i:0:shake', expect.stringMatching(/^s:0:/)]);
  });

  it('closing the day asks first when parcels would be lost, then opens the evening pick', () => {
    click($('.wk [data-w="end"]'));
    if ($('.wk [data-w="end"]')!.textContent!.includes('Tap again')) click($('.wk [data-w="end"]'));
    expect($('.wk-kicker')!.textContent).toContain('Evening, day 1');
    expect(document.querySelectorAll('.wk [data-w="pick"]')).toHaveLength(3);
    click($('.wk [data-w="pick"]'));
    expect($('.wk-kicker')!.textContent).toContain('Day 2/5');
    expect(box.saved!.week.run!.log.slice(-1)[0]).toMatch(/^p:/);
  });

  it('leaving and coming back resumes the same day', async () => {
    click($('.wk [data-w="exit"]'));
    expect($('.wk')).toBeNull();
    expect($('#week-open')!.textContent).toContain('Resume day 2');
    click($('#week-open'));
    await settle();
    click($('.wk [data-w="resume"]'));
    expect($('.wk-kicker')!.textContent).toContain('Day 2/5');
    click($('.wk [data-w="exit"]'));
  });

  it('giving up asks twice and clears the run', async () => {
    click($('#week-open'));
    await settle();
    click($('.wk [data-w="abandon"]'));
    expect(box.saved!.week.run).not.toBeNull();
    click($('.wk [data-w="abandon"]'));
    expect(box.saved!.week.run).toBeNull();
    expect($('.wk [data-w="start"]')).not.toBeNull();
    click($('.wk [data-w="exit"]'));
    expect($('#week-open')!.textContent).toContain('Start the week');
  });

  it('finishes a week, pays a ledger mark and opens the ledger from the end screen', async () => {
    click($('#week-open'));
    await settle();
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
    expect($('.wk-over')!.textContent).toContain('Ledger +1 marks for finishing');
    expect(box.saved!.week.marks).toBe(1);
    click($('.wk-over [data-w="ledger"]'));
    expect($('.wk-ledger')).not.toBeNull();
    expect($('.wk-marks')!.textContent).toContain('1');
    click($('.wk [data-w="exit"]'));
  });
});
