// @vitest-environment jsdom
// The Discord build in a fake browser with the local mock: age gate, Discord sign-in, cloud save, notices.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../../src/ui/app';
import { createDiscordBackend } from '../../src/discord/backend';
import { startScreen } from '../../src/discord/notice';
import { fakePlatform, ROOTS } from '../helpers';
import { cfg } from './helpers';

const { platform, box } = fakePlatform(null);
const backend = createDiscordBackend(null, cfg, platform.kv, 'http://localhost');
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;

beforeAll(async () => {
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  await backend.store.start();
  startApp(platform, false, backend);
});

describe('Discord build with the local mock', () => {
  it('asks for age before anything else and does not sign in first', () => {
    expect($('#age-gate')).not.toBeNull();
    expect(backend.auth.user()).toBeNull();
  });

  it('signs in with Discord after the age check and uploads the save', async () => {
    (document.querySelector('#age-m') as HTMLSelectElement).value = '1';
    (document.querySelector('#age-y') as HTMLSelectElement).value = '1990';
    $('#age-go')!.click();
    await vi.waitFor(() => expect(backend.auth.user()).not.toBeNull());
    const uid = backend.auth.user()!.id;
    expect(uid).toMatch(/^mock-discord-/);
    expect(box.saved?.parcels.length).toBeGreaterThanOrEqual(10);
    await vi.waitFor(async () => expect(await backend.saves.pull(uid)).not.toBeNull(), { timeout: 6000 });
  });

  it('blocks under-13 players without signing in', async () => {
    const p = fakePlatform('under');
    const b = createDiscordBackend(null, cfg, p.platform.kv, 'http://localhost');
    document.body.innerHTML = ROOTS;
    const stop = startApp(p.platform, false, b);
    await Promise.resolve();
    expect($('#age-blocked')).not.toBeNull();
    expect(b.auth.user()).toBeNull();
    stop();
  });

  it('shows notices as text, in the player\'s language', () => {
    document.body.innerHTML = ROOTS;
    startScreen('outside', ['zh-CN']);
    expect($('#discord-notice')!.textContent).toContain('Discord');
    expect($('#discord-notice')!.innerHTML).not.toContain('<script');
    startScreen('error', ['es-MX']);
    expect($('h2')!.textContent).toBe('Parcelwood no pudo iniciarse');
  });
});
