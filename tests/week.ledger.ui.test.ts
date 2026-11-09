// @vitest-environment jsdom
// The back-room ledger in the overlay: marks are shown, a tier can be bought between runs, and the next run starts
// with the upgrade snapshotted into it.
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
  s.week.marks = 3;
  box.saved = s;
  startApp(platform, false, createBackend({}, platform.kv, 'http://localhost/'));
});

describe('station week ledger', () => {
  it('shows marks and buys the first tier', async () => {
    click($('#week-open'));
    await settle();
    expect($('.wk-ledger')).not.toBeNull();
    expect($('.wk-marks')!.textContent).toContain('3');
    click($('.wk [data-w="buy"][data-l="hands"]'));
    expect(box.saved!.week.levels.hands).toBe(1);
    expect(box.saved!.week.marks).toBe(1);
    expect($('.wk-ledger')!.textContent).toContain('+20 starting coins');
  });

  it('starts the next run with the ledger upgrade', () => {
    click($('.wk [data-w="start"]'));
    expect(box.saved!.week.run!.mods).toEqual({ ap: 1, storage: 0, checks: 0, coins: 0, keen: 0 });
    expect($('#wk-ap')!.textContent).toBe('11');
    expect($('.wk-mods')!.textContent).toContain('+1 Action points');
    click($('.wk [data-w="exit"]'));
  });
});
