import { describe, expect, it } from 'vitest';
import { createDiscordAuth } from '../../src/discord/auth';
import { createMockDiscord, type MockOptions } from '../../src/discord/mock';
import { createDiscordStore, formatMinor, type ClaimBackend, type Grant } from '../../src/discord/store';
import { memKv } from '../helpers';
import { cfg } from './helpers';

async function setup(opts: MockOptions = {}, wrap?: (b: ClaimBackend) => ClaimBackend) {
  const kv = memKv();
  const m = createMockDiscord(cfg, kv, opts);
  const auth = createDiscordAuth(m.sdk, m.bridge);
  await auth.init();
  const store = createDiscordStore(m.sdk, cfg, wrap ? wrap(m.claims) : m.claims, kv, () => auth.user()?.id ?? null);
  const wallet = { gems: 0, grants: [] as Grant[], balance: null as number | null };
  store.onGrant(g => { wallet.gems += g.gems; wallet.grants.push(g); });
  store.onBalance(b => { wallet.balance = b; });
  await store.start();
  return { kv, m, store, wallet, auth };
}

const entitlementFor = (kv: ReturnType<typeof memKv>, sku: string): string => {
  const all = JSON.parse(kv.get('parcelwood.mock.discord.entitlements') || '[]') as { id: string; sku_id: string }[];
  const mine = all.filter(e => e.sku_id === sku);
  return mine[mine.length - 1].id;
};

describe('Discord shop', () => {
  it('doubles the first gem pack, then sells it at the normal amount', async () => {
    const { store, wallet } = await setup();
    expect(await store.buy('gems60')).toBe('ok');
    expect(wallet.gems).toBe(120);
    expect(await store.buy('gems60')).toBe('ok');
    expect(wallet.gems).toBe(180);
    expect(await store.buy('gems330')).toBe('ok');
    expect(wallet.gems).toBe(180 + 660);
  });

  it('delivers each purchase once, however often it is claimed', async () => {
    const { store, wallet } = await setup();
    await store.buy('gems330');
    await store.claim(); await store.claim();
    await Promise.all([store.claim(), store.claim()]);
    expect(wallet.grants).toHaveLength(1);
  });

  it('does not offer purchases in the phone apps', async () => {
    const { store, wallet } = await setup({ platform: 'mobile' });
    expect(store.canBuy()).toBe(false);
    expect(await store.buy('gems60')).toBe('mobile');
    expect(wallet.gems).toBe(0);
  });

  it('gives nothing when the payment window is closed', async () => {
    const { store, wallet } = await setup({ decline: () => true });
    expect(await store.buy('gems60')).toBe('not-completed');
    expect(wallet.gems).toBe(0);
  });

  it('sells the uniform once', async () => {
    const { store, wallet } = await setup();
    expect(store.owns('outfit')).toBe(false);
    expect(await store.buy('outfit')).toBe('ok');
    expect(store.owns('outfit')).toBe(true);
    expect(wallet.grants.map(g => [g.product, g.gems])).toEqual([['outfit', 0]]);
    expect(await store.buy('outfit')).toBe('owned');
  });

  it('keeps an order for later if the game could not add it, and adds it on the next claim', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    const store = createDiscordStore(m.sdk, cfg, m.claims, kv, () => auth.user()?.id ?? null);
    let fail = true, gems = 0;
    store.onGrant(g => { if (fail) throw new Error('save failed'); gems += g.gems; });
    expect(await store.buy('gems60')).toBe('pending');
    expect(gems).toBe(0);
    fail = false;
    await store.claim();
    expect(gems).toBe(120);
  });

  it('keeps a claimed order on this device when the server cannot be reached, and finishes it later', async () => {
    let fail = true, offline = false;
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    const store = createDiscordStore(m.sdk, cfg, { ...m.claims, claim: async () => { if (offline) throw new Error('offline'); return m.claims.claim(); } }, kv, () => auth.user()?.id ?? null);
    let gems = 0;
    store.onGrant(g => { if (fail) throw new Error('save failed'); gems += g.gems; });
    expect(await store.buy('gems60')).toBe('pending'); // claimed from the server, but the save failed
    offline = true; fail = false;
    await store.claim();                                // server unreachable: the order is still on this device
    expect(gems).toBe(120);
    expect(await store.claim()).toEqual([]);
  });

  it('gives each order to one device only when two claim at the same moment', async () => {
    const kv = memKv();                                  // one shared fake server and Discord account
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    await m.sdk.commands.startPurchase({ sku_id: cfg.skus.gems330! });
    const devices = [memKv(), memKv()].map(local => {
      const s = createDiscordStore(m.sdk, cfg, m.claims, local, () => auth.user()?.id ?? null);
      const w = { gems: 0 };
      s.onGrant(g => { w.gems += g.gems; });
      return { s, w };
    });
    await Promise.all(devices.map(d => d.s.claim()));
    expect(devices[0].w.gems + devices[1].w.gems).toBe(660);
  });

  it('keeps one player\'s waiting order away from another account on the same computer', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    let who: string | null = auth.user()!.id;
    const store = createDiscordStore(m.sdk, cfg, m.claims, kv, () => who);
    let fail = true, gems = 0;
    store.onGrant(g => { if (fail) throw new Error('not ready'); gems += g.gems; });
    expect(await store.buy('gems60')).toBe('pending');
    const first = who;
    who = 'someone-else'; fail = false;
    await store.claim().catch(() => {});
    expect(gems).toBe(0);
    who = first;
    await store.claim();
    expect(gems).toBe(120);
  });

  it('does not take payment when nobody is signed in', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const store = createDiscordStore(m.sdk, cfg, m.claims, kv, () => null);
    store.onGrant(() => {});
    expect(await store.buy('gems60')).toBe('unavailable');
    expect((await m.sdk.commands.getEntitlements()).entitlements).toHaveLength(0);
  });

  it('does not claim before the game is ready to receive gems', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    const store = createDiscordStore(m.sdk, cfg, m.claims, kv, () => auth.user()?.id ?? null);
    await m.sdk.commands.startPurchase({ sku_id: cfg.skus.gems60! });
    expect(await store.claim()).toEqual([]);
    let gems = 0;
    store.onGrant(g => { gems += g.gems; });
    await store.claim();
    expect(gems).toBe(120);
  });

  it('ignores orders for products this build does not know', async () => {
    const { store, wallet } = await setup({}, b => ({ ...b, claim: async () => [...(await b.claim()), { orderId: '9999999', product: 'noads' as never, gems: 999 }] }));
    await store.buy('gems60');
    expect(wallet.gems).toBe(120);
  });

  it('shows Discord prices in the player\'s currency, and only products with a SKU', async () => {
    const { store } = await setup();
    const offers = await store.offers('en-US');
    expect(offers.map(o => [o.id, o.price])).toEqual([['gems60', '$0.99'], ['gems330', '$4.99'], ['outfit', '$1.99']]);
    expect(formatMinor(500, 'JPY', 'en-US')).toBe('¥500');
    expect(formatMinor(199, 'EUR', 'de-DE')).toMatch(/1,99/);
  });
});

describe('Discord shop: server balance and refunds', () => {
  it('gives the game the server balance after each claim', async () => {
    const { store, wallet } = await setup();
    await store.buy('gems60');
    expect(wallet.balance).toBe(120);
    await store.buy('gems330');
    expect(wallet.balance).toBe(120 + 660);
  });

  it('takes back the gems of a refunded purchase', async () => {
    const { kv, m, store, wallet } = await setup();
    await store.buy('gems60');
    await store.buy('gems330');
    m.refund(entitlementFor(kv, cfg.skus.gems330!));
    expect(await store.claim()).toEqual([]);
    expect(wallet.balance).toBe(120);
  });

  it('never delivers a purchase refunded before it was claimed', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    const [e] = (await m.sdk.commands.startPurchase({ sku_id: cfg.skus.gems330! }))!;
    await m.claims.sync();                    // recorded on the server, not yet claimed by any device
    m.refund(e.id);
    const store = createDiscordStore(m.sdk, cfg, m.claims, kv, () => auth.user()?.id ?? null);
    const wallet = { grants: [] as Grant[], balance: null as number | null };
    store.onGrant(g => { wallet.grants.push(g); });
    store.onBalance(b => { wallet.balance = b; });
    await store.claim();
    expect(wallet.grants).toEqual([]);
    expect(wallet.balance).toBe(0);
  });

  it('does not hand over the balance while an order still waits on this device', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    const store = createDiscordStore(m.sdk, cfg, m.claims, kv, () => auth.user()?.id ?? null);
    const balances: number[] = [];
    let fail = true;
    store.onGrant(() => { if (fail) throw new Error('save failed'); });
    store.onBalance(b => balances.push(b));
    expect(await store.buy('gems60')).toBe('pending');
    expect(balances).toEqual([]);             // the waiting order is in the server balance: showing it now would count it twice
    fail = false;
    await store.claim();
    expect(balances).toEqual([120]);
  });

  it('brings in gems delivered on another device', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await auth.init();
    const [a, b] = [memKv(), memKv()].map(local => {
      const s = createDiscordStore(m.sdk, cfg, m.claims, local, () => auth.user()?.id ?? null);
      const w = { gems: 0, balance: null as number | null };
      s.onGrant(g => { w.gems += g.gems; });
      s.onBalance(x => { w.balance = x; });
      return { s, w };
    });
    await a.s.buy('gems330');
    expect(a.w.gems).toBe(660);
    await b.s.claim();
    expect(b.w.gems).toBe(0);
    expect(b.w.balance).toBe(660);
  });
});
