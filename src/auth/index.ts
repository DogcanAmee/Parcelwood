// Picks the real backend when both env vars are set, otherwise the local mock.
import type { Kv } from '../platform/types';
import { createMockAuth, createMockSaveStore } from './mock';
import { createSupabaseAuth, createSupabaseClient, createSupabaseSaveStore } from './supabase';
import type { AuthService, SaveStore } from './types';
import type { SocialService } from '../platform/social';

/** social: friends and servers (Discord build only). */
export interface Backend { auth: AuthService; saves: SaveStore; social?: SocialService }

export function createBackend(env: { url?: string; key?: string }, kv: Kv, redirectTo: string): Backend {
  if (env.url && env.key) {
    const sb = createSupabaseClient(env.url, env.key);
    return { auth: createSupabaseAuth(sb, redirectTo), saves: createSupabaseSaveStore(sb) };
  }
  return { auth: createMockAuth(kv), saves: createMockSaveStore(kv) };
}
