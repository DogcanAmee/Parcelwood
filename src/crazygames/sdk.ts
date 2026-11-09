// The parts of the CrazyGames HTML5 SDK v3 this game uses (docs.crazygames.com/sdk/intro, read 2026-10-31).
// The SDK script is loaded by crazygames/index.html; on any domain other than CrazyGames or localhost it reports
// environment 'disabled' and its calls throw, so the game treats that the same as "no SDK".
export interface CgAdError { code?: 'adsDisabled' | 'unfilled' | 'adblock' | 'adCooldown' | 'other' | string; message?: string }
export interface CgAdCallbacks { adStarted?: () => void; adFinished?: () => void; adError?: (e: CgAdError) => void }
export interface CgSettings { muteAudio?: boolean; disableChat?: boolean }

export interface CgSdk {
  init(): Promise<void>;
  readonly environment: 'local' | 'crazygames' | 'disabled' | string;
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: CgAdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart?(): void;
    loadingStop?(): void;
    happytime(): void;
    readonly settings?: CgSettings;
    addSettingsChangeListener?(cb: (s: CgSettings) => void): void;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  user?: { readonly systemInfo?: { locale?: string; countryCode?: string } };
}

declare global { interface Window { CrazyGames?: { SDK?: CgSdk } } }

/** Starts the SDK. Resolves null when there is no usable SDK (script blocked, other domain, init failed or too slow). */
export async function initSdk(win: Window = window, timeoutMs = 8000): Promise<CgSdk | null> {
  const sdk = win.CrazyGames && win.CrazyGames.SDK;
  if (!sdk || typeof sdk.init !== 'function') return null;
  let tm: ReturnType<typeof setTimeout> | undefined;
  try {
    const slow = new Promise<'slow'>(res => { tm = setTimeout(() => res('slow'), timeoutMs); });
    const r = await Promise.race([sdk.init().then(() => 'ok' as const), slow]);
    if (r !== 'ok') return null;
  } catch {
    return null;
  } finally {
    clearTimeout(tm);
  }
  return sdk.environment === 'crazygames' || sdk.environment === 'local' ? sdk : null;
}
