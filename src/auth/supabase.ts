// Supabase Auth and the account save table. Needs a Supabase project with:
// anonymous sign-ins on, manual identity linking on, email (magic link), Apple and Google providers set up,
// the tables from supabase/migrations and the delete-account function deployed.
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { GameState } from '../core/types';
import { AuthError, validEmail, type AuthService, type AuthUser, type Method, type SaveStore } from './types';

const PENDING_PROVIDER = 'parcelwood.pendingProvider';

function toUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const methods = (u.identities || []).map(i => i.provider).filter((p): p is Method => p === 'email' || p === 'apple' || p === 'google');
  return { id: u.id, anonymous: !!u.is_anonymous, email: u.email || null, methods: [...new Set(methods)] };
}

function wrap(err: { message?: string; status?: number; code?: string } | null): never {
  if (err && err.status === 429) throw new AuthError('rate-limit', err.message);
  if (err && /fetch|network/i.test(err.message || '')) throw new AuthError('network', err.message);
  throw new AuthError('unknown', err?.message);
}

export function createSupabaseClient(url: string, key: string): SupabaseClient {
  // PKCE: a sign-in link only works in the browser that asked for it, so a forwarded link cannot sign someone into another account.
  return createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}

export function createSupabaseAuth(sb: SupabaseClient, redirectTo: string): AuthService {
  let current: AuthUser | null = null;
  const listeners: ((u: AuthUser | null) => void)[] = [];
  sb.auth.onAuthStateChange((_event, session) => {
    const next = toUser(session?.user);
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    current = next;
    if (changed) listeners.forEach(cb => cb(current));
  });

  // Linking Apple/Google to a guest fails when that Apple/Google login already has an account.
  // Supabase reports it in the return URL; then sign in to the existing account instead.
  async function retryAfterLinkFailure(): Promise<boolean> {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    const provider = sessionStorage.getItem(PENDING_PROVIDER) as 'apple' | 'google' | null;
    sessionStorage.removeItem(PENDING_PROVIDER);
    if (provider && params.get('error_code') === 'identity_already_exists') {
      history.replaceState(null, '', window.location.pathname);
      await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
      return true;
    }
    return false;
  }

  return {
    mode: 'supabase',
    user: () => current,
    async init() {
      if (await retryAfterLinkFailure()) return null; // the page is leaving for the provider
      const { data } = await sb.auth.getSession();
      current = toUser(data.session?.user);
      if (!current) {
        const { data: anon, error } = await sb.auth.signInAnonymously();
        if (error) wrap(error);
        current = toUser(anon.user);
      }
      return current;
    },
    onChange(cb) { listeners.push(cb); },
    async emailLink(email) {
      if (!validEmail(email)) throw new AuthError('invalid-email');
      const addr = email.trim().toLowerCase();
      if (current?.anonymous) {
        // New address: the guest account keeps its id and save, and becomes a full account after the link is clicked.
        const { error } = await sb.auth.updateUser({ email: addr }, { emailRedirectTo: redirectTo });
        if (!error) return 'sent';
        if (error.code !== 'email_exists') wrap(error);
      }
      // Address already has an account (or no guest): send a normal sign-in link.
      const { error } = await sb.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
      if (error) wrap(error);
      return 'sent';
    },
    async oauth(provider) {
      sessionStorage.setItem(PENDING_PROVIDER, provider);
      const { error } = current?.anonymous
        ? await sb.auth.linkIdentity({ provider, options: { redirectTo } })
        : await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) wrap(error);
    },
    async signOut() {
      // 'local' signs out this device only. The default would sign the account out everywhere.
      const { error } = await sb.auth.signOut({ scope: 'local' });
      if (error) wrap(error);
      const { data, error: e2 } = await sb.auth.signInAnonymously();
      if (e2) wrap(e2);
      current = toUser(data.user);
    },
    async deleteAccount() {
      const { error } = await sb.functions.invoke('delete-account', { method: 'POST' });
      if (error) wrap(error);
      await sb.auth.signOut({ scope: 'local' });
      const { data, error: e2 } = await sb.auth.signInAnonymously();
      if (e2) wrap(e2);
      current = toUser(data.user);
      listeners.forEach(cb => cb(current));
    },
  };
}

export function createSupabaseSaveStore(sb: SupabaseClient): SaveStore {
  return {
    async pull(userId) {
      const { data, error } = await sb.from('saves').select('state, version').eq('user_id', userId).maybeSingle();
      if (error) wrap(error);
      return data ? { state: data.state as GameState, version: Number(data.version) } : null;
    },
    // push_save (supabase/migrations) writes only when the row is still at `expected`, and returns the new
    // version, or null when another device got there first.
    async push(_userId, state, expected) {
      const { data, error } = await sb.rpc('push_save', { p_state: state, p_expected: expected });
      if (error) wrap(error);
      return data == null ? { ok: false } : { ok: true, version: Number(data) };
    },
    // 0004: the guest's balance moves on the server, not by adding gem counts on the device.
    async guestTicket() {
      const { data, error } = await sb.rpc('issue_guest_ticket');
      if (error) wrap(error);
      const row = Array.isArray(data) ? data[0] : data;
      return row && typeof row.token === 'string' ? { token: row.token, gems: Number(row.gems) } : null;
    },
    async claimGuestTicket(_userId, token) {
      const { data, error } = await sb.rpc('claim_guest_ticket', { p_token: token });
      if (error) {
        if (/bad ticket|ticket expired|same account|not a guest account/i.test(error.message || '')) return 'gone';
        wrap(error);
      }
      return data == null ? 'gone' : { balance: Number(data) };
    },
    async walletGems() {
      const { data, error } = await sb.rpc('wallet_gems');
      if (error) wrap(error);
      return Number(data) || 0;
    },
  };
}
