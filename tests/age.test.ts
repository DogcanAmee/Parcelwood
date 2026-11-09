import { describe, expect, it } from 'vitest';
import { checkAge, yearOptions } from '../src/core/age';

const NOW = new Date(2026, 9, 31); // 31 Oct 2026

describe('age screen', () => {
  it('passes players who turned 13 before this month', () => {
    expect(checkAge(2013, 9, NOW)).toBe('ok');   // turned 13 in Sept 2026
    expect(checkAge(1990, 1, NOW)).toBe('ok');
  });
  it('fails players under 13', () => {
    expect(checkAge(2013, 11, NOW)).toBe('under'); // turns 13 next month
    expect(checkAge(2015, 1, NOW)).toBe('under');
  });
  it('fails the birthday month, because the day is unknown', () => {
    expect(checkAge(2013, 10, NOW)).toBe('under');
    expect(checkAge(2012, 10, NOW)).toBe('ok');    // 14 this month: safe either way
  });
  it('fails nonsense input', () => {
    expect(checkAge(2030, 1, NOW)).toBe('under');
    expect(checkAge(2000, 13, NOW)).toBe('under');
    expect(checkAge(NaN, 5, NOW)).toBe('under');
  });
  it('offers 101 years, newest first, so no year suggests the answer', () => {
    const y = yearOptions(NOW);
    expect(y[0]).toBe(2026);
    expect(y).toHaveLength(101);
  });
});
