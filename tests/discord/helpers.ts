import { readDiscordConfig } from '../../src/discord/config';

export const SKUS = { gems60: '111111111111111111', gems330: '222222222222222222', outfit: '333333333333333333' };

export const cfg = readDiscordConfig({
  VITE_DISCORD_CLIENT_ID: '999999999999999999',
  VITE_DISCORD_SKU_GEMS60: SKUS.gems60,
  VITE_DISCORD_SKU_GEMS330: SKUS.gems330,
  VITE_DISCORD_SKU_OUTFIT: SKUS.outfit,
});
