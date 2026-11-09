import type { AgeResult } from '../src/core/age';
import type { GameState } from '../src/core/types';
import type { Features, Kv, Platform } from '../src/platform/types';
import { WEB_FEATURES } from '../src/platform/types';

export function memKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); }, remove: k => { data.delete(k); } };
}

/** In-memory platform for tests. `saved` always holds the latest device save. */
export function fakePlatform(age: AgeResult | null = 'ok', kv = memKv(), features: Features = WEB_FEATURES) {
  const box = { saved: null as GameState | null, age, kv };
  const platform: Platform = {
    id: 'web',
    features,
    kv,
    loadState: () => box.saved,
    saveState: s => { box.saved = JSON.parse(JSON.stringify(s)); },
    loadLang: () => 'en',
    saveLang: () => {},
    preferredLanguages: () => ['en-US'],
    loadAge: () => box.age,
    saveAge: r => { box.age = r; },
    clearAge: () => { box.age = null; },
  };
  return { platform, box };
}

export const ROOTS = '<div class="app" id="app"></div><nav class="nav"><div class="nav-in" id="nav-in"></div></nav><div id="sheet-root"></div><div id="modal-root"></div><div id="toast-root"></div>';
