// @vitest-environment jsdom
// The result screen must show the streak chip, the milestone neighbour line and the "ended at" chip.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { seeded } from '../src/core/daily';
import { makeParcel, newState, rollParcel } from '../src/core/logic';
import { startApp } from '../src/ui/app';
import { fakePlatform, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
let stop: (() => void) | null = null;

beforeAll(() => {
  window.scrollTo = () => {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0, 0));
});

afterEach(() => {
  if (stop) { stop(); stop = null; }
  document.body.innerHTML = '';
});

function openParcel(id: number) {
  click($(`[data-parcel="${id}"]`));
  click($('#go-open'));
  vi.advanceTimersByTime(5000);
  if ($('#skip')) click($('#skip'));
  vi.advanceTimersByTime(5000);
}

describe('result screen streak lines', () => {
  it('shows the streak chip and milestone line, then the ended chip after a wrong guess', () => {
    const { platform, box } = fakePlatform('ok');
    const s = newState(Date.now());
    s.introSeen = true; s.guideSeen = true; s.streak = { n: 2, best: 2 };
    s.parcels = [makeParcel(s, 'normal', seeded(1)), makeParcel(s, 'normal', seeded(2))];
    const right = s.parcels.find(p => p.kind === 'normal')!;
    rollParcel(s, right, seeded(3));
    right.guess.series = right.series;
    box.saved = s;
    document.body.innerHTML = ROOTS;
    stop = startApp(platform, false);

    openParcel(right.id);
    const first = $('#sheet-root')!.textContent || '';
    expect(first).toContain('🎯 3');       // streak chip: 3 right in a row
    expect(first).toContain('+8');         // milestone bonus
    const reaction = document.querySelector('#sheet-root .react-line');
    expect(reaction).not.toBeNull();
    expect(reaction!.textContent).toContain('3'); // the neighbour's streak line uses the count

    click($('#back-shelf'));
    const wrong = s.parcels.find(p => p.kind === 'normal' && p.id !== right.id)!;
    const other = s.unlocked.find(id => id !== wrong.series)!;
    click($(`[data-parcel="${wrong.id}"]`));
    click($(`[data-gs="${other}"]`));
    click($('#go-open'));
    vi.advanceTimersByTime(5000);
    if ($('#skip')) click($('#skip'));
    vi.advanceTimersByTime(5000);
    const second = $('#sheet-root')!.textContent || '';
    expect(second).toContain('Streak ended at 3');
    expect(box.saved!.streak.n).toBe(0);
    expect(box.saved!.streak.best).toBe(3);
  });
});
