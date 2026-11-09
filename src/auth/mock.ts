// Local stand-in for Supabase, used when no project is configured (dev, tests, the preview page).
// Everything lives in this browser. No email is sent: an email link "arrives" and is clicked at once.
import type { GameState } from '../core/types';
import type { Kv } from '../platform/types';
import { AuthError, validEmail, type AuthService, type AuthUser, type Method, type SaveStore } from './types';

const SESSION = 'parcelwood.mock.session';
const ACCOUNTS = 'parcelwood.mock.accounts'; // login key (email or provider) -> user
const CLOUD = 'parcelwood.mock.cloud.';
const WALLETS = 'parcelwood.mock.wallets';   // user id -> gems (the server wallet, kept apart from the save)
const TICKETS = 'parcelwood.mock.tickets';   // guest id -> one-time ticket for moving its gems

type Accounts = Record<string, AuthUser>;

function newId(): string {
  return 'mock-' + Math.random().toString(36).slice(2, 10);
}

export function createMockAuth(kv: Kv): AuthService {
  let current: AuthUser | null = null;
  const listeners: ((u: AuthUser | null) => void)[] = [];
  const accounts = (): Accounts => { try { return JSON.parse(kv.get(ACCOUNTS) || '{}'); } catch { return {}; } };
  const saveAccounts = (a: Accounts) => kv.set(ACCOUNTS, JSON.stringify(a));
  function set(u: AuthUser | null) {
    current = u;
    if (u) kv.set(SESSION, JSON.stringify(u)); else kv.remove(SESSION);
    listeners.forEach(cb => cb(u));
  }
  function upgradeOrSwitch(key: string, method: Method, email: string | null) {
    const all = accounts();
    const existing = all[key];
    if (existing) { set(existing); return; }               // address already has an account: switch to it
    const base = current && current.anonymous ? current : { id: newId(), anonymous: true, email: null, methods: [] as Method[] };
    const u: AuthUser = { id: base.id, anonymous: false, email: email ?? base.email, methods: [...new Set([...base.methods, method])] };
    all[key] = u; saveAccounts(all); set(u);
  }
  return {
    mode: 'mock',
    user: () => current,
    async init() {
      try { const raw = kv.get(SESSION); if (raw) current = JSON.parse(raw); } catch { current = null; }
      if (!current) set({ id: newId(), anonymous: true, email: null, methods: [] });
      return current;
    },
    onChange(cb) { listeners.push(cb); },
    async emailLink(email) {
      if (!validEmail(email)) throw new AuthError('invalid-email');
      const e = email.trim().toLowerCase();
      upgradeOrSwitch('email:' + e, 'email', e);
      return 'signed-in';
    },
    async oauth(provider) { upgradeOrSwitch(provider, provider, provider + '.player@example.invalid'); },
    async signOut() { set({ id: newId(), anonymous: true, email: null, methods: [] }); },
    async deleteAccount() {
      if (!current) return;
      const all = accounts();
      for (const k of Object.keys(all)) if (all[k].id === current.id) delete all[k];
      saveAccounts(all);
      kv.remove(CLOUD + current.id);
      set({ id: newId(), anonymous: true, email: null, methods: [] });
    },
  };
}

export function createMockSaveStore(kv: Kv): SaveStore {
  const wallets = (): Record<string, number> => { try { return JSON.parse(kv.get(WALLETS) || '{}'); } catch { return {}; } };
  const setWallets = (w: Record<string, number>) => kv.set(WALLETS, JSON.stringify(w));
  const tickets = (): Record<string, { token: string; guest: string; used: boolean }> => { try { return JSON.parse(kv.get(TICKETS) || '{}'); } catch { return {}; } };
  const setTickets = (t: Record<string, { token: string; guest: string; used: boolean }>) => kv.set(TICKETS, JSON.stringify(t));
  const balance = (id: string) => Math.max(0, wallets()[id] || 0);
  const pull = (userId: string): { state: GameState; version: number } | null => {
    const raw = kv.get(CLOUD + userId);
    if (!raw) return null;
    try {
      const row = JSON.parse(raw);
      const w = wallets();
      if (w[userId] === undefined) { w[userId] = Math.max(0, Number(row.state.gems) || 0); setWallets(w); } // first run: the save seeds the wallet, like 0003
      return { ...row, state: { ...row.state, gems: Math.max(0, w[userId]) } };
    } catch { return null; }
  };
  return {
    async pull(userId) { return pull(userId); },
    async push(userId, state, expected) {
      const cur = pull(userId);
      if ((cur ? cur.version : 0) !== expected) return { ok: false };
      const version = expected + 1;
      const w = wallets();
      if (w[userId] === undefined) { w[userId] = Math.max(0, Number(state.gems) || 0); setWallets(w); } // the wallet, not the save, is the truth after that
      kv.set(CLOUD + userId, JSON.stringify({ state: { ...state, gems: Math.max(0, w[userId]) }, version }));
      return { ok: true, version };
    },
    async walletGems(userId) { return balance(userId); },
    async guestTicket(userId) {
      const all = tickets();
      if (!all[userId]) {
        all[userId] = { token: 'mock' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10), guest: userId, used: false };
        setTickets(all);
      }
      return { token: all[userId].token, gems: balance(userId) };
    },
    async claimGuestTicket(userId, token) {
      const all = tickets();
      const t = Object.values(all).find(x => x.token === token && x.guest !== userId);
      if (!t) return 'gone';
      if (t.used) return { balance: balance(userId) };
      const w = wallets(), moved = w[t.guest] || 0;
      if (moved) { w[userId] = (w[userId] || 0) + moved; w[t.guest] = 0; setWallets(w); }
      t.used = true; setTickets(all);
      return { balance: balance(userId) };
    },
  };
}
