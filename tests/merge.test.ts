import { describe, expect, it } from 'vitest';
import { keepOne, planMerge } from '../src/core/merge';
import { newState } from '../src/core/logic';
import type { GameState } from '../src/core/types';

const T0 = new Date(2026, 9, 31, 9).getTime();
function played(opened: number, gems = 0): GameState {
  const s = newState(T0); s.stats.opened = opened; s.gems = gems; s.owned = { a: 1, b: opened > 1 ? 1 : 0 }; return s;
}

describe('cloud save rules', () => {
  it('first sign-in with no cloud save uploads the device save', () => {
    expect(planMerge({ state: played(5), owner: 'guest', ownerGuest: true, version: 0, dirty: true }, null, 'u1').action).toBe('push-local');
  });
  it('same account, nothing new anywhere: do nothing', () => {
    expect(planMerge({ state: played(5), owner: 'u1', ownerGuest: false, version: 3, dirty: false }, { state: played(5), version: 3 }, 'u1').action).toBe('none');
  });
  it('same account, progress only on this device: upload', () => {
    expect(planMerge({ state: played(6), owner: 'u1', ownerGuest: false, version: 3, dirty: true }, { state: played(5), version: 3 }, 'u1').action).toBe('push-local');
  });
  it('same account, another device played since: take the cloud save', () => {
    expect(planMerge({ state: played(5), owner: 'u1', ownerGuest: false, version: 3, dirty: false }, { state: played(9), version: 4 }, 'u1').action).toBe('take-cloud');
  });
  it('same account, both played: ask, and never add gems together', () => {
    const plan = planMerge({ state: played(6, 60), owner: 'u1', ownerGuest: false, version: 3, dirty: true }, { state: played(9, 60), version: 4 }, 'u1');
    expect(plan).toMatchObject({ action: 'ask', sameAccount: true });
    expect(keepOne(played(9, 60), played(6, 60)).gems).toBe(60);
  });
  it('guest with no progress signs in to an account: take the account save', () => {
    expect(planMerge({ state: played(0), owner: 'guest', ownerGuest: true, version: 0, dirty: true }, { state: played(9), version: 2 }, 'u1').action).toBe('take-cloud');
  });
  it('guest with progress signs in to an empty account: keep the guest save', () => {
    expect(planMerge({ state: played(4), owner: 'guest', ownerGuest: true, version: 0, dirty: true }, { state: played(0), version: 1 }, 'u1').action).toBe('push-local');
  });
  it('guest and account both have progress: ask; gems stay with the server wallet, not the pick', () => {
    const plan = planMerge({ state: played(4, 60), owner: 'guest', ownerGuest: true, version: 0, dirty: true }, { state: played(9, 330), version: 2 }, 'u1');
    expect(plan).toMatchObject({ action: 'ask', sameAccount: false, local: { opened: 4, gems: 60 }, cloud: { opened: 9, gems: 330 } });
    const kept = keepOne(played(9, 330), played(4, 60));
    expect(kept.gems).toBe(330); // the guest's 60 arrive through the ticket (0004), not by adding counters here
    expect(kept.stats.opened).toBe(9);
  });

  it("a save left by another full account is never uploaded to a new guest", () => {
    // Signed out elsewhere or session expired: the device still holds account X's save, now a new guest G arrives.
    expect(planMerge({ state: played(9, 330), owner: 'x', ownerGuest: false, version: 4, dirty: false }, null, 'g').action).toBe('fresh');
  });
  it("signing in to a different full account takes that account's save and adds no gems", () => {
    expect(planMerge({ state: played(9, 330), owner: 'x', ownerGuest: false, version: 4, dirty: true }, { state: played(2, 60), version: 1 }, 'y').action).toBe('take-cloud');
  });
  it('a guest whose only progress is hearts from requests keeps it when signing in to an empty account', () => {
    const g = newState(T0); g.hearts = { theo: 1 };
    expect(planMerge({ state: g, owner: 'guest', ownerGuest: true, version: 0, dirty: true }, { state: newState(T0), version: 1 }, 'u1').action).toBe('push-local');
  });
  it('a save from before accounts existed counts as a guest save', () => {
    expect(planMerge({ state: played(4), owner: null, ownerGuest: true, version: 0, dirty: true }, null, 'u1').action).toBe('push-local');
  });
});
