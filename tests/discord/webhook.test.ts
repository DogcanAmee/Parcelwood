import { beforeAll, describe, expect, it } from 'vitest';
import { handleDiscordWebhook, verifyDiscordSignature, type WebhookDeps } from '../../supabase/functions/discord-webhook/handler';

const APP = '1566183042773553203';
const NOW = 1_800_000_000;
let keys: CryptoKeyPair;
let publicKey = '';

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');

beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  publicKey = hex(await crypto.subtle.exportKey('raw', keys.publicKey));
});

async function signed(body: unknown, ts = NOW, key = keys.privateKey): Promise<Request> {
  const text = JSON.stringify(body);
  const sig = hex(await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(ts + text)));
  return new Request('https://x.supabase.co/functions/v1/discord-webhook', {
    method: 'POST', body: text, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': String(ts) },
  });
}

function deps(refunds: string[], fail = false): WebhookDeps {
  return { publicKey, applicationId: APP, async refund(id) { if (fail) throw new Error('db down'); refunds.push(id); return 60; } };
}

const deleteEvent = (id: string, app = APP) => ({
  version: 1, application_id: APP, type: 1,
  event: { type: 'ENTITLEMENT_DELETE', timestamp: '2026-11-02T00:00:00Z', data: { id, application_id: app, sku_id: '1', user_id: '2', deleted: true } },
});

describe('discord-webhook', () => {
  it('answers Discord\'s PING with 204', async () => {
    const r = await handleDiscordWebhook(await signed({ version: 1, application_id: APP, type: 0 }), deps([]), NOW);
    expect(r.status).toBe(204);
  });

  it('refunds the order of a deleted entitlement', async () => {
    const refunds: string[] = [];
    const r = await handleDiscordWebhook(await signed(deleteEvent('123456789012345678')), deps(refunds), NOW);
    expect(r.status).toBe(204);
    expect(refunds).toEqual(['123456789012345678']);
  });

  it('rejects a missing or wrong signature, and a body changed after signing', async () => {
    const refunds: string[] = [];
    const other = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const unsigned = new Request('https://x/', { method: 'POST', body: JSON.stringify(deleteEvent('123456')) });
    expect((await handleDiscordWebhook(unsigned, deps(refunds), NOW)).status).toBe(401);
    expect((await handleDiscordWebhook(await signed(deleteEvent('123456'), NOW, other.privateKey), deps(refunds), NOW)).status).toBe(401);
    const good = await signed(deleteEvent('123456'));
    const tampered = new Request(good.url, { method: 'POST', headers: good.headers, body: JSON.stringify(deleteEvent('654321')) });
    expect((await handleDiscordWebhook(tampered, deps(refunds), NOW)).status).toBe(401);
    expect(refunds).toEqual([]);
  });

  it('rejects an old signed request sent again', async () => {
    const refunds: string[] = [];
    const r = await handleDiscordWebhook(await signed(deleteEvent('123456'), NOW - 3600), deps(refunds), NOW);
    expect(r.status).toBe(401);
    expect(refunds).toEqual([]);
  });

  it('ignores other apps and other event types', async () => {
    const refunds: string[] = [];
    await handleDiscordWebhook(await signed(deleteEvent('123456', '42424242')), deps(refunds), NOW);
    await handleDiscordWebhook(await signed({ ...deleteEvent('123456'), application_id: '42424242' }), deps(refunds), NOW);
    await handleDiscordWebhook(await signed({ ...deleteEvent('123456'), event: { type: 'ENTITLEMENT_CREATE', data: { id: '123456' } } }), deps(refunds), NOW);
    expect(refunds).toEqual([]);
  });

  it('answers 500 when the refund fails, so Discord sends the event again', async () => {
    const r = await handleDiscordWebhook(await signed(deleteEvent('123456')), deps([], true), NOW);
    expect(r.status).toBe(500);
  });

  it('refuses to run without its settings', async () => {
    const r = await handleDiscordWebhook(await signed(deleteEvent('123456')), { ...deps([]), publicKey: '' }, NOW);
    expect(r.status).toBe(500);
    expect(await verifyDiscordSignature('zz', 'zz', '1', '{}')).toBe(false);
  });
});
