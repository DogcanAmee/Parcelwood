// @vitest-environment jsdom
// TAO-54: words under the bottom buttons, a one-tap explanation for each currency, three short goals after
// the first parcel, and one-time feature tips for Town, the album, the shop and newly unlocked systems.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { newState } from '../src/core/logic';
import { HINT_IDS } from '../src/core/types';
import type { GameState } from '../src/core/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
let stop: (() => void) | null = null;

function boot(saved: GameState | null = null) {
  document.body.innerHTML = ROOTS;
  const fp = fakePlatform('ok');
  if (saved) fp.box.saved = saved;
  stop = startApp(fp.platform, false, createBackend({}, fp.platform.kv, 'http://localhost/'));
  return fp;
}
function reboot(saved: GameState) {
  if (stop) { const f = stop; stop = null; f(); }
  document.body.innerHTML = '';
  return boot(saved);
}
function started() {
  const s = newState(Date.now());
  s.introSeen = true; s.guideSeen = true; s.stats.opened = 1;
  s.firstGoals = { started: true, done: [], off: false };
  return s;
}
function guideParcelId() {
  const el = $('[data-guide="parcel"]');
  expect(el).not.toBeNull();
  return Number(el!.dataset.parcel);
}
function openGuideParcel() {
  const id = guideParcelId();
  click(document.querySelector(`[data-parcel="${id}"]`));
}

beforeAll(() => {
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 5, 9, 0, 0));
});
afterEach(() => { if (stop) { stop(); stop = null; } });

describe('M1 onboarding', () => {
  it('puts a visible word under every bottom button', () => {
    boot();
    const nav = Array.from(document.querySelectorAll('#nav-in button')).map(b => (b.querySelector('.nl') as HTMLElement).textContent);
    expect(nav).toEqual(['Station', 'Town', 'Album', 'Shop']);
  });

  it('puts a word on the action buttons that were icon-only', () => {
    boot(started());
    click($('[data-parcel]'));
    click($('#sheet-close'));
    expect($('#decor-open')!.textContent).toContain('Decor');
  });

  it('explains each currency when it is tapped', () => {
    boot(started());
    for (const [kind, title] of [['coin', 'Coins'], ['shard', 'Star shards'], ['gem', 'Gems (paid currency)']]) {
      click($(`.wallet [data-money="${kind}"]`));
      expect($('#modal-root .modal')!.textContent).toContain(title);
      click($('#modal-root [data-close]'));
    }
  });

  it('starts the three short goals after the first parcel and advances one at a time', () => {
    const { box } = boot();
    openGuideParcel();
    click($('[data-tool="shake"]'));
    click($('#go-open'));
    click($('#tape'));
    click($('#tape'));
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(1300);
    vi.advanceTimersByTime(2300);
    expect(box.saved!.firstGoals.started).toBe(true);
    click($('#back-shelf'));
    expect($('#next-goals')!.textContent).toContain('Guess one series right');
    expect($('#next-goals')!.textContent).toContain('1 of 3');

    const s2 = started(); s2.firstGoals.done = ['series'];
    reboot(s2);
    expect($('#next-goals')!.textContent).toContain('Return a lost parcel');
    expect($('#next-goals')!.textContent).toContain('2 of 3');

    const s3 = started(); s3.firstGoals.done = ['series', 'return'];
    reboot(s3);
    expect($('#next-goals')!.textContent).toContain('Visit Town');
    expect($('#next-goals')!.textContent).toContain('3 of 3');
    click($('[data-view="town"]'));
    click($('[data-view="station"]'));
    expect($('#next-goals')).toBeNull();
  });

  it('shows each feature tip once, lets it be skipped, and replays the current page with ?', () => {
    boot(started());
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Daily tasks');
    click($('#hint-skip'));
    expect($('#hint-root .coach-bubble')).toBeNull();

    click($('[data-view="town"]'));
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Neighbors');
    click($('#hint-skip'));
    click($('[data-view="album"]'));
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Collect a whole series');
    click($('#hint-skip'));
    click($('[data-view="shop"]'));
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Coins buy decorations');
    click($('#hint-skip'));

    click($('[data-view="town"]'));
    expect($('#hint-root .coach-bubble')).toBeNull();
    click($('#help'));
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Neighbors');
    click($('#hint-skip'));
  });

  it('hides a visible tip behind the unpack sheet and a modal, then brings it back', () => {
    boot(started());
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Daily tasks');

    click($('[data-parcel]'));
    expect($('#hint-root')!.innerHTML).toBe('');
    expect(document.body.classList.contains('hint-on')).toBe(false);
    expect(document.querySelector('.hint-target')).toBeNull();
    click($('#sheet-close'));
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Daily tasks');
    expect(document.querySelector('.hint-target')).not.toBeNull();

    click($('.wallet [data-money="coin"]'));
    expect($('#hint-root')!.innerHTML).toBe('');
    expect(document.body.classList.contains('hint-on')).toBe(false);
    expect(document.querySelector('.hint-target')).toBeNull();
    click($('#modal-root [data-close]'));
    expect($('#hint-root .coach-bubble')!.textContent).toContain('Daily tasks');
    expect(document.querySelector('.hint-target')).not.toBeNull();
  });

  it('does not pop new tips on an old save', () => {
    const s = newState(Date.now());
    s.introSeen = true; s.guideSeen = true; s.stats.opened = 7;
    const { box } = boot(s);
    expect(box.saved!.hintsSeen.sort()).toEqual([...HINT_IDS].sort());
    expect($('#next-goals')).toBeNull();
    expect($('#hint-root .coach-bubble')).toBeNull();
  });
});
