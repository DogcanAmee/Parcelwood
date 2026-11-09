import { describe, expect, it } from 'vitest';
import { STAMPS } from '../src/core/run';
import type { School } from '../src/core/run';
import { simulate } from './sim/bots';
import type { SimRow } from './sim/bots';

declare const process: { env: Record<string, string | undefined> };
const RUNS = Number(process.env.SIM_RUNS) || 300;
const SCHOOLS = [...new Set(STAMPS.map(s => s.school))] as School[];

function report(rows: SimRow[]): void {
  if (!process.env.SIM_RUNS) return;
  console.log('\n' + rows.map(r =>
    `${r.label.padEnd(22)} win ${(r.winRate * 100).toFixed(1).padStart(5)}%  earned ${r.avgEarned.toFixed(0).padStart(4)}  complaints ${r.avgComplaints.toFixed(2)}`,
  ).join('\n'));
}

describe('station week balance (bots)', () => {
  it('careful play clearly beats blind play, and neither is a sure thing', () => {
    const careful = simulate('careful / random picks', RUNS, 'careful', 'random');
    const plain = simulate('careful / no stamps', RUNS, 'careful', 'none');
    const blind = simulate('blind / random picks', RUNS, 'blind', 'random');
    const schools = SCHOOLS.map(s => simulate('careful / ' + s, RUNS, 'careful', s));
    const bold = SCHOOLS.map(s => simulate('bold / ' + s, RUNS, 'bold', s));
    report([careful, plain, blind, ...schools, ...bold]);
    expect(careful.winRate).toBeGreaterThan(blind.winRate + 0.25);
    expect(careful.winRate).toBeGreaterThan(0.35);
    expect(careful.winRate).toBeLessThan(0.8);
    expect(careful.winRate).toBeGreaterThan(plain.winRate + 0.15);
    const rates = schools.map(s => s.winRate);
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(0.3);
  }, 600_000);
});
