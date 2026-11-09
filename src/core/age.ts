// Neutral age screen. The player picks a birth month and year with no hint of the right answer.
// Only the pass/fail result is kept, never the birth date.

export const MIN_AGE = 13;

/**
 * What happens below MIN_AGE. Decided 2026-10-31: 'block'.
 * - 'block': the game does not start. Nothing is stored except the result.
 * - 'local': play on this device only. No account, no purchases, no personalised ads. Kept working but unused.
 */
export type UnderAgePolicy = 'block' | 'local';
export const UNDER_AGE_POLICY: UnderAgePolicy = 'block';

export type AgeResult = 'ok' | 'under';

/** Full years old on `now`, from birth month (1-12) and year. The birth day is unknown, so the 1st counts. */
export function ageOn(birthYear: number, birthMonth: number, now: Date): number {
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth) age -= 1;
  return age;
}

/**
 * Pass/fail for the gate. The birth day is unknown, so a player who turns MIN_AGE later this month fails:
 * the check errs on the side of the child.
 */
export function checkAge(birthYear: number, birthMonth: number, now: Date): AgeResult {
  if (!Number.isInteger(birthYear) || !Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) return 'under';
  if (birthYear > now.getFullYear()) return 'under';
  let age = ageOn(birthYear, birthMonth, now);
  if (now.getMonth() + 1 === birthMonth) age -= 1; // birthday month: not yet sure the birthday has passed
  return age >= MIN_AGE ? 'ok' : 'under';
}

/** Year options for the picker: this year back 100 years, newest first. No year is pre-selected. */
export function yearOptions(now: Date): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 101 }, (_, i) => y - i);
}
