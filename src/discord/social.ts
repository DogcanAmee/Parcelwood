// Discord social for the game (src/platform/social.ts): carried parcels and the server board.
// Real: Supabase functions from supabase/migrations/0005_social.sql. Mock: the same rules in this browser's storage.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Kv } from '../platform/types';
import type { GuildInfo, ShareResult, SocialService } from '../platform/social';
import type { DiscordSdkLike } from './sdk';

const isGuild = (g: string | null | undefined): g is string => !!g && /^\d{5,25}$/.test(g);
const cut = (s: string) => s.slice(0, 1000);

async function share(sdk: DiscordSdkLike, message: string, code?: string): Promise<ShareResult> {
  const r = await sdk.commands.shareLink(code ? { message: cut(message), custom_id: code } : { message: cut(message) });
  if (r && r.didSendMessage) return 'sent';
  if (r && r.didCopyLink) return 'copied';
  return 'cancelled';
}

export interface GuildRemote { add(guild: string, week: string, n: number): Promise<void>; get(guild: string, week: string): Promise<GuildInfo> }
export interface CarryRemote { send(): Promise<string>; claim(token: string): Promise<'ok' | 'own' | 'gone'>; thanks(): Promise<number> }

export function createDiscordSocial(sdk: DiscordSdkLike, carry: CarryRemote, guild: GuildRemote): SocialService {
  const guildId = isGuild(sdk.guildId) ? sdk.guildId : null;
  return {
    guildId,
    launchCode: typeof sdk.customId === 'string' && sdk.customId.length < 200 ? sdk.customId : null,
    share: (m, c) => share(sdk, m, c),
    carrySend: () => carry.send(),
    carryClaim: t => carry.claim(t),
    carryThanks: () => carry.thanks(),
    async guildAdd(week, n) { if (guildId) await guild.add(guildId, week, n); },
    async guildGet(week) { return guildId ? guild.get(guildId, week) : { total: 0, players: 0, mine: 0 }; },
  };
}

const nat = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : 0);

export function createSupabaseSocial(sb: SupabaseClient): { carry: CarryRemote; guild: GuildRemote } {
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as unknown;
  };
  return {
    carry: {
      async send() { const t = await rpc('carry_send'); if (typeof t !== 'string' || !/^[0-9a-f]{32}$/.test(t)) throw new Error('bad token'); return t; },
      async claim(token) { const r = await rpc('carry_claim', { p_token: token }); return r === 'ok' || r === 'own' ? r : 'gone'; },
      async thanks() { return nat(await rpc('carry_thanks'), 1000); },
    },
    guild: {
      async add(g, week, n) { await rpc('guild_board_add', { p_guild: g, p_week: week, p_n: n }); },
      async get(g, week) {
        const d = await rpc('guild_board_get', { p_guild: g, p_week: week });
        const r = (Array.isArray(d) ? d[0] : d) as Record<string, unknown> | null;
        return { total: nat(r?.total, 1e7), players: nat(r?.players, 1e6), mine: nat(r?.mine, 21) };
      },
    },
  };
}

const CARRY = 'parcelwood.mock.social.carry';
const GUILD = 'parcelwood.mock.social.guild';
type MockCarry = { token: string; sender: string; claimedBy: string | null; thanked: boolean };
const read = <T>(kv: Kv, k: string, d: T): T => { try { const v = JSON.parse(kv.get(k) || 'null'); return v == null ? d : v; } catch { return d; } };
const write = (kv: Kv, k: string, v: unknown) => kv.set(k, JSON.stringify(v));

/** Same rules as 0005_social.sql, minus the daily limits. `who` is the signed-in game user id. */
export function createMockSocial(kv: Kv, who: () => string | null): { carry: CarryRemote; guild: GuildRemote } {
  const me = () => { const u = who(); if (!u) throw new Error('not signed in'); return u; };
  return {
    carry: {
      async send() {
        const token = Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
        write(kv, CARRY, [...read<MockCarry[]>(kv, CARRY, []), { token, sender: me(), claimedBy: null, thanked: false }]);
        return token;
      },
      async claim(token) {
        const u = me(), list = read<MockCarry[]>(kv, CARRY, []), row = list.find(c => c.token === token);
        if (!row || row.claimedBy) return 'gone';
        if (row.sender === u) return 'own';
        row.claimedBy = u; write(kv, CARRY, list);
        return 'ok';
      },
      async thanks() {
        const u = me(), list = read<MockCarry[]>(kv, CARRY, []);
        const mine = list.filter(c => c.sender === u && c.claimedBy && !c.thanked);
        mine.forEach(c => { c.thanked = true; });
        write(kv, CARRY, list);
        return mine.length;
      },
    },
    guild: {
      async add(g, week, n) {
        const u = me(), all = read<Record<string, Record<string, number>>>(kv, GUILD, {}), k = g + '|' + week;
        const row = all[k] || {}; row[u] = Math.min(21, (row[u] || 0) + Math.max(1, Math.min(3, n)));
        all[k] = row; write(kv, GUILD, all);
      },
      async get(g, week) {
        const u = me(), row = read<Record<string, Record<string, number>>>(kv, GUILD, {})[g + '|' + week] || {};
        const vals = Object.values(row);
        return { total: vals.reduce((a, b) => a + b, 0), players: vals.length, mine: row[u] || 0 };
      },
    },
  };
}
