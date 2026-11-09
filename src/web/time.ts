// A best-effort clock that does not start from the device alone. A HEAD request to the page itself returns the
// host's Date header on every static host we use; from that anchor the clock advances with performance.now(), which
// a phone clock change cannot move. Offline, or on a host that hides the header, sync() fails and the game falls
// back to the device clock (the save's high-water mark still stops a clock moved back from reopening a past weekend).
import type { Kv, TimeService } from '../platform/types';

export const DEV_DAY_OFFSET_KEY = 'parcelwood.dev.dayOffset';
const SYNC_TIMEOUT_MS = 2500;

export interface WebTimeOptions {
  kv?: Kv;
  /** Dev builds accept the explicit ?devday offset from the developer panel. Never set in a release build. */
  devTools?: boolean;
  fetchImpl?: typeof fetch;
  location?: Pick<Location, 'origin' | 'pathname'>;
  /** Monotonic milliseconds. Injectable for tests; performance.now() is the real source. */
  monotonic?: () => number;
  /** Device time for the untrusted fallback and for tests. */
  deviceNow?: () => number;
  timeoutMs?: number;
}

export function createWebTime(opts: WebTimeOptions = {}): TimeService {
  const fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  const location = opts.location ?? (typeof window !== 'undefined' ? window.location : undefined);
  const monotonic = opts.monotonic ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const deviceNow = opts.deviceNow ?? (() => Date.now());
  let anchorServer = 0;
  let anchorMono = 0;
  let trusted = false;
  let syncing: Promise<boolean> | null = null;

  function devOffset(): number {
    if (!opts.devTools || !opts.kv) return 0;
    const days = Number(opts.kv.get(DEV_DAY_OFFSET_KEY));
    return Number.isInteger(days) && days >= 0 && days <= 365 ? days * 86400000 : 0;
  }

  function now(): number {
    // Saves store whole milliseconds; a fractional monotonic delta would otherwise leak into saved timestamps.
    if (!trusted) return Math.floor(deviceNow());
    // The Date header has whole-second precision; the monotonic part makes time move normally between syncs.
    return Math.floor(anchorServer + (monotonic() - anchorMono) + devOffset());
  }

  async function doSync(): Promise<boolean> {
    if (!fetchImpl || !location) return false;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? SYNC_TIMEOUT_MS) : null;
    try {
      const res = await fetchImpl(location.origin + location.pathname, {
        method: 'HEAD',
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) return false;
      const header = res.headers.get('date');
      const server = header ? Date.parse(header) : NaN;
      if (!Number.isFinite(server)) return false;
      anchorServer = server;
      anchorMono = monotonic();
      trusted = true;
      return true;
    } catch {
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  return {
    now,
    trusted: () => trusted,
    sync: () => {
      if (!syncing) syncing = doSync().finally(() => { syncing = null; });
      return syncing;
    },
  };
}
