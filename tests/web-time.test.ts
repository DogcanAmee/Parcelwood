// The web clock anchors to the host's Date header and then runs on a monotonic timer, so a phone clock change
// during the session cannot move it. Without a usable header it safely falls back to the device clock.
import { describe, expect, it, vi } from 'vitest';
import { createWebTime, DEV_DAY_OFFSET_KEY } from '../src/web/time';
import { memKv } from './helpers';

const DATE = 'Fri, 06 Nov 2026 20:00:00 GMT';
const SERVER = Date.parse(DATE);

function time(opts: {
  header?: string | null;
  ok?: boolean;
  reject?: boolean;
  devTools?: boolean;
  offset?: string;
  mono?: () => number;
  device?: () => number;
} = {}) {
  const fetchImpl = vi.fn(async () => {
    if (opts.reject) throw new Error('offline');
    return {
      ok: opts.ok !== false,
      headers: { get: (name: string) => name.toLowerCase() === 'date' ? (opts.header === undefined ? DATE : opts.header) : null },
    } as Response;
  });
  const kv = memKv();
  if (opts.offset !== undefined) kv.set(DEV_DAY_OFFSET_KEY, opts.offset);
  return createWebTime({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    kv,
    devTools: opts.devTools,
    location: { origin: 'https://example.test', pathname: '/play/' },
    monotonic: opts.mono,
    deviceNow: opts.device,
  });
}

describe('web time', () => {
  it('uses the device until a host date arrives, then follows the monotonic timer, not the device clock', async () => {
    let mono = 1000, device = Date.parse('Mon, 02 Nov 2026 09:00:00 GMT');
    const clock = time({ mono: () => mono, device: () => device });
    expect(clock.trusted()).toBe(false);
    expect(clock.now()).toBe(device);
    expect(await clock.sync()).toBe(true);
    expect(clock.trusted()).toBe(true);
    expect(clock.now()).toBe(SERVER);
    mono += 5000;
    device += 3 * 86400000; // the phone clock jumps to a weekend
    expect(clock.now()).toBe(SERVER + 5000);
  });

  it('returns whole milliseconds when the monotonic clock has a fraction', async () => {
    let mono = 1000.75;
    const clock = time({ mono: () => mono });
    await clock.sync();
    expect(clock.now()).toBe(SERVER);
    mono += 4321.4;
    expect(clock.now()).toBe(SERVER + 4321);
    expect(Number.isInteger(clock.now())).toBe(true);
  });

  it('keeps the developer day offset only in dev builds', async () => {
    let mono = 0;
    const dev = time({ devTools: true, offset: '2', mono: () => mono });
    await dev.sync();
    expect(dev.now()).toBe(SERVER + 2 * 86400000);
    const release = time({ devTools: false, offset: '2', mono: () => mono });
    await release.sync();
    expect(release.now()).toBe(SERVER);
  });

  it('falls back to the device when the host date is missing, non-ok or offline', async () => {
    const device = () => Date.parse('Mon, 02 Nov 2026 09:00:00 GMT');
    for (const opts of [{ header: null }, { ok: false }, { reject: true }]) {
      const clock = time({ ...opts, device });
      expect(await clock.sync()).toBe(false);
      expect(clock.trusted()).toBe(false);
      expect(clock.now()).toBe(device());
    }
  });

  it('shares one sync while it is running', async () => {
    const clock = time();
    expect(clock.sync()).toBe(clock.sync());
    await clock.sync();
  });
});
