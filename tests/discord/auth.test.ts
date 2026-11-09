import { describe, expect, it } from 'vitest';
import { createDiscordAuth, type DiscordBridge } from '../../src/discord/auth';
import { createMockDiscord } from '../../src/discord/mock';
import { memKv } from '../helpers';
import { cfg } from './helpers';

describe('Discord sign-in', () => {
  it('signs in as the Discord user, never as a guest', async () => {
    const m = createMockDiscord(cfg, memKv(), { discordUser: { id: '123456789012', name: 'Tester' } });
    const auth = createDiscordAuth(m.sdk, m.bridge);
    const u = await auth.init();
    expect(u).toMatchObject({ anonymous: false, email: null, methods: [] });
    expect(auth.displayName()).toBe('Tester');
    expect(auth.provider).toBe('discord');
    expect(auth.mode).toBe('mock');
  });

  it('keeps the same game account on the next launch', async () => {
    const kv = memKv();
    const a = await createDiscordAuth(createMockDiscord(cfg, kv).sdk, createMockDiscord(cfg, kv).bridge).init();
    const m2 = createMockDiscord(cfg, kv);
    const b = await createDiscordAuth(m2.sdk, m2.bridge).init();
    expect(b!.id).toBe(a!.id);
  });

  it('runs one sign-in when asked twice at once', async () => {
    const m = createMockDiscord(cfg, memKv());
    let calls = 0;
    const bridge: DiscordBridge = { ...m.bridge, signIn: c => { calls++; return m.bridge.signIn(c); } };
    const auth = createDiscordAuth(m.sdk, bridge);
    const [x, y] = await Promise.all([auth.init(), auth.init()]);
    expect(calls).toBe(1);
    expect(x).toBe(y);
  });

  it('refuses a server answer for a different Discord user', async () => {
    const m = createMockDiscord(cfg, memKv());
    const bridge: DiscordBridge = { ...m.bridge, signIn: async c => ({ ...(await m.bridge.signIn(c)), discordUser: { id: '555555555', name: 'Someone else' } }) };
    await expect(createDiscordAuth(m.sdk, bridge).init()).rejects.toMatchObject({ code: 'unknown' });
  });

  it('has no email, Apple or Google sign-in', async () => {
    const m = createMockDiscord(cfg, memKv());
    const auth = createDiscordAuth(m.sdk, m.bridge);
    await expect(auth.emailLink('a@b.co')).rejects.toMatchObject({ code: 'not-configured' });
    await expect(auth.oauth('apple')).rejects.toMatchObject({ code: 'not-configured' });
  });

  it('deleting the account gives a new, empty account and removes the cloud save', async () => {
    const kv = memKv();
    const m = createMockDiscord(cfg, kv);
    const auth = createDiscordAuth(m.sdk, m.bridge);
    const before = await auth.init();
    kv.set('parcelwood.mock.cloud.' + before!.id, '{"version":1}');
    const seen: (string | undefined)[] = [];
    auth.onChange(u => seen.push(u?.id));
    await auth.deleteAccount();
    expect(auth.user()!.id).not.toBe(before!.id);
    expect(kv.get('parcelwood.mock.cloud.' + before!.id)).toBeNull();
    expect(seen[seen.length - 1]).toBe(auth.user()!.id);
  });

  it('reports a failed server call as an error the account page understands', async () => {
    const m = createMockDiscord(cfg, memKv());
    const bridge: DiscordBridge = { ...m.bridge, signIn: async () => { throw new TypeError('Failed to fetch'); } };
    await expect(createDiscordAuth(m.sdk, bridge).init()).rejects.toMatchObject({ code: 'network' });
  });
});
