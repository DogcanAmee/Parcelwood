// Discord sign-in for the Discord Activity build.
// The game sends the one-time code from the SDK's authorize command. This function:
//   1. swaps the code for a Discord access token, using the client secret (which never leaves the server),
//   2. asks Discord who the token belongs to (scope "identify" only: id and name, no email),
//   3. finds or makes the game account linked to that Discord id (public.discord_accounts),
//   4. makes a Supabase session for that account and returns it with the Discord token.
// The Discord token goes back to the page because the SDK's authenticate command needs it.
//
// Deploy: supabase functions deploy discord-auth --no-verify-jwt   (the caller has no session yet)
// Secrets: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, ALLOWED_ORIGIN (https://<client id>.discordsays.com)
//
// Step 4 makes a one-time magic-link token on the server and redeems it at once; no email is ever sent.
// To verify on the real project first (plan D2): that hosted Supabase accepts the placeholder address below.
//
// Security: the account is found only through public.discord_accounts (written only here) and must carry this
// Discord id in app_metadata (players cannot write app_metadata). The placeholder address has a random part,
// so nobody can register it ahead of a player and have this function hand them that player's account.
import { createClient } from 'npm:@supabase/supabase-js@2';

// Keys: the new sb_secret_/sb_publishable_ keys when the project has them, else the legacy JWT keys
// (Supabase turns the legacy keys off at the end of 2026).
const pickKey = (json: string, legacy: string) => {
  try { const k = JSON.parse(Deno.env.get(json) ?? '{}')?.default; if (typeof k === 'string' && k) return k; } catch { /* not set */ }
  return Deno.env.get(legacy) ?? '';
};
const SECRET_KEY = pickKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const PUBLISHABLE_KEY = pickKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');

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
// Never delivered: .invalid is reserved and cannot receive mail. Only used as the account's login key.
// The random part makes it impossible to guess from the (public) Discord id.
const placeholderEmail = (discordId: string) => `discord-${discordId}-${crypto.randomUUID()}@users.parcelwood.invalid`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const clientId = Deno.env.get('DISCORD_CLIENT_ID') ?? '';
  const secret = Deno.env.get('DISCORD_CLIENT_SECRET') ?? '';
  if (!clientId || !secret) return json({ error: 'not configured' }, 500);

  let code = '';
  try { const b = await req.json(); code = typeof b?.code === 'string' ? b.code : ''; } catch { /* bad body */ }
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(code)) return json({ error: 'bad request' }, 400);

  // 1. code -> Discord token
  const tok = await fetch(`${DISCORD}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'authorization_code', code }),
  });
  if (!tok.ok) return json({ error: 'discord rejected the code' }, 401);
  const t = await tok.json();
  const accessToken = typeof t?.access_token === 'string' ? t.access_token : '';
  const scopes = String(t?.scope ?? '').split(' ');
  if (!accessToken || !scopes.includes('identify')) return json({ error: 'discord rejected the code' }, 401);

  // 2. who is it
  const me = await fetch(`${DISCORD}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!me.ok) return json({ error: 'discord user lookup failed' }, 502);
  const u = await me.json();
  const discordId = String(u?.id ?? '');
  if (!/^[0-9]{5,25}$/.test(discordId)) return json({ error: 'discord user lookup failed' }, 502);
  const name = String(u?.global_name || u?.username || 'Player').slice(0, 64);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3. game account for this Discord id
  const findLink = async () => {
    const { data, error } = await admin.from('discord_accounts').select('user_id').eq('discord_id', discordId).maybeSingle();
    if (error) throw error;
    return data?.user_id as string | undefined;
  };
  let userId: string | undefined;
  try {
    userId = await findLink();
    if (!userId) {
      const { data: made, error: makeErr } = await admin.auth.admin.createUser({
        email: placeholderEmail(discordId), email_confirm: true, app_metadata: { provider: 'discord', discord_id: discordId },
      });
      if (makeErr || !made.user) return json({ error: 'server error' }, 500);
      const { error: insErr } = await admin.from('discord_accounts').insert({ discord_id: discordId, user_id: made.user.id });
      userId = insErr ? await findLink() : made.user.id;
      // Another sign-in for the same Discord account linked first: drop ours (never the linked one) and use theirs.
      if (userId !== made.user.id) await admin.auth.admin.deleteUser(made.user.id);
    }
  } catch { return json({ error: 'server error' }, 500); }
  if (!userId) return json({ error: 'server error' }, 500);
  const { data: owner } = await admin.auth.admin.getUserById(userId);
  if (!owner?.user?.email || owner.user.app_metadata?.discord_id !== discordId) return json({ error: 'server error' }, 500);

  // 4. session for that account
  const { data: gen, error: genErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: owner.user.email });
  const hashed = gen?.properties?.hashed_token;
  if (genErr || !hashed) return json({ error: 'server error' }, 500);
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: ses, error: sesErr } = await anon.auth.verifyOtp({ token_hash: hashed, type: 'email' });
  if (sesErr || !ses.session || ses.user?.id !== userId) return json({ error: 'server error' }, 500);

  return json({
    session: { access_token: ses.session.access_token, refresh_token: ses.session.refresh_token },
    discord_access_token: accessToken,
    discord_user: { id: discordId, name },
  });
});
