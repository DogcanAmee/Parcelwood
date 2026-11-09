// One tab at a time may write the device save (ship plan W1). Uses the browser's Web Locks API:
// the first tab holds the lock; another tab can take it over ("Play here"), and the old tab is told it lost it.
// Browsers without Web Locks keep the old behavior (every tab saves).
import type { Platform } from './types';

export const SAVE_LOCK = 'parcelwood-save';

/** The part of `navigator.locks` this module uses. */
export interface LockManagerLike {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean }, callback: (lock: unknown) => unknown): Promise<unknown>;
}

/** 'held' = this tab may save; 'busy' = another tab has the game open; 'unsupported' = no Web Locks, saving is not limited. */
export type TabClaim = 'held' | 'busy' | 'unsupported';

export interface TabLock {
  held(): boolean;
  release(): void;
}

const FREE_PASS: TabLock = { held: () => true, release() { /* nothing held */ } };

/** Asks for the save lock. `steal` takes it from another tab; that tab's `onLost` then runs. */
export function claimTab(locks: LockManagerLike | undefined, opts: { steal?: boolean; onLost: () => void }, name = SAVE_LOCK): Promise<{ claim: TabClaim; lock: TabLock }> {
  if (!locks || typeof locks.request !== 'function') return Promise.resolve({ claim: 'unsupported', lock: FREE_PASS });
  return new Promise(resolve => {
    let held = false;
    let letGo: () => void = () => {};
    const lock: TabLock = { held: () => held, release() { if (held) { held = false; letGo(); } } };
    const granted = (got: unknown) => {
      if (!got) { resolve({ claim: 'busy', lock }); return undefined; }
      held = true;
      resolve({ claim: 'held', lock });
      return new Promise<void>(done => { letGo = done; });
    };
    let asked: Promise<unknown>;
    try {
      asked = locks.request(name, opts.steal ? { steal: true } : { ifAvailable: true }, granted);
    } catch {
      resolve({ claim: 'unsupported', lock: FREE_PASS });
      return;
    }
    asked.catch(() => {
      if (held) { held = false; opts.onLost(); return; }
      resolve({ claim: 'unsupported', lock: FREE_PASS });
    });
  });
}

/** The same platform, except the game save is only written while this tab holds the lock. */
export function lockedPlatform(platform: Platform, lock: TabLock): Platform {
  return { ...platform, saveState(state) { if (lock.held()) platform.saveState(state); } };
}
