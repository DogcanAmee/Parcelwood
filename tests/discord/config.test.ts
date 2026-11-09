import { describe, expect, it } from 'vitest';
import { DISCORD_PRODUCTS, productForSku, readDiscordConfig } from '../../src/discord/config';
import { cfg, SKUS } from './helpers';

describe('Discord build settings', () => {
  it('reads client id, SKUs and the Supabase path', () => {
    expect(cfg.clientId).toBe('999999999999999999');
    expect(cfg.skus).toEqual(SKUS);
    expect(cfg.supabasePrefix).toBe('/sb');
    expect(readDiscordConfig({ VITE_DISCORD_SB_PREFIX: 'supa/' }).supabasePrefix).toBe('/supa');
  });

  it('ignores values that are not Discord ids', () => {
    const c = readDiscordConfig({ VITE_DISCORD_CLIENT_ID: 'abc', VITE_DISCORD_SKU_GEMS60: '12;drop', VITE_DISCORD_SKU_OUTFIT: ' 123456789 ' });
    expect(c.clientId).toBe('');
    expect(c.skus).toEqual({ outfit: '123456789' });
  });

  it('sells the same three things at the web prices, and no "remove ads"', () => {
    expect(DISCORD_PRODUCTS.map(p => [p.id, p.usdCents])).toEqual([['gems60', 99], ['gems330', 499], ['outfit', 199]]);
    expect(productForSku(cfg, SKUS.gems330)?.id).toBe('gems330');
    expect(productForSku(cfg, '444')).toBeNull();
  });
});
