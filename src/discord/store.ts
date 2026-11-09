// Shop for the Discord build: Discord's own payment window, server-checked grants.
//
// Buying: startPurchase opens Discord's payment window (desktop app and browser only; the phone apps cannot buy).
// Granting: the game never trusts the purchase result in the page. It asks our server (discord-claim) to read the
// player's purchases from Discord, record each one once, and use up gem packs at Discord. Then it claims the
// recorded orders in one server statement (claim_discord_orders), so two devices can never both get the same
// order, like the web build's claim_web_orders.
// Claimed orders go into a local inbox for this player before any gems are added, and leave it only once the
// game has added them and saved. If anything stops halfway (closed window, failed save), the next claim on this
// device finishes them; a local list of delivered order ids stops one order adding gems twice.
// The server keeps the real gem balance (supabase/migrations/0003). After every claim that leaves the inbox empty,
// the game is given that balance, which also brings in refunds and orders delivered on another device.
import type { BuyResult, Grant, Kv, Product, ProductId, StoreService } from '../platform/types';
import { DISCORD_PRODUCTS, type DiscordConfig, type DiscordProductId } from './config';
import { canPurchase, type DiscordSdkLike, type SdkEntitlement } from './sdk';

export type { BuyResult, Grant } from '../platform/types';

/** Server side of purchases. Real: ./supabase.ts. Local: ./mock.ts. */
export interface ClaimBackend {
  /** Server reads this player's purchases from Discord and records new ones. */
  sync(): Promise<void>;
  /** Takes every recorded, unclaimed order of this player and marks it claimed, in one step. */
  claim(): Promise<Grant[]>;
  /** The player's gem balance on the server (never below 0). */
  wallet?(): Promise<number>;
}

export interface ShopOffer {
  id: DiscordProductId;
  /** Price as Discord shows it to this player (their currency), or the US list price if Discord has not answered. */
  price: string;
  owned: boolean;
}

/** The Discord shop is a StoreService plus the delivery details the game needs. */
export interface DiscordStore extends StoreService {
  canBuy(): boolean;
  offers(locale?: string): Promise<ShopOffer[]>;
  owns(id: ProductId): boolean;
  buy(id: ProductId): Promise<BuyResult>;
  /** Delivers finished purchases. Needs a signed-in player and a grant handler; returns what was added now. */
  claim(): Promise<Grant[]>;
  /** Called with the server's gem balance after a claim; the game shows and saves that number. */
  onBalance(handler: (gems: number) => void): void;
  /** Starts listening for Discord's purchase event. */
  start(): Promise<void>;
}

const DELIVERED = 'parcelwood.discord.delivered';
const INBOX = 'parcelwood.discord.inbox.'; // + game user id: claimed here, not yet added to the game
const KEEP = 500;

export function formatMinor(amount: number, currency: string, locale = 'en-US'): string {
  try {
    const f = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const digits = f.resolvedOptions().maximumFractionDigits ?? 2;
    return f.format(amount / 10 ** digits);
  } catch {
    return (amount / 100).toFixed(2) + ' ' + currency;
  }
}

/** owner: the signed-in game account id, or null. Orders are claimed only for a signed-in player. */
export function createDiscordStore(sdk: DiscordSdkLike, cfg: DiscordConfig, backend: ClaimBackend, kv: Kv, owner: () => string | null): DiscordStore {
  let handler: ((g: Grant) => void) | null = null;
  let balanceHandler: ((gems: number) => void) | null = null;
  let claiming: Promise<Grant[]> | null = null;
  let buying = false;
  let entitlements: SdkEntitlement[] = [];

  const delivered = (): string[] => {
    try { const v = JSON.parse(kv.get(DELIVERED) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
  };
  const remember = (ids: string[]) => kv.set(DELIVERED, JSON.stringify(ids.slice(-KEEP)));

  async function refreshEntitlements() {
    try { entitlements = (await sdk.commands.getEntitlements()).entitlements || []; } catch { /* keep the last known list */ }
  }

  const known = (g: unknown): g is Grant => {
    const x = g as Grant;
    return !!x && typeof x.orderId === 'string' && DISCORD_PRODUCTS.some(p => p.id === x.product)
      && Number.isInteger(x.gems) && x.gems >= 0 && x.gems <= 10000;
  };
  const inbox = (uid: string): Grant[] => {
    try { const v = JSON.parse(kv.get(INBOX + uid) || '[]'); return Array.isArray(v) ? v.filter(known) : []; } catch { return []; }
  };
  const keepInbox = (uid: string, list: Grant[]) => (list.length ? kv.set(INBOX + uid, JSON.stringify(list)) : kv.remove(INBOX + uid));

  // Discord's purchase event. Tried again at each claim (which runs only once signed in), in case the client
  // refused it before sign-in. Without it, purchases are still claimed after startPurchase and at start.
  let listening = false;
  async function listen() {
    if (listening) return;
    try { await sdk.subscribe('ENTITLEMENT_CREATE', () => { store.claim().catch(() => {}); }); listening = true; } catch { /* try again later */ }
  }

  async function claimNow(): Promise<Grant[]> {
    const uid = owner();
    if (!handler || !uid) return [];
    await listen();
    try { await backend.sync(); } catch { /* Discord or our server unreachable: still deliver orders recorded earlier */ }
    let box = inbox(uid);
    let fresh: Grant[] = [];
    try { fresh = await backend.claim(); } catch { /* offline: finish what this device already claimed */ }
    // Unknown products are left out: an older build cannot add them (claimed orders of that kind stay on record).
    for (const g of fresh.filter(known)) if (!box.some(b => b.orderId === g.orderId)) box.push(g);
    keepInbox(uid, box);               // saved before any gems are added, so a crash cannot lose a claimed order
    const done = delivered();
    const added: Grant[] = [];
    while (box.length) {
      const g = box[0];
      if (!done.includes(g.orderId)) {
        handler(g);                    // adds and saves; a throw leaves this and later orders in the inbox
        done.push(g.orderId);
        remember(done);
        added.push(g);
      }
      box = box.slice(1);
      keepInbox(uid, box);
    }
    // Only with an empty inbox: an order still waiting here is already in the server balance and would count twice.
    if (balanceHandler && backend.wallet && owner() === uid) {
      try {
        const gems = await backend.wallet();
        if (Number.isInteger(gems) && gems >= 0 && owner() === uid) balanceHandler(gems);
      } catch { /* offline: the next claim tries again */ }
    }
    await refreshEntitlements();
    return added;
  }

  const store: DiscordStore = {
    canBuy: () => canPurchase(sdk),
    available: () => canPurchase(sdk),
    async products(locale) {
      return (await store.offers(locale)).map(o => {
        const p = DISCORD_PRODUCTS.find(x => x.id === o.id)!;
        const product: Product = { id: o.id, price: o.price, owned: o.owned, kind: p.kind === 'durable' ? 'once' : 'consumable' };
        return product;
      });
    },
    async offers(locale) {
      let skus: { id: string; price: { amount: number; currency: string } }[] = [];
      try { skus = (await sdk.commands.getSkus()).skus || []; } catch { /* fall back to list prices */ }
      await refreshEntitlements();
      return DISCORD_PRODUCTS.filter(p => cfg.skus[p.id]).map(p => {
        const sku = skus.find(s => s.id === cfg.skus[p.id]);
        return {
          id: p.id,
          price: sku ? formatMinor(sku.price.amount, sku.price.currency, locale) : formatMinor(p.usdCents, 'USD', locale),
          owned: store.owns(p.id),
        };
      });
    },
    owns(id) {
      const p = DISCORD_PRODUCTS.find(x => x.id === id);
      if (!p) return false;
      const sku = cfg.skus[p.id];
      return p.kind === 'durable' && !!sku && entitlements.some(e => e.sku_id === sku && !e.deleted);
    },
    async restore() { await refreshEntitlements(); },
    async buy(id) {
      if (!canPurchase(sdk)) return 'mobile';
      const product = DISCORD_PRODUCTS.find(x => x.id === id);
      if (!product) return 'unavailable';
      const sku = cfg.skus[product.id];
      if (!sku || !owner()) return 'unavailable'; // not signed in: a purchase could not be delivered now
      if (buying) return 'busy';
      buying = true;
      try {
        await refreshEntitlements();             // the shop's list may be from before sign-in
        if (store.owns(id)) return 'owned';
        let result: SdkEntitlement[] | null;
        try { result = await sdk.commands.startPurchase({ sku_id: sku }); } catch { return 'not-completed'; }
        if (!result || !result.length) return 'not-completed';
        const ids = result.map(e => e.id);
        const allIn = () => ids.every(x => delivered().includes(x));
        // A claim already running (for example from Discord's purchase event) may have started before the server
        // could see this purchase, so claim once more if this order is not in yet.
        try { await store.claim(); if (!allIn()) await store.claim(); } catch { return 'pending'; }
        return allIn() ? 'ok' : 'pending';
      } finally { buying = false; }
    },
    claim() {
      // One claim at a time; callers during a claim share its result.
      if (!claiming) claiming = claimNow().finally(() => { claiming = null; });
      return claiming;
    },
    onGrant(h) { handler = h; },
    onBalance(h) { balanceHandler = h; },
    async start() {
      await refreshEntitlements();
      await listen();
    },
  };
  return store;
}
