// Deletes the calling player's account. The save row goes with it (on delete cascade);
// web orders keep their row with user_id cleared, for tax records.
// Deploy with: supabase functions deploy delete-account --no-verify-jwt (it checks the session itself below;
// the platform's JWT check does not understand the new publishable key)
// Set ALLOWED_ORIGIN to the web game's address (for example the Vercel domain).
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
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, SECRET_KEY);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: 'not signed in' }, 401);

  // TODO before App Store review (P3): if the player used Sign in with Apple, revoke their Apple token here.
  // Apple requires it when an account is deleted. Needs the Apple key set up for Sign in with Apple.

  const { error: delError } = await admin.auth.admin.deleteUser(data.user.id);
  if (delError) return json({ error: 'delete failed' }, 500);
  return json({ deleted: true });
});
