// Sign-in inside Discord. There is no sign-in page: the player is already signed in to Discord.
// 1. authorize (scope "identify" only) gives a one-time code.
// 2. The bridge sends the code to our server (Supabase function discord-auth), which swaps it for a Discord token
//    using the client secret, looks up who it is, and returns a session for that player's game account.
// 3. authenticate with the Discord token, which the SDK needs for later commands such as purchases.
// The game account is a normal Supabase user, so saves use the same table and code as the web game.
import { AuthError, type AuthService, type AuthUser } from '../auth/types';
import type { DiscordSdkLike } from './sdk';

export interface DiscordSession {
  /** Game account id (Supabase user id, or a mock id). */
  userId: string;
  discordAccessToken: string;
  discordUser: { id: string; name: string };
}

/** Server side of sign-in. Real: Supabase functions (./supabase.ts). Local: ./mock.ts. */
export interface DiscordBridge {
  readonly mode: 'supabase' | 'mock';
  signIn(code: string): Promise<DiscordSession>;
  /** Deletes the game account and its cloud save on the server (the delete-account function). */
  deleteAccount(): Promise<void>;
  /** Forgets the session on this device. */
  signOutLocal(): Promise<void>;
}

export interface DiscordAuthService extends AuthService {
  readonly provider: 'discord';
  /** Discord display name of the signed-in player, for the account page. */
  displayName(): string | null;
}

function asAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new AuthError(/fetch|network|failed to send|timed? ?out/i.test(msg) ? 'network' : 'unknown', msg);
}

export function createDiscordAuth(sdk: DiscordSdkLike, bridge: DiscordBridge): DiscordAuthService {
  let current: AuthUser | null = null;
  let name: string | null = null;
  let inflight: Promise<AuthUser | null> | null = null;
  const listeners: ((u: AuthUser | null) => void)[] = [];
  const emit = () => listeners.forEach(cb => cb(current));

  async function signIn(): Promise<AuthUser> {
    const { code } = await sdk.commands.authorize({ client_id: sdk.clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] });
    if (typeof code !== 'string' || !code) throw new AuthError('unknown', 'no code from Discord');
    const s = await bridge.signIn(code);
    const auth = await sdk.commands.authenticate({ access_token: s.discordAccessToken });
    if (!auth || !auth.user || auth.user.id !== s.discordUser.id) throw new AuthError('unknown', 'Discord user mismatch');
    name = s.discordUser.name;
    // Never a guest: the Discord account is the login. No email or Apple/Google methods here.
    current = { id: s.userId, anonymous: false, email: null, methods: [] };
    emit();
    return current;
  }

  // One sign-in at a time; a second caller waits for the first.
  function signInOnce(): Promise<AuthUser | null> {
    if (!inflight) inflight = signIn().catch(e => { throw asAuthError(e); }).finally(() => { inflight = null; });
    return inflight;
  }

  return {
    mode: bridge.mode,
    provider: 'discord',
    user: () => current,
    displayName: () => name,
    init: signInOnce,
    onChange(cb) { listeners.push(cb); },
    // Email, Apple and Google sign-in do not exist in the Discord build (the account page hides them).
    async emailLink() { throw new AuthError('not-configured'); },
    async oauth() { throw new AuthError('not-configured'); },
    // There is nothing to sign out to: the player is whoever is signed in to Discord. Signing out
    // forgets the session and signs the same Discord account straight back in.
    async signOut() {
      await bridge.signOutLocal();
      current = null;
      emit();
      await signInOnce();
    },
    // Server first. Then a new, empty game account is made for this Discord account on the next sign-in.
    async deleteAccount() {
      try { await bridge.deleteAccount(); } catch (e) { throw asAuthError(e); }
      await bridge.signOutLocal();
      current = null;
      emit();
      await signInOnce();
    },
  };
}
