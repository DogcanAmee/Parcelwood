// Discord Webhook Events for Parcelwood: refunds as soon as Discord reports them.
// Kept free of Deno globals so the tests can run it (tests/discord/webhook.test.ts); index.ts wires it up.
//
// Discord signs every request with the app's public key (Ed25519 over timestamp + body). Unsigned or badly signed
// requests get 401, which Discord also uses to check the endpoint when it is saved in the Developer Portal.
// Body: { version: 1, application_id, type: 0 (PING) | 1 (EVENT), event?: { type, timestamp, data } }.
// Discord expects 204 for both PING and events.

export interface WebhookDeps {
  /** The app's public key from Developer Portal > General Information (hex). */
  publicKey: string;
  applicationId: string;
  /** public.refund_order('discord', id). Resolves to the gems taken back, 0, or null (no such order). */
  refund(entitlementId: string): Promise<number | null>;
}

const PING = 0, EVENT = 1;
const MAX_AGE_S = 300; // reject replays of old signed requests

function hexBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyDiscordSignature(publicKey: string, signature: string, timestamp: string, body: string): Promise<boolean> {
  const key = hexBytes(publicKey), sig = hexBytes(signature);
  if (!key || key.length !== 32 || !sig || sig.length !== 64 || !/^\d{1,12}$/.test(timestamp)) return false;
  try {
    const k = await crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, k, sig, new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

export async function handleDiscordWebhook(req: Request, deps: WebhookDeps, nowS = Math.floor(Date.now() / 1000)): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!deps.publicKey || !deps.applicationId) return new Response(null, { status: 500 });
  const signature = req.headers.get('X-Signature-Ed25519') ?? '';
  const timestamp = req.headers.get('X-Signature-Timestamp') ?? '';
  const body = await req.text();
  if (body.length > 65536 || !(await verifyDiscordSignature(deps.publicKey, signature, timestamp, body))) {
    return new Response('invalid request signature', { status: 401 });
  }
  if (Math.abs(nowS - Number(timestamp)) > MAX_AGE_S) return new Response('stale request', { status: 401 });

  let msg: any;
  try { msg = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  if (msg?.type === PING) return new Response(null, { status: 204 });
  if (msg?.type !== EVENT || String(msg.application_id) !== deps.applicationId) return new Response(null, { status: 204 });

  const ev = msg.event;
  if (ev?.type === 'ENTITLEMENT_DELETE') {
    const id = String(ev.data?.id ?? '');
    if (/^[0-9]{5,25}$/.test(id) && String(ev.data?.application_id ?? deps.applicationId) === deps.applicationId) {
      // A failure returns 500 so Discord sends the event again; refund_order is safe to repeat.
      try { await deps.refund(id); } catch { return new Response(null, { status: 500 }); }
    }
  }
  // ENTITLEMENT_CREATE needs nothing here: discord-claim records purchases when the game asks.
  return new Response(null, { status: 204 });
}
