// Discord Webhook Events endpoint: takes back the gems of refunded purchases (ENTITLEMENT_DELETE).
// Not called by the game. Discord calls it; every request is checked against the app's public key.
//
// Deploy: supabase functions deploy discord-webhook --no-verify-jwt   (Discord sends no Supabase session)
// Secrets: DISCORD_PUBLIC_KEY (Developer Portal > General Information), DISCORD_APPLICATION_ID
// Then in Developer Portal > Webhooks: endpoint URL https://<project>.supabase.co/functions/v1/discord-webhook,
// turn events on, and subscribe to Entitlement Delete.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleDiscordWebhook } from './handler.ts';

const pickKey = (json: string, legacy: string) => {
  try { const k = JSON.parse(Deno.env.get(json) ?? '{}')?.default; if (typeof k === 'string' && k) return k; } catch { /* not set */ }
  return Deno.env.get(legacy) ?? '';
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, pickKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(req => handleDiscordWebhook(req, {
  publicKey: Deno.env.get('DISCORD_PUBLIC_KEY') ?? '',
  applicationId: Deno.env.get('DISCORD_APPLICATION_ID') ?? '',
  async refund(id) {
    const { data, error } = await admin.rpc('refund_order', { p_source: 'discord', p_id: id });
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : null;
  },
}));
