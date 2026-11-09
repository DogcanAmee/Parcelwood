// One account for web and phone. The game only talks to this interface;
// Supabase is behind it in production, a local mock when no project is set up.
import type { GameState } from '../core/types';

export type Method = 'email' | 'apple' | 'google';

export interface AuthUser {
  id: string;
  /** A guest account made automatically. Becomes a full account when the player adds email, Apple or Google. */
  anonymous: boolean;
  email: string | null;
  methods: Method[];
}

export type EmailResult = 'sent' | 'signed-in';

export interface AuthService {
  readonly mode: 'supabase' | 'mock';
  user(): AuthUser | null;
  /** Restores the session, or makes a guest account. Call only after the age gate passes. */
  init(): Promise<AuthUser | null>;
  onChange(cb: (user: AuthUser | null) => void): void;
  /** Email sign-in link. Upgrades the guest account in place when the address is new. */
  emailLink(email: string): Promise<EmailResult>;
  /** Apple or Google. On the web this leaves the page and comes back signed in. */
  oauth(provider: 'apple' | 'google'): Promise<void>;
  signOut(): Promise<void>;
  /** Deletes the account and its cloud save on the server. Required by Apple for any app with sign-up. */
  deleteAccount(): Promise<void>;
}

export type PushResult = { ok: true; version: number } | { ok: false };

/** A guest's wallet, packed into a one-time ticket so it can follow the player into a full account. */
export interface GuestTicket { token: string; gems: number }

/** The account's cloud save. push only succeeds if the cloud is still at `expected` (0 = no save yet). */
export interface SaveStore {
  pull(userId: string): Promise<{ state: GameState; version: number } | null>;
  push(userId: string, state: GameState, expected: number): Promise<PushResult>;
  /** Mints (or reuses) this guest's ticket. Server only: nothing to move in the local mock before it has gems. */
  guestTicket?(userId: string): Promise<GuestTicket | null>;
  /** Moves a ticket's gems into `userId` on the server. 'gone' = the ticket is used, expired or unknown. */
  claimGuestTicket?(userId: string, token: string): Promise<{ balance: number } | 'gone'>;
  /** The server's gem balance for the signed-in account (wallet_gems in 0003). Never below 0. */
  walletGems?(userId: string): Promise<number>;
}

export class AuthError extends Error {
  constructor(public code: 'invalid-email' | 'network' | 'not-configured' | 'rate-limit' | 'unknown', message?: string) {
    super(message || code);
  }
}

export function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}
