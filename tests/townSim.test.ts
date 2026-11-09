// M3.2 economy check (design section 1.5). Run with 10,000 players through `npm run sim`.
import { describe, expect, it } from 'vitest';
import { mean, median, simulateTown } from './sim/town';

declare const process: { env: Record<string, string | undefined> };
const RUNS = Number(process.env.SIM_RUNS) || 300;

describe('M3.2 town economy (daily player)', () => {
  it('reaches Lv8 in 3-21 days and keeps the day-30 coin curve within 10%', () => {
    const sim = simulateTown(RUNS);
    const lv8 = median(sim.lv8Days);
    const series = median(sim.seriesDays);
    const base = mean(sim.baseCoins);
    const next = mean(sim.newCoins);
    const delta = (next - base) / base;
    console.log(`\nM3.2 economy, ${RUNS} daily players\n` +
      `Lv7 -> Lv8 median: ${lv8} days (min ${Math.min(...sim.lv8Days)}, max ${Math.max(...sim.lv8Days)})\n` +
      `Lost Letter Office complete median: ${series} days after Lv8 (min ${Math.min(...sim.seriesDays)}, max ${Math.max(...sim.seriesDays)})\n` +
      `Coins at day 30: base ${base.toFixed(0)}, M3.2 ${next.toFixed(0)} (+${(delta * 100).toFixed(1)}%)`);
    expect(lv8).toBeGreaterThanOrEqual(3);
    expect(lv8).toBeLessThanOrEqual(21);
    expect(delta).toBeLessThanOrEqual(0.10);
  }, 600_000);
});
