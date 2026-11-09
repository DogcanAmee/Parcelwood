import { describe, expect, it } from 'vitest';
import { createSupabaseClaimBackend, parseSignIn } from '../../src/discord/supabase';

const good = {
  session: { access_token: 'a.b.c', refresh_token: 'r1' },
  discord_access_token: 'dtok',
  discord_user: { id: '123456789012', name: 'Tao' },
};

describe('Discord backend replies', () => {
  it('accepts a well-formed sign-in reply', () => {
    expect(parseSignIn(good)).toEqual({ session: good.session, discord: { id: '123456789012', name: 'Tao' }, discordAccessToken: 'dtok' });
  });

  it('rejects anything missing or malformed', () => {
    for (const bad of [null, {}, { ...good, session: {} }, { ...good, discord_access_token: '' }, { ...good, discord_user: { id: 'x', name: 'a' } }]) {
      expect(() => parseSignIn(bad)).toThrow();
    }
  });

  it('only passes on known products with sane gem counts', async () => {
    const rows = [
      { id: '1000001', product: 'gems60', gems: 120 },
      { id: '1000002', product: 'noads', gems: 0 },
      { id: '1000003', product: 'gems330', gems: 1e9 },
      { id: '1000004', product: 'outfit', gems: 0 },
    ];
    const calls: string[] = [];
    const sb: any = { rpc: async (name: string) => { calls.push(name); return { data: rows, error: null }; } };
    expect(await createSupabaseClaimBackend(sb).claim()).toEqual([
      { orderId: '1000001', product: 'gems60', gems: 120 },
      { orderId: '1000004', product: 'outfit', gems: 0 },
    ]);
    expect(calls).toEqual(['claim_discord_orders']);
  });
});
