// Real backend for the Discord build: the same Supabase project as the web game, reached through Discord's proxy.
// The Developer Portal maps "/sb" to the Supabase project, so the client talks to https://<app id>.discordsays.com/sb.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AuthError } from '../auth/types';
import { DISCORD_PRODUCTS, type DiscordProductId } from './config';
import type { DiscordBridge, DiscordSession } from './auth';
import type { ClaimBackend, Grant } from './store';

export function createDiscordSupabaseClient(url: string, key: string): SupabaseClient {
  // The session lives in memory only: every launch signs in again from Discord, so a session left on this
  // device can never belong to another Discord account that used the same browser.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
}

type FnError = { message?: string; context?: { status?: number } } | null;
function fail(error: FnError): never {
  const status = error?.context?.status;
  if (status === 429) throw new AuthError('rate-limit', error?.message);
  if (status == null || /fetch|network/i.test(error?.message || '')) throw new AuthError('network', error?.message);
  throw new AuthError('unknown', error?.message);
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 4096;

/** Checks the discord-auth reply before anything in it is used. */
export function parseSignIn(data: unknown): { session: { access_token: string; refresh_token: string }; discord: DiscordSession['discordUser']; discordAccessToken: string } {
  const d = data as Record<string, any> | null;
  if (!d || !d.session || !isStr(d.session.access_token) || !isStr(d.session.refresh_token) ||
      !isStr(d.discord_access_token) || !d.discord_user || !/^\d{5,25}$/.test(String(d.discord_user.id)) || typeof d.discord_user.name !== 'string') {
    throw new AuthError('unknown', 'bad sign-in reply');
  }
  return {
    session: { access_token: d.session.access_token, refresh_token: d.session.refresh_token },
    discord: { id: String(d.discord_user.id), name: String(d.discord_user.name).slice(0, 64) },
    discordAccessToken: d.discord_access_token,
  };
}

export function createSupabaseDiscordBridge(sb: SupabaseClient): DiscordBridge {
  return {
    mode: 'supabase',
    async signIn(code) {
      const { data, error } = await sb.functions.invoke('discord-auth', { method: 'POST', body: { code } });
      if (error) fail(error as FnError);
      const r = parseSignIn(data);
      const { data: set, error: e2 } = await sb.auth.setSession(r.session);
      if (e2 || !set.user) fail(e2 as FnError);
      return { userId: set.user.id, discordAccessToken: r.discordAccessToken, discordUser: r.discord };
    },
    async deleteAccount() {
      const { error } = await sb.functions.invoke('delete-account', { method: 'POST' });
      if (error) fail(error as FnError);
    },
    async signOutLocal() { await sb.auth.signOut({ scope: 'local' }); },
  };
}

const PRODUCT_IDS = DISCORD_PRODUCTS.map(p => p.id) as string[];

export function createSupabaseClaimBackend(sb: SupabaseClient): ClaimBackend {
  return {
    async sync() {
      const { error } = await sb.functions.invoke('discord-claim', { method: 'POST' });
      if (error) fail(error as FnError);
    },
    async claim() {
      // One statement on the server: returns this player's unclaimed orders and marks them claimed.
      const { data, error } = await sb.rpc('claim_discord_orders');
      if (error) fail(error as FnError);
      return (Array.isArray(data) ? data : [])
        .filter(r => isStr(r?.id) && PRODUCT_IDS.includes(r.product) && Number.isInteger(r.gems) && r.gems >= 0 && r.gems <= 10000)
        .map(r => ({ orderId: r.id, product: r.product as DiscordProductId, gems: r.gems }) as Grant);
    },
    async wallet() {
      const { data, error } = await sb.rpc('wallet_gems');
      if (error) fail(error as FnError);
      if (!Number.isInteger(data) || data < 0 || data > 10_000_000) throw new AuthError('unknown', 'bad balance');
      return data as number;
    },
  };
}

