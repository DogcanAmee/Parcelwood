// Web / H5 video ads behind the game's AdService interface.
//
// M1 is test mode only. Two paths:
//   1. No publisher id (the preview default): a local test ad overlay. No network, no account, no money.
//   2. VITE_ADSENSE_CLIENT set: Google's Ad Placement API (H5 Games Ads) with data-adbreak-test="on".
//      Test mode shows mock ads and sends no ad requests, so a real AdSense account is not needed.
// Live ads are out of scope until the founder approves them.
import type { AdResult, AdService } from '../platform/types';

/** An ad that never starts must not leave the game covered for good. */
export const H5_AD_START_TIMEOUT_MS = 60_000;
/** Once an ad has started, wait for the API's own finish; this is only a last-resort safety net. */
export const H5_AD_PLAY_TIMEOUT_MS = 10 * 60_000;

export interface H5AdsOptions {
  /** AdSense publisher id. Absent means the local test ad. */
  clientId?: string;
  /** Force the local test ad even when a publisher id is set. */
  local?: boolean;
  /** QA switch: pretend an ad blocker is on. */
  blocked?: boolean;
  doc?: Document;
  /** Rewarded and break ad lengths for the local test ad. */
  seconds?: { rewarded: number; midgame: number };
  startTimeoutMs?: number;
  playTimeoutMs?: number;
  /** Skip the bait-element ad-blocker check (tests). */
  detectBlocker?: boolean;
}

type AdsWindow = Window & {
  adsbygoogle?: Record<string, unknown>[];
};

/** Ad blockers hide elements with the usual ad class names. A hidden bait means ads cannot play. */
export function detectAdBlocker(doc: Document): boolean {
  try {
    const bait = doc.createElement('div');
    bait.className = 'adsbox ad-placement ad-banner';
    bait.setAttribute('aria-hidden', 'true');
    bait.style.cssText = 'position:absolute;left:-10000px;top:-10000px;width:12px;height:12px;pointer-events:none;';
    doc.body.appendChild(bait);
    const view = doc.defaultView;
    const cs = view ? view.getComputedStyle(bait) : null;
    const hidden = !!cs && (cs.display === 'none' || cs.visibility === 'hidden' || (cs.opacity !== '' && Number(cs.opacity) === 0));
    bait.remove();
    return hidden;
  } catch {
    return false;
  }
}

function loadGoogleTag(doc: Document, clientId: string, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const script = doc.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    // TEST MODE ONLY. Remove only when real AdSense ads are approved.
    script.setAttribute('data-adbreak-test', 'on');
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(clientId);
    let done = false;
    const finish = (ok: boolean) => { if (done) return; done = true; clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => finish(true), timeoutMs); // slow: the first ad result corrects it
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    doc.head.appendChild(script);
  });
}

export function createH5Ads(opts: H5AdsOptions = {}): AdService {
  const doc = opts.doc || document;
  const local = opts.local ?? !opts.clientId;
  const seconds = opts.seconds || { rewarded: 5, midgame: 3 };
  const startMs = opts.startTimeoutMs ?? H5_AD_START_TIMEOUT_MS;
  const playMs = opts.playTimeoutMs ?? H5_AD_PLAY_TIMEOUT_MS;
  let blocked = !!opts.blocked;
  let noAds = false;
  let initPromise: Promise<void> | null = null;

  function push(data: Record<string, unknown>) {
    const win = doc.defaultView as AdsWindow | null;
    if (!win) return;
    win.adsbygoogle = win.adsbygoogle || [];
    win.adsbygoogle.push(data);
  }

  async function init(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (blocked) return;
      if (opts.detectBlocker !== false && detectAdBlocker(doc)) { blocked = true; return; }
      if (local) return;
      const ok = await loadGoogleTag(doc, opts.clientId || '', 1500);
      if (!ok) { blocked = true; return; }
      // Preload the first break and tell the API the game can play sound. (A sound:on ad may need sound.)
      push({ preloadAdBreaks: 'on', sound: 'on' });
    })();
    return initPromise;
  }

  function playLocal(type: 'rewarded' | 'midgame', onStart: () => void): Promise<AdResult> {
    if (!available() || (type === 'midgame' && noAds)) return Promise.resolve('unavailable');
    return new Promise(resolve => {
      const el = doc.createElement('div');
      el.className = 'web-test-ad';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Test ad');
      let left = seconds[type];
      let done = false;
      const finish = (result: AdResult) => {
        if (done) return;
        done = true;
        clearInterval(iv);
        el.remove();
        resolve(result);
      };
      const draw = () => {
        el.innerHTML = '<div class="web-test-ad-box">' +
          '<div class="web-test-ad-tag">TEST AD · 测试广告</div>' +
          '<div class="web-test-ad-kind">' + (type === 'rewarded' ? 'Rewarded video · 奖励视频' : 'Break ad · 插屏广告') + '</div>' +
          '<div class="web-test-ad-count" aria-live="polite">' + left + '</div>' +
          '<p class="web-test-ad-note">' + (type === 'rewarded' ? 'Finish the video to get the reward.' : 'The game returns when this ends.') + '</p>' +
          (type === 'rewarded'
            ? '<button type="button" class="btn ghost slim" data-test-ad-close>Close early (no reward) · 提前关闭（不给奖励）</button>'
            : '<button type="button" class="btn ghost slim" data-test-ad-close>Skip · 跳过</button>') +
          '</div>';
      };
      draw();
      doc.body.appendChild(el);
      onStart();
      const iv = setInterval(() => {
        left--;
        if (left <= 0) finish('rewarded');
        else draw();
      }, 1000);
      el.addEventListener('click', e => {
        if ((e.target as HTMLElement).closest('[data-test-ad-close]')) finish('failed');
      });
    });
  }

  function playGoogle(type: 'rewarded' | 'midgame', onStart: () => void): Promise<AdResult> {
    if (!available() || (type === 'midgame' && noAds)) return Promise.resolve('unavailable');
    return new Promise(resolve => {
      let done = false;
      let viewed = false;
      let dismissed = false;
      let timer = setTimeout(() => finish('failed'), startMs);
      const finish = (result: AdResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      };
      try {
        push({
          type: type === 'rewarded' ? 'reward' : 'next',
          name: type === 'rewarded' ? 'reward_parcels' : 'between_parcels',
          beforeAd: () => {
            if (done) return;
            clearTimeout(timer);
            timer = setTimeout(() => finish('failed'), playMs);
            onStart();
          },
          afterAd: () => {},
          beforeReward: (showAdFn: () => void) => { showAdFn(); },
          adDismissed: () => { dismissed = true; },
          adViewed: () => { viewed = true; },
          adBreakDone: (info: { breakStatus?: string } | undefined) => {
            const status = info && info.breakStatus;
            if (status === 'viewed' || viewed) finish('rewarded');
            else if (status === 'dismissed' || dismissed) finish('failed');
            else finish('failed'); // notReady, noAdPreloaded, frequencyCapped, timeout, error: no reward now
          },
        });
      } catch {
        finish('failed');
      }
    });
  }

  function available() { return !blocked; }

  return {
    available,
    init,
    setNoAds(on: boolean) { noAds = !!on; },
    rewarded: onStart => (local ? playLocal('rewarded', onStart) : playGoogle('rewarded', onStart)),
    midgame: onStart => (local ? playLocal('midgame', onStart) : playGoogle('midgame', onStart)),
  };
}
