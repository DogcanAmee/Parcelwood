// @vitest-environment jsdom
// Age screen and account page against the local mock backend.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { fakePlatform, memKv, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function pick(id: string, value: string) { const s = $(id) as HTMLSelectElement; s.value = value; }

// Each boot stops the previous app, so only one set of listeners is live.
let stop: (() => void) | null = null;
async function boot(age: 'ok' | 'under' | null, kv = memKv(), saved: import('../src/core/types').GameState | null = null) {
  if (stop) stop();
  document.body.innerHTML = ROOTS;
  const fp = fakePlatform(age, kv);
  fp.box.saved = saved;
  stop = startApp(fp.platform, false, createBackend({}, kv, 'http://localhost/'));
  await flush();
  return fp;
}

beforeEach(() => { window.scrollTo = () => {}; vi.useFakeTimers(); });

describe('age screen', () => {
  it('asks first, and starts the game after a passing answer', async () => {
    const { box } = await boot(null);
    expect($('#age-gate')).not.toBeNull();
    expect(document.querySelectorAll('[data-parcel]').length).toBe(0);
    click($('#age-go'));                       // nothing picked
    expect($('[role="alert"]')).not.toBeNull();
    pick('#age-m', '1'); pick('#age-y', '1995');
    click($('#age-go'));
    await flush();
    expect(box.age).toBe('ok');
    expect(document.querySelectorAll('[data-parcel]').length).toBeGreaterThan(0);
  });

  it('blocks under-13 players and stores only the result', async () => {
    const { box, platform } = await boot(null);
    pick('#age-m', '6'); pick('#age-y', String(new Date().getFullYear() - 8));
    click($('#age-go'));
    await flush();
    expect(box.age).toBe('under');
    expect($('#age-blocked')).not.toBeNull();
    expect(box.saved).toBeNull();
    expect([...(platform.kv as ReturnType<typeof memKv>).data.keys()].some(k => k.includes('mock.session'))).toBe(false); // no account made
  });

  it('stays blocked on the next visit', async () => {
    await boot('under');
    expect($('#age-blocked')).not.toBeNull();
    expect($('#age-gate')).toBeNull();
  });
});

describe('account page', () => {
  it('starts as a guest, signs in by email, and uploads progress', async () => {
    const kv = memKv();
    await boot('ok', kv);
    click($('#account'));
    expect($('#app')!.textContent).toContain('Playing as a guest');
    expect($('#acc-apple')).not.toBeNull();     // Apple offered next to Google
    expect($('#acc-google')).not.toBeNull();
    ($('#acc-email') as HTMLInputElement).value = 'tao@example.com';
    click($('#acc-email-go'));
    await flush(); vi.advanceTimersByTime(4000); await flush();
    expect($('#app')!.textContent).toContain('tao@example.com');
    const cloudKey = [...kv.data.keys()].find(k => k.startsWith('parcelwood.mock.cloud.'));
    expect(cloudKey).toBeTruthy();
  });

  it('rejects a bad email address', async () => {
    await boot('ok');
    click($('#account'));
    ($('#acc-email') as HTMLInputElement).value = 'not-an-email';
    click($('#acc-email-go'));
    await flush();
    expect($('[role="status"]')!.textContent).toContain('does not look right');
  });

  it('deletes the account after a confirm step and starts a new guest game', async () => {
    const kv = memKv();
    const { box } = await boot('ok', kv);
    click($('#account'));
    click($('#acc-google'));
    await flush();
    const signedIn = JSON.parse(kv.get('parcelwood.mock.session')!);
    expect(signedIn.anonymous).toBe(false);
    click($('#acc-delete'));
    expect($('#modal-root')!.textContent).toContain('Delete your account?');
    click($('#acc-delete-yes'));
    await flush();
    const after = JSON.parse(kv.get('parcelwood.mock.session')!);
    expect(after.anonymous).toBe(true);
    expect(after.id).not.toBe(signedIn.id);
    expect(kv.get('parcelwood.mock.cloud.' + signedIn.id)).toBeNull();
    expect(box.saved!.stats.opened).toBe(0);
    expect($('#app')!.textContent).toContain('Your account is deleted');
  });

  it('asks which progress to keep when a guest signs in to an account that already has progress', async () => {
    const kv = memKv();
    // Device 1: sign in with Apple, open a parcel, upload.
    let fp = await boot('ok', kv);
    click($('#account')); click($('#acc-apple')); await flush();
    const acct = JSON.parse(kv.get('parcelwood.mock.session')!).id;
    kv.set('parcelwood.mock.cloud.' + acct, JSON.stringify({ state: { ...fp.box.saved!, gems: 330, stats: { ...fp.box.saved!.stats, opened: 9 } }, version: 5 }));
    kv.set('parcelwood.mock.wallets', JSON.stringify({ [acct]: 330 })); // the account's server balance
    // Device 2 (same mock account list, new guest session) with its own progress.
    kv.remove('parcelwood.mock.session'); kv.remove('parcelwood.saveMeta');
    fp = await boot('ok', kv);
    const guestSave = { ...fp.box.saved!, gems: 60, stats: { ...fp.box.saved!.stats, opened: 3 } };
    const fp2 = await boot('ok', kv, guestSave); // reopen with guest progress on this device
    // The guest bought 60 gems: they sit in the guest wallet on the server, not in the save.
    const guest = JSON.parse(kv.get('parcelwood.mock.session')!).id;
    kv.set('parcelwood.mock.wallets', JSON.stringify({ ...JSON.parse(kv.get('parcelwood.mock.wallets')!), [guest]: 60 }));
    click($('#account')); click($('#acc-apple')); await flush();
    expect($('#modal-root')!.textContent).toContain('Which progress do you want to keep?');
    click($('[data-keep="cloud"]'));
    await flush();
    expect(fp2.box.saved!.stats.opened).toBe(9);
    expect(fp2.box.saved!.gems).toBe(390);   // the guest wallet (60) moved into the account (330)
  });

  it('loads an account save made before the Town page and fills in wish letters and the daily puzzle', async () => {
    const kv = memKv();
    let fp = await boot('ok', kv);
    click($('#account')); click($('#acc-apple')); await flush();
    const acct = JSON.parse(kv.get('parcelwood.mock.session')!).id;
    const old: any = { ...fp.box.saved!, stats: { ...fp.box.saved!.stats, opened: 40 } }; // enough history for town Lv2, where requests start
    delete old.requests; delete old.daily; delete old.town;
    kv.set('parcelwood.mock.cloud.' + acct, JSON.stringify({ state: old, version: 9 }));
    kv.remove('parcelwood.saveMeta');
    fp = await boot('ok', kv); // a fresh device signed in to that account takes the cloud save
    await flush();
    expect(fp.box.saved!.stats.opened).toBe(40);
    expect(fp.box.saved!.town.rep).toBe(40);
    expect(fp.box.saved!.board.tasks.filter(x => x.kind === 'wish').length).toBe(2);
    expect(fp.box.saved!.daily).toEqual({ day: null, guesses: [], played: [] });
    click(document.querySelector('[data-view="town"]'));
    expect($('#daily')).not.toBeNull();
  });

  it('sign out uploads first, leaves the account save alone, and signing back in restores it without doubling gems', async () => {
    const kv = memKv();
    const { box } = await boot('ok', kv);
    click($('#account')); click($('#acc-google')); await flush();
    const acct = JSON.parse(kv.get('parcelwood.mock.session')!).id;
    // Progress made just now, still inside the upload delay.
    click($('[data-view="station"]'));
    const p = box.saved!.parcels.find(x => x.kind === 'normal')!;
    click(document.querySelector(`[data-parcel="${p.id}"]`)); click($('#go-open'));
    vi.advanceTimersByTime(5000); if ($('#skip')) click($('#skip')); vi.advanceTimersByTime(1000);
    const opened = box.saved!.stats.opened;
    expect(opened).toBe(1);
    click($('#account')); click($('#acc-signout')); await flush(); await flush();
    const cloudX = JSON.parse(kv.get('parcelwood.mock.cloud.' + acct)!);
    expect(cloudX.state.stats.opened).toBe(1);         // uploaded before signing out
    expect(box.saved!.stats.opened).toBe(0);           // device is a fresh guest game
    vi.advanceTimersByTime(4000); await flush();
    expect(JSON.parse(kv.get('parcelwood.mock.cloud.' + acct)!).version).toBe(cloudX.version); // the guest never wrote to X
    click($('#acc-google')); await flush(); await flush();
    expect(box.saved!.stats.opened).toBe(1);           // X's progress back
    expect($('#modal-root')!.textContent).not.toContain('Which progress');
  });
});
