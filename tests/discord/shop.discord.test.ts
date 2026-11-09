// @vitest-environment jsdom
// Needs the shared UI change (discord/SHARED-CHANGES.md): Discord shop and account page in the game UI.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { startApp } from '../../src/ui/app';
import { createDiscordBackend } from '../../src/discord/backend';
import { fakePlatform, ROOTS } from '../helpers';
import { cfg } from './helpers';

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;

async function boot(platform: 'desktop' | 'mobile') {
  const { platform: p, box } = fakePlatform('ok');
  const backend = createDiscordBackend(null, cfg, p.kv, 'http://localhost', { platform });
  document.body.innerHTML = ROOTS;
  window.scrollTo = () => {};
  await backend.store.start();
  const stop = startApp(p, false, backend);
  await vi.waitFor(() => expect(backend.auth.user()).not.toBeNull());
  if ($('#intro-ok')) $('#intro-ok')!.click();
  return { box, backend, stop, kv: p.kv };
}

describe('Discord shop in the game', () => {
  let ctx: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => { ctx = await boot('desktop'); });

  it('lists the three Discord products with prices and no "remove ads"', async () => {
    (document.querySelector('[data-view="shop"]') as HTMLElement).click();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-buy]').length).toBe(3));
    expect($('[data-buy="gems60"]')!.textContent).toBe('Buy · $0.99');
    expect(document.body.innerHTML).not.toContain('data-buy="noads"');
    expect($('#open-odds')).not.toBeNull();
    await vi.waitFor(() => expect(document.querySelector('img.ico')).not.toBeNull()); // startApp draws icons in every build
    const odds = $('#store-odds')!;
    expect(odds.textContent).toContain('70%');
    expect(odds.textContent).toContain('1%');
    expect(odds.compareDocumentPosition($('[data-buy]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds doubled gems for the first pack and saves', async () => {
    const before = ctx.box.saved!.gems;
    $('[data-buy="gems60"]')!.click();
    await vi.waitFor(() => expect(ctx.box.saved!.gems).toBe(before + 120));
  });

  it('shows the uniform as owned after buying it', async () => {
    await vi.waitFor(() => expect($('[data-buy="outfit"]')).not.toBeNull());
    $('[data-buy="outfit"]')!.click();
    await vi.waitFor(() => expect($('[data-buy="outfit"]')).toBeNull());
    expect(document.body.textContent).toContain('Owned');
  });

  it('shows and saves the server balance after a refund', async () => {
    $('[data-buy="gems330"]')!.click();
    await vi.waitFor(() => expect(ctx.box.saved!.gems).toBe(120 + 660));
    // Discord refunds the 330 pack: its entitlement becomes deleted. The next claim brings the server balance.
    const KEY = 'parcelwood.mock.discord.entitlements';
    const ents = JSON.parse(ctx.kv.get(KEY) || '[]') as { id: string; sku_id: string; deleted: boolean }[];
    ctx.kv.set(KEY, JSON.stringify(ents.map(e => (e.sku_id === cfg.skus.gems330 ? { ...e, deleted: true } : e))));
    await ctx.backend.store.claim();
    await vi.waitFor(() => expect(ctx.box.saved!.gems).toBe(120));
    expect(document.querySelector('.chip.gem .num')!.textContent).toBe('120');
  });

  it('shows the Discord account, with no email, Apple, Google or sign-out', async () => {
    ($('#account') as HTMLElement).click();
    expect(document.body.textContent).toContain('Signed in with Discord');
    expect(document.body.textContent).toContain('Local Player');
    expect($('#acc-email')).toBeNull();
    expect($('#acc-apple')).toBeNull();
    expect($('#acc-signout')).toBeNull();
    expect($('#acc-delete')).not.toBeNull();
    ctx.stop();
  });

  it('explains on phones that purchases need a computer, with no buy buttons', async () => {
    const m = await boot('mobile');
    (document.querySelector('[data-view="shop"]') as HTMLElement).click();
    expect(document.querySelectorAll('[data-buy]').length).toBe(0);
    expect($('#store-odds')).not.toBeNull();
    expect(document.body.textContent).toContain('Discord phone app');
    m.stop();
  });
});
