// Web build: saves in this browser only. Storage can throw (private mode, blocked site data), so every call is guarded.
import type { GameState } from '../core/types';
import type { Features, Kv, Platform, PlatformId } from './types';
import { WEB_FEATURES } from './types';

// Same keys as the prototype, so a player's prototype save carries over in the same browser.
export const STATE_KEY = 'parcelStation.v1';
export const LANG_KEY = 'parcelStation.lang';
export const AGE_KEY = 'parcelwood.age';

export const webKv: Kv = {
  get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* storage unavailable: play continues without saving */ } },
  remove(key) { try { window.localStorage.removeItem(key); } catch { /* ignore */ } },
};

export function browserLanguages(): readonly string[] {
  return navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
}

/** The device part of a platform on top of any string store. Host builds add their own fields on top. */
export function kvPlatform(kv: Kv, id: PlatformId = 'web', features: Features = WEB_FEATURES): Platform {
  return {
    id,
    features,
    kv,
    loadState() {
      const raw = kv.get(STATE_KEY);
      if (!raw) return null;
      try { return JSON.parse(raw) as GameState; } catch { return null; }
    },
    saveState(state) { kv.set(STATE_KEY, JSON.stringify(state)); },
    loadLang() { return kv.get(LANG_KEY); },
    saveLang(lang) { kv.set(LANG_KEY, lang); },
    preferredLanguages: browserLanguages,
    loadAge() { const v = kv.get(AGE_KEY); return v === 'ok' || v === 'under' ? v : null; },
    saveAge(result) { kv.set(AGE_KEY, result); },
    clearAge() { kv.remove(AGE_KEY); },
  };
}

export const webPlatform: Platform = kvPlatform(webKv, 'web');
