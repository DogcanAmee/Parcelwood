// Settings for the Discord build. All values come from build-time env vars (see discord/.env.example).
// None of them is secret: the client secret and bot token live only in the Supabase functions.

export type DiscordProductId = 'gems60' | 'gems330' | 'outfit';

export interface DiscordProduct {
  id: DiscordProductId;
  /** consumable: used up when granted (gem packs). durable: owned forever (the uniform). */
  kind: 'consumable' | 'durable';
  gems: number;
  /** Same list price as every other platform, in US cents. Discord converts other currencies itself. */
  usdCents: number;
}

// "Remove ads" is not sold here: the Discord build has no ads. "10 extra parcels" is bought with gems in the game.
export const DISCORD_PRODUCTS: readonly DiscordProduct[] = [
  { id: 'gems60', kind: 'consumable', gems: 60, usdCents: 99 },
  { id: 'gems330', kind: 'consumable', gems: 330, usdCents: 499 },
  { id: 'outfit', kind: 'durable', gems: 0, usdCents: 199 },
];

export interface DiscordConfig {
  /** Application (client) id from the Discord Developer Portal. Empty = local mock mode. */
  clientId: string;
  /** Path the Developer Portal maps to the Supabase project (URL mapping "/sb" -> "<project>.supabase.co"). */
  supabasePrefix: string;
  /** Supabase publishable key. Empty = no backend: saves and purchases use the local mock. */
  supabaseKey: string;
  /** SKU id in the Developer Portal for each product. A product without one is not shown. */
  skus: Partial<Record<DiscordProductId, string>>;
}

type Env = Record<string, string | boolean | undefined>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function readDiscordConfig(env: Env): DiscordConfig {
  const skus: Partial<Record<DiscordProductId, string>> = {};
  const pairs: [DiscordProductId, unknown][] = [
    ['gems60', env.VITE_DISCORD_SKU_GEMS60], ['gems330', env.VITE_DISCORD_SKU_GEMS330], ['outfit', env.VITE_DISCORD_SKU_OUTFIT],
  ];
  for (const [id, v] of pairs) { const s = str(v); if (/^\d{5,25}$/.test(s)) skus[id] = s; }
  const prefix = str(env.VITE_DISCORD_SB_PREFIX) || '/sb';
  return {
    clientId: /^\d{5,25}$/.test(str(env.VITE_DISCORD_CLIENT_ID)) ? str(env.VITE_DISCORD_CLIENT_ID) : '',
    supabasePrefix: prefix.startsWith('/') ? prefix.replace(/\/+$/, '') : '/' + prefix.replace(/\/+$/, ''),
    supabaseKey: str(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    skus,
  };
}

export function productForSku(cfg: DiscordConfig, skuId: string): DiscordProduct | null {
  const id = (Object.keys(cfg.skus) as DiscordProductId[]).find(k => cfg.skus[k] === skuId);
  return id ? DISCORD_PRODUCTS.find(p => p.id === id) || null : null;
}
