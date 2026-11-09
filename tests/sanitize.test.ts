// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeState } from '../src/core/sanitize';
import { CONFIG } from '../src/core/config';
import { planMerge } from '../src/core/merge';
import { ITEMS, deliver, makeParcel, newState, openParcel } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';
import { startApp } from '../src/ui/app';

const T0 = new Date(2026, 9, 31, 9, 0, 0).getTime();
const rng = () => 0.42;

function played() {
  const s = newState(T0);
  deliver(s, T0, rng);
  s.parcels.push(makeParcel(s, 'mystery', rng));
  openParcel(s, s.parcels[0].id, rng);
  return JSON.parse(JSON.stringify(s));
}

describe('sanitizeState', () => {
  it('accepts a real save, new or played', () => {
    expect(sanitizeState(JSON.parse(JSON.stringify(newState(T0))))).not.toBeNull();
    expect(sanitizeState(played())).not.toBeNull();
  });

  it('nudges a save from before the how-to existed with the help dot', () => {
    const s = played(); delete (s as { guideSeen?: boolean }).guideSeen;
    expect(sanitizeState(s)!.guideSeen).toBe(false);
  });

  it('gives old saves empty M1 onboarding data', () => {
    const s = played(); delete s.hintsSeen; delete s.firstGoals;
    const r = sanitizeState(s)!;
    expect(r.hintsSeen).toEqual([]);
    expect(r.firstGoals).toEqual({ started: false, done: [], off: false });
  });

  it('drops unknown onboarding hint and goal ids instead of rejecting the save', () => {
    const a = played(); a.hintsSeen = ['town', 'not-a-tip', 'town'];
    expect(sanitizeState(a)!.hintsSeen).toEqual(['town']);
    const b = played(); b.firstGoals = { started: true, done: ['nope', 'series', 'series'], off: false };
    expect(sanitizeState(b)!.firstGoals).toEqual({ started: true, done: ['series'], off: false });
  });

  it('rejects text where a number belongs', () => {
    const s = played(); s.coins = '<img src=x onerror=alert(1)>';
    expect(sanitizeState(s)).toBeNull();
  });

  it('drops unknown item, series and resident ids and keeps the rest of the save', () => {
    const s = played();
    const keptItem = Object.keys(s.owned)[0];
    s.unlocked.push('future-series', '"><script>');
    s.completed.push('future-series');
    const badKey = 'x" onclick="y';
    s.owned['future-item'] = 3;
    s.owned[badKey] = 1;
    s.hearts['future-resident'] = 5;
    s.hearts.theo = 1;
    s.pity.secret['future-series'] = 2;
    const out = sanitizeState(s)!;
    expect(out).not.toBeNull();
    expect(out.unlocked).toEqual(['snacks', 'toys']);
    expect(out.completed).toEqual([]);
    expect(out.owned['future-item']).toBeUndefined();
    expect(out.owned[badKey]).toBeUndefined();
    expect(out.owned[keptItem]).toBe(s.owned[keptItem]);
    expect(out.hearts['future-resident']).toBeUndefined();
    expect(out.hearts.theo).toBe(1);
    expect(out.pity.secret['future-series']).toBeUndefined();
    expect(out.coins).toBe(s.coins);
  });

  it('drops a parcel that names an id this build does not know', () => {
    for (const change of [
      (p: any) => { p.item = 'future-item'; },
      (p: any) => { p.series = 'future-series'; },
      (p: any) => { p.kind = 'mystery'; p.resident = 'future-resident'; },
    ]) {
      const s = played();
      const c = JSON.parse(JSON.stringify(s));
      change(c.parcels[0]);
      const out = sanitizeState(c)!;
      expect(out).not.toBeNull();
      expect(out.parcels.length).toBe(s.parcels.length - 1);
      expect(out.parcels.some(p => p === undefined)).toBe(false);
    }
  });

  it('does not replace a newer cloud save just because it has unknown ids', () => {
    const remote = played();
    remote.owned['future-item'] = 1;
    remote.unlocked.push('future-series');
    remote.hearts['future-resident'] = 2;
    const clean = sanitizeState(remote);
    expect(clean).not.toBeNull();
    const plan = planMerge(
      { state: played(), owner: 'u1', ownerGuest: false, version: 3, dirty: false },
      { state: clean!, version: 4 },
      'u1',
    );
    expect(plan.action).toBe('take-cloud');
  });

  it('clamps a newer town level and keeps unknown ids in the future bag', () => {
    const s = played();
    s.town.level = CONFIG.townLevels.length + 1;
    s.owned['zz-future-item'] = 3;
    s.unlocked.push('zz-future-series');
    s.completed.push('zz-future-series');
    s.decor.owned.push('zz-future-decor');
    const out = sanitizeState(s)!;
    expect(out).not.toBeNull();
    expect(out.town.level).toBe(CONFIG.townLevels.length);
    expect(out.owned['zz-future-item']).toBeUndefined();
    expect(out.unlocked).not.toContain('zz-future-series');
    expect(out.future).toEqual({
      owned: { 'zz-future-item': 3 },
      unlocked: ['zz-future-series'],
      completed: ['zz-future-series'],
      decor: ['zz-future-decor'],
    });
    expect(out.coins).toBe(s.coins);
  });

  it('moves future ids that this build knows back into the live fields', () => {
    const s = played();
    const item = Object.keys(s.owned)[0];
    const before = s.owned[item];
    s.future = {
      owned: { [item]: before + 4, 'zz-future-item': 2 },
      unlocked: ['snacks', 'zz-future-series'],
      completed: ['zz-future-series'],
      decor: ['lantern', 'zz-future-decor'],
    };
    const out = sanitizeState(s)!;
    expect(out.owned[item]).toBe(before + 4);
    expect(out.unlocked).toContain('snacks');
    expect(out.decor.owned).toContain('lantern');
    expect(out.future).toEqual({
      owned: { 'zz-future-item': 2 },
      unlocked: ['zz-future-series'],
      completed: ['zz-future-series'],
      decor: ['zz-future-decor'],
    });
  });

  it('ignores malformed future contents without rejecting the save', () => {
    const s = played();
    s.future = {
      owned: { 'ZZ-bad': 1, 'zz-ok': 2, 'zz-bad-count': 'x' },
      unlocked: ['ZZ-bad', 'zz-ok', 5],
      completed: 'x',
      decor: ['a'.repeat(41), 'zz-decor'],
    };
    const out = sanitizeState(s)!;
    expect(out).not.toBeNull();
    expect(out.future.owned).toEqual({ 'zz-ok': 2 });
    expect(out.future.unlocked).toEqual(['zz-ok']);
    expect(out.future.completed).toEqual([]);
    expect(out.future.decor).toEqual(['zz-decor']);

    const many = played();
    many.future = { owned: {}, unlocked: Array.from({ length: 250 }, (_, i) => 'zz-' + i), completed: [], decor: [] };
    expect(sanitizeState(many)!.future.unlocked).toHaveLength(200);
  });

  it('rejects broken numbers and wrong shapes', () => {
    for (const bad of [null, 1, 'x', [], { v: 2 }]) expect(sanitizeState(bad)).toBeNull();
    const s = played(); s.gems = -5; expect(sanitizeState(s)).toBeNull();
    const t = played(); t.parcels = {}; expect(sanitizeState(t)).toBeNull();
  });
});

describe('a tampered device save never reaches the page', () => {
  it('starts a new game instead', () => {
    document.body.innerHTML = ROOTS;
    window.scrollTo = () => {};
    const { platform, box } = fakePlatform('ok');
    const s = played(); s.coins = '<img src=x onerror="window.__pwned=1">';
    box.saved = s;
    const stop = startApp(platform, false);
    expect(document.body.innerHTML).not.toContain('onerror');
    expect(document.querySelector('.wallet .num')?.textContent).toBe('50');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    stop();
  });
});

const wish = (clues: any[], extra: any = {}) => ({ kind: 'wish', by: 'theo', need: 1, got: 0, arg: null, claimed: false, clues, ...extra });
const board = (tasks: any[]) => ({ day: '2026-10-31', tasks, made: ['2026-10-31'], bonus: false, stamps: 0 });

describe('sanitizeState: wish letters and the daily puzzle', () => {
  it('loads a save from before these features with empty ones', () => {
    const s = played(); delete s.daily; delete s.deliveryDays;
    const out = sanitizeState(s)!;
    expect(out).not.toBeNull();
    expect(out.deliveryDays).toEqual([s.day]);
    expect(out.daily).toEqual({ day: null, guesses: [], played: [] });
  });

  it('accepts real wishes and guesses', () => {
    const s = played();
    s.board = board([wish([{ k: 'snd', v: 'thud' }, { k: 'under', v: 6 }], { got: 1, claimed: true }), wish([{ k: 'series', v: 'toys' }])]);
    s.daily = { day: '2026-10-31', guesses: ['popcorn', 'yo-yo'] };
    expect(sanitizeState(s)).not.toBeNull();
  });

  it('moves a save with the old requests to today\'s letters: drops them and lets the board be posted again', () => {
    const s = played();
    s.board = board([{ kind: 'open', by: 'theo', need: 3, got: 3, arg: null, claimed: false }]);
    s.requests = { day: '2026-10-31', list: [{ resident: 'theo', clues: [{ k: 'snd', v: 'thud' }], done: false }], made: ['2026-10-31'] };
    const out: any = sanitizeState(s)!;
    expect(out.requests).toBeUndefined();
    expect(out.board.day).toBeNull();
    expect(out.board.made).toEqual([]);
    expect(out.board.tasks).toHaveLength(1); // the finished job is still paid when the new letters go up
  });

  it('keeps a save whose device clock read a strange year', () => {
    for (const y of [1970, 1999, 2301]) {
      const s = newState(new Date(y, 0, 1).getTime());
      deliver(s, new Date(y, 0, 1).getTime(), rng);
      expect(sanitizeState(JSON.parse(JSON.stringify(s)))).not.toBeNull();
    }
  });

  it('knows every sound an item can make, so no real wish is rejected', () => {
    for (const it of Object.values(ITEMS)) {
      const s: any = played();
      s.board = board([wish([{ k: 'snd', v: it.snd }])]);
      expect(sanitizeState(s)).not.toBeNull();
    }
  });

  it('drops extra fields inside them', () => {
    const s: any = played();
    s.board = board([wish([{ k: 'snd', v: 'thud' }], { html: '<img src=x onerror=alert(1)>' })]);
    s.daily = { day: null, guesses: [], extra: '<b>' };
    const out: any = sanitizeState(s)!;
    expect(out.board.tasks).toEqual([{ kind: 'wish', by: 'theo', need: 1, got: 0, arg: null, claimed: false, clues: [{ k: 'snd', v: 'thud' }] }]);
    expect(out.daily).toEqual({ day: null, guesses: [], played: [] });
  });

  it('drops board tasks and daily guesses that name an unknown id', () => {
    const tasks = [
      wish([{ k: 'snd', v: 'thud' }], { by: 'future-resident' }),
      wish([{ k: 'series', v: 'future-series' }]),
      wish([{ k: 'snd', v: '<img src=x>' }]),
      wish([{ k: 'under', v: 'x' }]),
      wish([{ k: 'note', v: 'hi' }]),
      wish([]),
      wish(undefined as any),
      wish([{ k: 'snd', v: 'thud' }], { arg: 'x' }),
      { kind: 'open', by: 'theo', need: 3, got: 0, arg: null, claimed: false, clues: [{ k: 'snd', v: 'thud' }] },
      wish([{ k: 'over', v: 5 }, { k: 'under', v: 2 }]),
      wish([{ k: 'snd', v: 'thud' }, { k: 'snd', v: 'clack' }]),
    ];
    for (const task of tasks) {
      const s: any = played();
      s.board = board([wish([{ k: 'snd', v: 'thud' }]), task]);
      const out: any = sanitizeState(s);
      expect(out).not.toBeNull();
      expect(out.board.tasks).toHaveLength(1);
      expect(out.board.tasks[0].clues).toEqual([{ k: 'snd', v: 'thud' }]);
    }
    const s: any = played();
    s.daily = { day: '2026-10-31', guesses: ['popcorn', 'future-item'] };
    const out: any = sanitizeState(s)!;
    expect(out.daily.guesses).toEqual(['popcorn']);
  });

  it('still rejects a broken save shape', () => {
    const bad = [
      (s: any) => { s.board = board([1, 2, 3].map(() => wish([{ k: 'snd', v: 'thud' }]))); },
      (s: any) => { s.daily = { day: '2026-10-31', guesses: ['popcorn', 'yo-yo', 'soda-can', 'dumplings'] }; },
      (s: any) => { s.daily = 'x'; },
      (s: any) => { s.unlocked = []; },
      (s: any) => { s.daily = { day: '2026-10-31', guesses: ['popcorn', 'popcorn'] }; },
      (s: any) => { s.daily = { day: '9999-99-99', guesses: [] }; },
      (s: any) => { s.daily = { day: null, guesses: [], played: ['<b>'] }; },
      (s: any) => { s.deliveryDays = Array(61).fill('2026-10-31'); },
      (s: any) => { s.deliveryDays = ['2026-02-30']; },
      (s: any) => { s.unlocked = ['souvenirs']; },
    ];
    for (const f of bad) { const s = played(); f(s); expect(sanitizeState(s)).toBeNull(); }
  });
});
