// @vitest-environment jsdom
// B2: the first-run guide lives in the game (no big popup), the Lv1 first screen is reduced to the
// shelf + wallet + one goal, and "?" replays the same in-game tips.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import type { GameState } from '../src/core/types';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
let stop: (() => void) | null = null;

function boot() {
  document.body.innerHTML = ROOTS;
  const fp = fakePlatform('ok');
  stop = startApp(fp.platform, false, createBackend({}, fp.platform.kv, 'http://localhost/'));
  return fp;
}
function guideParcelId() {
  const el = $('[data-guide="parcel"]');
  expect(el).not.toBeNull();
  return Number(el!.dataset.parcel);
}
function openGuideParcel(box: { saved: GameState | null }) {
  const id = guideParcelId();
  expect(box.saved!.parcels.find(p => p.id === id)!.kind).toBe('normal');
  click(document.querySelector(`[data-parcel="${id}"]`));
  return id;
}

beforeAll(() => {
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
});
afterEach(() => { if (stop) { stop(); stop = null; } });

describe('first-run coaching in the game', () => {
  it('starts on the shelf with one goal, no popup, and a normal guide parcel', () => {
    const { box } = boot();
    expect($('.modal.guide')).toBeNull();
    expect($('.counter .shelf')).not.toBeNull();
    expect($('#first-goal')).not.toBeNull();
    // The systems that wait for the first reveal or Lv2 are not on this screen.
    expect($('#today')).toBeNull();
    expect($('#town-strip')).toBeNull();
    expect($('.pity')).toBeNull();
    expect($('.street')).toBeNull();
    expect($('#coach-skip')).not.toBeNull();
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Tap a parcel');
    const id = guideParcelId();
    expect($('[data-guide="parcel"]')!.classList.contains('coach-target')).toBe(true);
    expect(box.saved!.parcels.find(p => p.id === id)!.kind).toBe('normal');
  });

  it('walks parcel > clue > series > open > tape > reveal in six taps or fewer', () => {
    const { box } = boot();
    openGuideParcel(box); // 1
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Use one clue');
    click($('[data-tool="shake"]')); // 2
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Pick a series');
    click($('[data-gs]')); // 3
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Open the parcel');
    click($('#go-open')); // 4
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Swipe the tape');
    click($('#tape')); // 5
    click($('#tape')); // 6
    vi.advanceTimersByTime(400);   // tape animation, then the short reveal
    vi.advanceTimersByTime(1300);
    expect($('.result-scene')).not.toBeNull();
    expect(box.saved!.stats.opened).toBe(1);
    expect(box.saved!.guideSeen).toBe(true);
    // The reveal is the last step; the result already names the next action.
    expect($('#coach-root .coach-bubble')!.textContent).toContain('You found it!');
    expect($('#next-parcel .go-t')!.textContent).toBe('Next parcel');
    expect(document.querySelectorAll('.result-scene .sparks i').length).toBeGreaterThan(0);
    // After the first reveal the rest of the station appears.
    expect($('#first-goal')).toBeNull();
    expect($('#today')).not.toBeNull();
    expect($('#town-strip')).not.toBeNull();
    vi.advanceTimersByTime(2300);
    expect($('#coach-root .coach-bubble')).toBeNull();
    // ? still replays the tips after the first reveal, even though every system is now on screen.
    click($('#back-shelf'));
    click($('#help'));
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Tap a parcel');
    expect($('[data-guide="parcel"]')).not.toBeNull();
    click($('#coach-skip'));
  });

  it('Skip ends the coaching, and ? replays it from the station and from the inspect counter', () => {
    const { box } = boot();
    click($('#coach-skip'));
    expect($('#coach-root .coach-bubble')).toBeNull();
    // The first reveal still owns the unlock, so Skip keeps the reduced first screen.
    expect($('#first-goal')).not.toBeNull();

    click($('#help'));
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Tap a parcel');
    openGuideParcel(box);
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Use one clue');
    click($('#sheet-help'));
    expect($('#coach-root .coach-bubble')!.textContent).toContain('Use one clue');
    click($('#coach-skip'));
    expect($('#coach-root .coach-bubble')).toBeNull();
  });
});
