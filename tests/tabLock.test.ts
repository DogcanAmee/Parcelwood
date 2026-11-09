// @vitest-environment jsdom
// Ship plan W1: only one tab writes the save. A fake Web Locks manager plays two tabs in one page.
import { describe, expect, it, vi } from 'vitest';
import { claimTab, lockedPlatform, type LockManagerLike } from '../src/platform/tabLock';
import { startSingleTab } from '../src/ui/tabGuard';
import { newState } from '../src/core/logic';
import { fakePlatform, ROOTS } from './helpers';

/** Same rules as navigator.locks for one exclusive lock: ifAvailable gets null when taken; steal rejects the old holder with AbortError. */
function fakeLocks(): LockManagerLike {
  const holders = new Map<string, { reject: (e: unknown) => void }>();
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const current = holders.get(name);
        if (current && options.ifAvailable) { Promise.resolve(callback(null)).then(resolve, reject); return; }
        if (current && !options.steal) throw new Error('fake only supports ifAvailable or steal');
        if (current) { holders.delete(name); current.reject(new DOMException('Lock broken by steal', 'AbortError')); }
        const entry = { reject };
        holders.set(name, entry);
        Promise.resolve(callback({ name })).then(value => { if (holders.get(name) === entry) holders.delete(name); resolve(value); }, reject);
      });
    },
  };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('claimTab', () => {
  it('gives the lock to the first tab and reports busy to the second', async () => {
    const locks = fakeLocks();
    const a = await claimTab(locks, { onLost: () => {} });
    const b = await claimTab(locks, { onLost: () => {} });
    expect(a.claim).toBe('held');
    expect(b.claim).toBe('busy');
    expect(b.lock.held()).toBe(false);
  });

  it('lets a tab take over; the old tab is told and stops holding', async () => {
    const locks = fakeLocks();
    const lostA = vi.fn();
    const a = await claimTab(locks, { onLost: lostA });
    const b = await claimTab(locks, { steal: true, onLost: () => {} });
    await flush();
    expect(b.claim).toBe('held');
    expect(a.lock.held()).toBe(false);
    expect(lostA).toHaveBeenCalledTimes(1);
  });

  it('frees the lock on release so the next tab gets it', async () => {
    const locks = fakeLocks();
    const a = await claimTab(locks, { onLost: () => {} });
    a.lock.release();
    await flush();
    expect((await claimTab(locks, { onLost: () => {} })).claim).toBe('held');
  });

  it('does not limit saving where Web Locks are missing or refused', async () => {
    expect((await claimTab(undefined, { onLost: () => {} })).claim).toBe('unsupported');
    const throwing: LockManagerLike = { request() { throw new DOMException('denied', 'SecurityError'); } };
    const r = await claimTab(throwing, { onLost: () => {} });
    expect(r.claim).toBe('unsupported');
    expect(r.lock.held()).toBe(true);
  });
});

describe('lockedPlatform', () => {
  it('drops save writes once the lock is gone', async () => {
    const { platform, box } = fakePlatform('ok');
    const locks = fakeLocks();
    const a = await claimTab(locks, { onLost: () => {} });
    const guarded = lockedPlatform(platform, a.lock);
    const s = newState(Date.now());
    guarded.saveState(s);
    expect(box.saved).not.toBeNull();
    box.saved = null;
    await claimTab(locks, { steal: true, onLost: () => {} });
    await flush();
    guarded.saveState(s);
    expect(box.saved).toBeNull();
  });
});

describe('startSingleTab', () => {
  it('second tab waits; "Play here" moves the game and stops the first tab', async () => {
    document.body.innerHTML = ROOTS;
    const { platform } = fakePlatform('ok');
    const locks = fakeLocks();
    const stopA = vi.fn(), stopB = vi.fn();
    const startA = vi.fn(() => stopA), startB = vi.fn(() => stopB);

    startSingleTab(platform, locks, startA);
    await flush();
    expect(startA).toHaveBeenCalledTimes(1);

    startSingleTab(platform, locks, startB);
    await flush();
    expect(startB).not.toHaveBeenCalled();
    expect(document.querySelector('#tab-busy')).not.toBeNull();
    expect(document.querySelector('#tab-busy h2')!.textContent).toBe('Already open in another tab');

    (document.querySelector('#tab-here') as HTMLButtonElement).click();
    await flush(); await flush();
    expect(startB).toHaveBeenCalledTimes(1);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#tab-moved')).not.toBeNull();
  });

  it('starts normally without Web Locks', async () => {
    document.body.innerHTML = ROOTS;
    const { platform } = fakePlatform('ok');
    const start = vi.fn(() => () => {});
    startSingleTab(platform, undefined, start);
    await flush();
    expect(start).toHaveBeenCalledTimes(1);
  });
});
