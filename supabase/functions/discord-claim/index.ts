// Records the calling player's Discord purchases.
// The game calls this after a purchase and at start. Nothing the page says about a purchase is trusted:
// this function asks Discord for the player's entitlements, records each new one once
// (public.record_discord_order, first gem pack doubled), then uses up gem packs at Discord.
// Recording comes before using up, so a failure in between is repaired by the next call.
// The game then takes its new orders with public.claim_discord_orders().
//
// Deploy: supabase functions deploy discord-claim --no-verify-jwt   (the session is checked below with getUser;
// the platform's JWT check does not understand the new publishable key)
// Secrets: DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, DISCORD_SKU_GEMS60, DISCORD_SKU_GEMS330, DISCORD_SKU_OUTFIT, ALLOWED_ORIGIN
// Optional: ALLOW_TEST_PURCHASES=true accepts Discord's application-test-mode purchases (no real money). Set it
// only on a test project, never on the live one, or a team member's test purchase adds real gems.
// Refunds: Discord marks a refunded entitlement deleted. Deleted entitlements are asked for too, and each one
// that matches a recorded order is refunded (public.refund_order takes its gems back from the wallet).
// The discord-webhook function does the same as soon as Discord reports ENTITLEMENT_DELETE; this is the fallback.
import { createClient } from 'npm:@supabase/supabase-js@2';

// Keys: the new sb_secret_/sb_publishable_ keys when the project has them, else the legacy JWT keys
// (Supabase turns the legacy keys off at the end of 2026).
const pickKey = (json: string, legacy: string) => {
  try { const k = JSON.parse(Deno.env.get(json) ?? '{}')?.default; if (typeof k === 'string' && k) return k; } catch { /* not set */ }
  return Deno.env.get(legacy) ?? '';
};
const SECRET_KEY = pickKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? '';
const cors = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const DISCORD = 'https://discord.com/api/v10';
// Same list as src/discord/config.ts. Prices are list prices for the order record only.
const PRODUCTS: Record<string, { id: string; kind: 'consumable' | 'durable'; gems: number; cents: number }> = {};
for (const [env, id, kind, gems, cents] of [
  ['DISCORD_SKU_GEMS60', 'gems60', 'consumable', 60, 99],
  ['DISCORD_SKU_GEMS330', 'gems330', 'consumable', 330, 499],
  ['DISCORD_SKU_OUTFIT', 'outfit', 'durable', 0, 199],
] as const) {
  const sku = Deno.env.get(env);
  if (sku) PRODUCTS[sku] = { id, kind, gems, cents };
}
// Entitlement types (Discord docs): 1 purchase, 3 developer gift, 4 test-mode purchase, 5 free purchase,
// 6 gift from another user, 7 Nitro (premium) purchase. All but test mode are real grants of the product.
const PURCHASE = 1, TEST_MODE_PURCHASE = 4;
const GRANT_TYPES = new Set([1, 3, 5, 6, 7]);
const allowTest = Deno.env.get('ALLOW_TEST_PURCHASES') === 'true';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const appId = Deno.env.get('DISCORD_APPLICATION_ID') ?? '';
  const bot = Deno.env.get('DISCORD_BOT_TOKEN') ?? '';
  if (!appId || !bot) return json({ error: 'not configured' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: 'not signed in' }, 401);
  const userId = who.user.id;

  // The Discord id comes from our own link table, never from the request.
  const { data: link } = await admin.from('discord_accounts').select('discord_id').eq('user_id', userId).maybeSingle();
  if (!link) return json({ error: 'no discord account' }, 403);
  const discordId: string = link.discord_id;

  const skuIds = Object.keys(PRODUCTS);
  if (!skuIds.length) return json({ recorded: 0 });
  const headers = { Authorization: `Bot ${bot}` };
  const ents: any[] = [];
  let after = '';
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ user_id: discordId, sku_ids: skuIds.join(','), exclude_ended: 'true', exclude_deleted: 'false', limit: '100' });
    if (after) q.set('after', after);
    const r = await fetch(`${DISCORD}/applications/${appId}/entitlements?${q}`, { headers });
    if (!r.ok) return json({ error: 'discord unavailable' }, 502);
    const list = await r.json();
    if (!Array.isArray(list)) return json({ error: 'discord unavailable' }, 502);
    ents.push(...list);
    if (list.length < 100) break;
    after = String(list[list.length - 1].id);
  }

  let recorded = 0, refunded = 0;
  for (const e of ents) {
    const p = PRODUCTS[String(e?.sku_id)];
    const id = String(e?.id ?? '');
    // Only this app, this player, real or test-mode purchases.
    if (!p || !/^[0-9]{5,25}$/.test(id) || String(e.application_id) !== appId || String(e.user_id) !== discordId) continue;
    if (e.deleted) {
      // Refunded or removed by Discord. No-op unless we recorded it and have not refunded it yet.
      const { data, error } = await admin.rpc('refund_order', { p_source: 'discord', p_id: id });
      if (error) return json({ error: 'server error' }, 500);
      if (typeof data === 'number' && data > 0) refunded++;
      continue;
    }
    if (!GRANT_TYPES.has(e.type) && !(allowTest && e.type === TEST_MODE_PURCHASE)) continue;
    if (p.kind === 'consumable' && e.consumed) continue; // used up earlier, so already recorded
    const { error } = await admin.rpc('record_discord_order', {
      p_id: id, p_user: userId, p_discord_user: discordId, p_product: p.id, p_sku: String(e.sku_id),
      p_base_gems: p.gems, p_list_cents: p.cents, p_test: e.type === TEST_MODE_PURCHASE,
    });
    if (error) return json({ error: 'server error' }, 500);
    recorded++;
    if (p.kind === 'consumable') {
      // 204 on success. Failure is fine: the order is recorded, and the next call tries again.
      await fetch(`${DISCORD}/applications/${appId}/entitlements/${id}/consume`, { method: 'POST', headers }).catch(() => {});
    }
  }
  return json({ recorded, refunded });
});
