// Preview-only clock: shifts the date for QA so "next day", "skip a day" and check-in progress can be tested
// without waiting. Installed only when devTools is on, before the app starts. Never part of a release build.
import { localDay } from '../core/logic';
import type { Kv } from '../platform/types';

export const DAY_OFFSET_KEY = 'parcelwood.dev.dayOffset';

function showBanner(offset: number): void {
  const put = () => {
    const el = document.createElement('div');
    el.id = 'dev-clock';
    el.textContent = 'DEV CLOCK +' + offset + ' d · ' + localDay(new Date());
    el.setAttribute('role', 'status');
    Object.assign(el.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '9999', padding: '4px 10px',
      borderRadius: '10px', background: '#2b2118', color: '#ffe9a8', font: '700 12px/1.4 monospace',
      boxShadow: '0 2px 8px rgba(0,0,0,.35)', pointerEvents: 'none',
    });
    document.body.appendChild(el);
  };
  if (document.body) put(); else document.addEventListener('DOMContentLoaded', put, { once: true });
}

/** Reads ?devday=N (and removes it from the URL), then shifts the global Date by the saved offset.
 *  Returns the offset in days (0 when the clock is real). */
export function installDevClock(kv: Kv): number {
  let offset = 0;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('devday')) {
      const n = Math.floor(Number(params.get('devday')));
      if (Number.isInteger(n) && n >= 0 && n <= 365) kv.set(DAY_OFFSET_KEY, String(n));
      params.delete('devday');
      const q = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
    }
    const raw = Number(kv.get(DAY_OFFSET_KEY));
    offset = Number.isInteger(raw) && raw >= 0 && raw <= 365 ? raw : 0;
  } catch { offset = 0; }
  if (!offset) return 0;
  const RealDate = Date;
  const Real: any = RealDate;
  const shift = offset * 86400000;
  // A constructor function (not a subclass) so both `new Date()` and `Date.now()` are covered, and
  // every other static method and the prototype stay the real ones.
  function DevDate(this: unknown, ...args: any[]) {
    // Date() without new must stay a string, like the native constructor.
    if (!new.target) return new Real(RealDate.now() + shift).toString();
    return args.length ? new Real(...args) : new Real(RealDate.now() + shift);
  }
  const D: any = DevDate;
  D.now = () => RealDate.now() + shift;
  D.parse = RealDate.parse;
  D.UTC = RealDate.UTC;
  D.prototype = RealDate.prototype;
  globalThis.Date = D as DateConstructor;
  showBanner(offset);
  return offset;
}
