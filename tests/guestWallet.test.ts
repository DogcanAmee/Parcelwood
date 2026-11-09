// @vitest-environment jsdom
// W3: a guest's gem balance follows the player into a full account, moved on the server (0004).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/ui/app';
import { createBackend } from '../src/auth';
import { createMockSaveStore } from '../src/auth/mock';
import type { SaveStore } from '../src/auth/types';
import { newState } from '../src/core/logic';
import { fakePlatform, memKv, ROOTS } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => { expect(el).not.toBeNull(); (el as HTMLElement).click(); };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

let stop: (() => void) | null = null;
async function boot(kv = memKv(), saved: import('../src/core/types').GameState | null = null) {
  if (stop) stop();
  document.body.innerHTML = ROOTS;
  const fp = fakePlatform('ok', kv);
  fp.box.saved = saved;
  stop = startApp(fp.platform, false, createBackend({}, kv, 'http://localhost/'));
  await flush();
  return fp;
}

const play = (opened: number, gems: number) => {
  const s = newState(Date.now());
  s.stats.opened = opened; s.gems = gems;
  return s;
};

beforeEach(() => { window.scrollTo = () => {}; vi.useFakeTimers(); });

describe('guest wallet ticket (mock backend)', () => {
  it('moves the balance once and keeps a retry harmless', async () => {
    const kv = memKv();
    const store = createMockSaveStore(kv) as SaveStore & Required<Pick<SaveStore, 'guestTicket' | 'claimGuestTicket' | 'walletGems'>>;
    const wallet = (id: string) => store.walletGems(id);
    await store.push('g1', play(3, 40), 0);
    const t = (await store.guestTicket('g1'))!;
    expect(t.gems).toBe(40);
    expect(await store.claimGuestTicket('acct', t.token)).toEqual({ balance: 40 });
    expect(await wallet('g1')).toBe(0);
    expect(await store.claimGuestTicket('acct', t.token)).toEqual({ balance: 40 }); // used: same answer, no double
    expect(await wallet('acct')).toBe(40);
  });

  it('reuses the same ticket until it is redeemed', async () => {
    const store = createMockSaveStore(memKv()) as SaveStore & Required<Pick<SaveStore, 'guestTicket'>>;
    await store.push('g1', play(3, 5), 0);
    const a = (await store.guestTicket('g1'))!;
    const b = (await store.guestTicket('g1'))!;
    expect(b.token).toBe(a.token);
  });
});

describe('signing in to an existing account', () => {
  it('moves the guest gems to the account and keeps the account balance', async () => {
    const kv = memKv();
    kv.set('parcelwood.mock.accounts', JSON.stringify({
      'email:owner@example.com': { id: 'acct-1', anonymous: false, email: 'owner@example.com', methods: ['email'] },
    }));
    kv.set('parcelwood.mock.wallets', JSON.stringify({ 'acct-1': 100 }));
    kv.set('parcelwood.mock.cloud.acct-1', JSON.stringify({ state: play(9, 100), version: 3 }));

    const fp = await boot(kv, play(2, 30)); // a guest with 30 gems on this device
    click($('#account'));
    ($('#acc-email') as HTMLInputElement).value = 'owner@example.com';
    click($('#acc-email-go'));
    await flush();
    expect($('#modal-root')!.textContent).toContain('Which progress do you want to keep?');

    click($('[data-keep="cloud"]'));
    await flush();
    expect(fp.box.saved!.stats.opened).toBe(9);
    expect(fp.box.saved!.gems).toBe(130); // 100 on the account + the guest's 30 moved on the server
    expect(kv.get('parcelwood.guestTicket')).toBeNull();
  });

  it('drops the ticket when a guest upgrades in place (same user id)', async () => {
    const kv = memKv();
    const fp = await boot(kv, play(2, 30));
    click($('#account'));
    click($('#acc-google')); // new login: the mock upgrades the guest account in place
    await flush();
    expect(fp.box.saved!.gems).toBe(30); // the wallet never left this account
    expect(kv.get('parcelwood.guestTicket')).toBeNull();
    expect($('#acc-signout')).not.toBeNull(); // now a full account
  });
});
