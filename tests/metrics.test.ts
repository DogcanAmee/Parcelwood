// Play counters for the design v2 checks: guess-first share, daily finish/share, day-1 / day-7 return.
import { describe, expect, it } from 'vitest';
import { METRIC_DAYS, metricsSummary, noteDaily, noteOpen, noteShare, noteVisit } from '../src/core/metrics';
import { newState } from '../src/core/logic';
import { sanitizeState } from '../src/core/sanitize';

const T0 = new Date(2026, 10, 2, 9, 0, 0).getTime();

describe('metrics', () => {
  it('starts empty and says "not known yet" rather than 0%', () => {
    const s = newState(T0);
    expect(s.metrics).toEqual({ first: null, days: [] });
    const m = metricsSummary(s, '2026-11-02');
    expect(m).toMatchObject({ days: 0, opened: 0, guessFirst: null, dailyFinish: null, dailyShare: null, d1: null, d7: null });
  });

  it('guess-first counts only opened parcels', () => {
    const s = newState(T0);
    expect(noteVisit(s, '2026-11-02')).toBe(true);
    expect(noteVisit(s, '2026-11-02')).toBe(false);
    noteOpen(s, '2026-11-02', true); noteOpen(s, '2026-11-02', true); noteOpen(s, '2026-11-02', false); noteOpen(s, '2026-11-02', true);
    const m = metricsSummary(s, '2026-11-02');
    expect(m.opened).toBe(4);
    expect(m.guessFirst).toBe(0.75);
  });

  it('daily finish is per day played, share is per finished puzzle', () => {
    const s = newState(T0);
    noteVisit(s, '2026-11-02'); noteDaily(s, '2026-11-02', false); noteDaily(s, '2026-11-02', true); noteDaily(s, '2026-11-02', false);
    noteShare(s, '2026-11-02');
    noteVisit(s, '2026-11-03'); noteDaily(s, '2026-11-03', true);
    noteVisit(s, '2026-11-04'); noteDaily(s, '2026-11-04', false);
    expect(s.metrics.days.map(d => d.dl)).toEqual([2, 2, 1]);
    const m = metricsSummary(s, '2026-11-04');
    expect(m.dailyFinish).toBeCloseTo(2 / 3);
    expect(m.dailyShare).toBe(0.5);
  });

  it('day-1 / day-7 return: true when seen, false once the day has passed, null before it', () => {
    const s = newState(T0);
    noteVisit(s, '2026-11-02');
    expect(metricsSummary(s, '2026-11-02')).toMatchObject({ d1: null, d7: null });
    expect(metricsSummary(s, '2026-11-04')).toMatchObject({ d1: false, d7: null });
    noteVisit(s, '2026-11-03');
    expect(metricsSummary(s, '2026-11-04')).toMatchObject({ d1: true, d7: null });
    noteVisit(s, '2026-11-09');
    expect(metricsSummary(s, '2026-11-09')).toMatchObject({ d1: true, d7: true });
    expect(metricsSummary(s, '2026-11-12').d7).toBe(true);
  });

  it('day-7 crosses month ends', () => {
    const s = newState(T0);
    noteVisit(s, '2026-11-28'); noteVisit(s, '2026-12-05');
    expect(metricsSummary(s, '2026-12-05').d7).toBe(true);
  });

  it('keeps only the newest days, in order', () => {
    const s = newState(T0);
    for (let i = 0; i < METRIC_DAYS + 5; i++) noteVisit(s, new Date(2026, 0, 1 + i).toISOString().slice(0, 10));
    expect(s.metrics.days.length).toBe(METRIC_DAYS);
    s.metrics.days.forEach((d, i) => { if (i) expect(d.d > s.metrics.days[i - 1].d).toBe(true); });
  });

  it('a save from before the counters, or with broken counters, keeps everything else', () => {
    const a = JSON.parse(JSON.stringify(newState(T0))); delete a.metrics;
    expect(sanitizeState(a)!.metrics).toEqual({ first: null, days: [] });
    const bad = [
      { first: 'x', days: [] },
      { first: null, days: [{ d: '2026-11-02', o: 1, g: 2, dl: 0, sh: 0 }] },
      { first: null, days: [{ d: '2026-11-02', o: 1, g: 0, dl: 3, sh: 0 }] },
      { first: null, days: [{ d: '2026-11-02', o: 1, g: 0, dl: 0, sh: 0 }, { d: '2026-11-02', o: 1, g: 0, dl: 0, sh: 0 }] },
      { first: null, days: [{ d: '2026-11-03', o: 1, g: 0, dl: 0, sh: 0 }, { d: '2026-11-02', o: 1, g: 0, dl: 0, sh: 0 }] },
      'nope',
    ];
    for (const m of bad) {
      const s = JSON.parse(JSON.stringify(newState(T0))); s.coins = 77; s.metrics = m;
      const out = sanitizeState(s)!;
      expect(out).not.toBeNull();
      expect(out.coins).toBe(77);
      expect(out.metrics).toEqual({ first: null, days: [] });
    }
    const ok = JSON.parse(JSON.stringify(newState(T0)));
    ok.metrics = { first: '2026-11-02', days: [{ d: '2026-11-02', o: 3, g: 2, dl: 2, sh: 1 }], extra: 1 };
    expect(sanitizeState(ok)!.metrics).toEqual({ first: '2026-11-02', days: [{ d: '2026-11-02', o: 3, g: 2, dl: 2, sh: 1 }] });
  });
});
