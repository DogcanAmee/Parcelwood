// Local stand-in for Discord and for our server, used when the build has no Discord client id (npm run dev,
// tests, a preview outside Discord). Purchases are free and instant; everything lives in this browser.
// The grant rules copy the real ones (supabase/migrations/0002_discord.sql): one order per purchase,
// first purchase of each gem pack doubled, gem packs used up, the uniform kept. Refunds and the balance copy
// 0003_wallet_and_refunds.sql: a deleted entitlement refunds its order, the balance is the sum of the player's
// orders that are not refunded (shown as at least 0).
import type { Kv } from '../platform/types';
import { DISCORD_PRODUCTS, productForSku, type DiscordConfig } from './config';
import type { DiscordBridge } from './auth';
import type { ClaimBackend, Grant } from './store';
import type { DiscordSdkLike, SdkEntitlement } from './sdk';

const ENTS = 'parcelwood.mock.discord.entitlements';
const ACCOUNTS = 'parcelwood.mock.discord.accounts'; // discord id -> game user id
const ORDERS = 'parcelwood.mock.discord.orders';
const CLOUD = 'parcelwood.mock.cloud.';               // same prefix as src/auth/mock.ts, so deleting an account clears its save

interface MockOrder extends Grant { userId: string | null; discordId: string; claimed: boolean; firstBonus: boolean; refunded?: boolean }

const read = <T>(kv: Kv, k: string, d: T): T => { try { const v = JSON.parse(kv.get(k) || 'null'); return v == null ? d : v; } catch { return d; } };
const write = (kv: Kv, k: string, v: unknown) => kv.set(k, JSON.stringify(v));
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('').replace(/^0/, '1');

export interface MockOptions {
  platform?: 'desktop' | 'mobile';
  discordUser?: { id: string; name: string };
  /** Test hook: the payment window is closed without paying. */
  decline?: () => boolean;
  /** The Discord server the mock Activity runs in (default: a fixed test server; null = a DM). */
  guildId?: string | null;
  /** custom_id of the shared link that "launched" the mock Activity. */
  customId?: string | null;
  /** Test hook: what the share window does (default: the message is sent). Receives each share. */
  share?: (args: { message: string; custom_id?: string }) => 'sent' | 'copied' | 'cancelled';
}

/** One fake Discord client plus one fake server, sharing this browser's storage. */
export function createMockDiscord(cfg: DiscordConfig, kv: Kv, opts: MockOptions = {}) {
  const user = opts.discordUser || { id: '100000000000000001', name: 'Local Player' };
  const listeners: ((d: unknown) => unknown)[] = [];
  let session: { userId: string; discordId: string } | null = null;

  const ents = (): (SdkEntitlement & { user: string })[] => read(kv, ENTS, []);
  const orders = (): MockOrder[] => read(kv, ORDERS, []);

  const sdk: DiscordSdkLike = {
    clientId: cfg.clientId || '0',
    instanceId: 'mock-instance',
    platform: opts.platform || 'desktop',
    guildId: opts.guildId === undefined ? '100000000000000099' : opts.guildId,
    customId: opts.customId ?? null,
    async ready() {},
    async subscribe(_e, l) { listeners.push(l); return null; },
    commands: {
      async authorize() { return { code: 'mock-code-' + user.id }; },
      async authenticate({ access_token }) {
        if (access_token !== 'mock-discord-token-' + user.id) throw new Error('bad token');
        return { access_token, user: { id: user.id, username: user.name, global_name: user.name } };
      },
      async getSkus() {
        return { skus: DISCORD_PRODUCTS.filter(p => cfg.skus[p.id]).map(p => ({ id: cfg.skus[p.id]!, name: p.id, type: p.kind === 'durable' ? 2 : 3, price: { amount: p.usdCents, currency: 'USD' } })) };
      },
      async getEntitlements() { return { entitlements: ents().filter(e => e.user === user.id && !e.consumed && !e.deleted) }; },
      async startPurchase({ sku_id }) {
        if (sdk.platform === 'mobile') throw new Error('not supported on mobile');
        if (!productForSku(cfg, sku_id) || (opts.decline && opts.decline())) return null;
        const e = { id: digits(18), sku_id, type: 4, consumed: false, deleted: false, user: user.id };
        write(kv, ENTS, [...ents(), e]);
        listeners.forEach(l => l({}));
        return [e];
      },
      async shareLink(args) {
        const r = opts.share ? opts.share(args) : 'sent';
        return { success: r !== 'cancelled', didCopyLink: r === 'copied', didSendMessage: r === 'sent' };
      },
    },
  };

  const bridge: DiscordBridge = {
    mode: 'mock',
    async signIn(code) {
      if (code !== 'mock-code-' + user.id) throw new Error('bad code');
      const accounts = read<Record<string, string>>(kv, ACCOUNTS, {});
      if (!accounts[user.id]) { accounts[user.id] = 'mock-discord-' + digits(8); write(kv, ACCOUNTS, accounts); }
      session = { userId: accounts[user.id], discordId: user.id };
      return { userId: session.userId, discordAccessToken: 'mock-discord-token-' + user.id, discordUser: user };
    },
    async deleteAccount() {
      if (!session) throw new Error('not signed in');
      const accounts = read<Record<string, string>>(kv, ACCOUNTS, {});
      delete accounts[session.discordId];
      write(kv, ACCOUNTS, accounts);
      kv.remove(CLOUD + session.userId);
      const uid = session.userId;
      write(kv, ORDERS, orders().map(o => (o.userId === uid ? { ...o, userId: null } : o))); // orders stay for records
    },
    async signOutLocal() { session = null; },
  };

  const claims: ClaimBackend = {
    async sync() {
      if (!session) throw new Error('not signed in');
      const s = session;
      const all = ents();
      let list = orders();
      for (const e of all) {
        if (e.user !== s.discordId) continue;
        if (e.deleted) { list = list.map(o => (o.orderId === e.id ? { ...o, refunded: true } : o)); write(kv, ORDERS, list); continue; }
        const p = productForSku(cfg, e.sku_id);
        if (!p || list.some(o => o.orderId === e.id)) continue;
        if (p.kind === 'consumable' && e.consumed) continue;
        const first = p.kind === 'consumable' && !list.some(o => o.userId === s.userId && o.product === p.id);
        list = [...list, { orderId: e.id, product: p.id, gems: first ? p.gems * 2 : p.gems, userId: s.userId, discordId: s.discordId, claimed: false, firstBonus: first }];
        write(kv, ORDERS, list);                       // record first, then use up, like the real server
        if (p.kind === 'consumable') e.consumed = true;
      }
      write(kv, ENTS, all);
    },
    async claim() {
      if (!session) throw new Error('not signed in');
      const uid = session.userId;
      const list = orders();
      const mine = list.filter(o => o.userId === uid && !o.claimed && !o.refunded);
      write(kv, ORDERS, list.map(o => (mine.includes(o) ? { ...o, claimed: true } : o)));
      return mine.map(o => ({ orderId: o.orderId, product: o.product, gems: o.gems }));
    },
    async wallet() {
      if (!session) throw new Error('not signed in');
      const uid = session.userId;
      return Math.max(0, orders().filter(o => o.userId === uid && !o.refunded).reduce((n, o) => n + o.gems, 0));
    },
  };

  /** Test hook: Discord refunds a purchase (its entitlement becomes deleted). */
  const refund = (entitlementId: string) => write(kv, ENTS, ents().map(e => (e.id === entitlementId ? { ...e, deleted: true } : e)));

  return { sdk, bridge, claims, refund, who: () => session?.userId ?? null };
}
