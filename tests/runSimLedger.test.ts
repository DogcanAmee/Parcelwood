import { describe, expect, it } from 'vitest';
import { simulate } from './sim/bots';
import type { SimRow } from './sim/bots';

declare const process: { env: Record<string, string | undefined> };
const RUNS = Number(process.env.SIM_RUNS) || 400;

function report(rows: SimRow[]): void {
  if (!process.env.SIM_RUNS) return;
  console.log('\n' + rows.map(r =>
    `${r.label.padEnd(24)} win ${(r.winRate * 100).toFixed(1).padStart(5)}%  earned ${r.avgEarned.toFixed(0).padStart(4)}  complaints ${r.avgComplaints.toFixed(2)}`,
  ).join('\n'));
}

describe('station week ledger balance', () => {
  it('raises the win ceiling without making every run a win', () => {
    const base = simulate('base', RUNS, 'careful', 'random');
    const maxed = simulate('max ledger', RUNS, 'careful', 'random', 0, { ap: 1, storage: 2, checks: 1, coins: 2, keen: 1 });
    report([base, maxed]);
    expect(maxed.winRate).toBeGreaterThan(base.winRate + 0.1);
    expect(maxed.winRate).toBeLessThan(0.9);
  }, 600_000);
});
