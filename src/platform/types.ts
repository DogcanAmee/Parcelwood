// What the game needs from the device. Web uses browser storage; the phone build will supply its own.
// Host sites (CrazyGames, Discord) add their own pieces through the optional fields at the end.
import type { GameState } from '../core/types';
import type { AgeResult } from '../core/age';

/** Small string store for settings and session data. */
export interface Kv {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type PlatformId = 'web' | 'ios' | 'android' | 'crazygames' | 'discord';

/**
 * What is on for this build. The UI reads these flags and never checks the platform id.
 * `shop`: none = no store; rewards-only = ads/coins replace paid offers; iap = paid store.
 */
export interface Features {
  shop: 'none' | 'rewards-only' | 'iap';
  /** Discord sells gem packs that open random parcels. Websites and app stores keep this false. */
  randomPaidPacks: boolean;
  accounts: boolean;
  externalLinks: boolean;
  ageGate: boolean;
  /** Fixed, scroll-free CrazyGames stage layout. */
  stageLayout: boolean;
  /** Rush Hour notes on the daily board. */
  rush: boolean;
  /** Station Week: the weekly back-room event (open every day, weekend rewards). */
  week: boolean;
  notifications: boolean;
}

export const WEB_FEATURES: Features = {
  shop: 'iap', randomPaidPacks: false, accounts: true, externalLinks: true, ageGate: true,
  stageLayout: false, rush: true, week: true, notifications: false,
};

export const CRAZYGAMES_FEATURES: Features = {
  shop: 'rewards-only', randomPaidPacks: false, accounts: false, externalLinks: false, ageGate: false,
  stageLayout: true, rush: false, week: true, notifications: false,
};

export const DISCORD_FEATURES: Features = {
  shop: 'iap', randomPaidPacks: true, accounts: true, externalLinks: true, ageGate: true,
  stageLayout: false, rush: true, week: true, notifications: false,
};

/** 'rewarded' only when the ad played to the end. 'unavailable' = ads are off for this session (ad blocker, no fill program, kids site). */
export type AdResult = 'rewarded' | 'failed' | 'unavailable';

/** Video ads from the host site. The game shows its own "ad playing" cover from request to result. */
export interface AdService {
  /** False when ads cannot play this session. Ad buttons are hidden then; coin options stay. */
  available(): boolean;
  /** Plays a rewarded ad. `onStart` fires when the ad actually starts (the game mutes then). */
  rewarded(onStart: () => void): Promise<AdResult>;
  /** Asks for a break ad. The host may decline (too soon, no fill); the game carries on either way. */
  midgame(onStart: () => void): Promise<AdResult>;
  /** One-time adapter setup (load the tag, check for an ad blocker). Failure never blocks the game. */
  init?(): Promise<void>;
  /** After "remove ads" is owned: break ads are never requested again; rewarded ads stay optional. */
  setNoAds?(on: boolean): void;
}

/** Events and settings a host site wants from the game. Every call must be safe to make at any time. */
export interface HostHooks {
  gameplayStart(): void;
  gameplayStop(): void;
  /** A big moment, such as a finished series. Use sparingly. */
  happy(): void;
  /** Sound muted by the host site's own setting. Overrides the in-game sound button. */
  muted(): boolean;
  onMutedChange(cb: () => void): void;
}

export type ProductId = 'noads' | 'decor_station' | 'decor_outfit' | 'starter' | 'gems60' | 'gems330' | 'outfit';

export interface Product {
  id: ProductId;
  /** Price as the store shows it, in the player's currency. */
  price: string;
  owned: boolean;
  /** once = bought forever; consumable = used up when granted. */
  kind: 'once' | 'consumable';
}

/**
 * 'not-completed' and 'mobile' are the existing Discord purchase results.
 * 'cancelled' = the player closed the payment window; 'need-account' = sign in before buying.
 * 'unavailable' = the product or store is not available on this platform.
 */
export type BuyResult =
  | 'ok' | 'pending' | 'cancelled' | 'owned' | 'unavailable' | 'busy' | 'need-account'
  | 'not-completed' | 'mobile';

/** A paid product that is ready to add to the game. */
export interface Grant {
  orderId: string;
  product: ProductId;
  /** Gems to add, bonus already included. 0 for a non-gem product. */
  gems: number;
}

/** Paid products. Discord's shop is the first implementation. */
export interface StoreService {
  available(): boolean;
  products(locale?: string): Promise<Product[]>;
  buy(id: ProductId): Promise<BuyResult>;
  /** App stores require this; Discord re-reads its entitlements. */
  restore(): Promise<void>;
  owns(id: ProductId): boolean;
  /** The handler must add the grant to the game and save before it returns. */
  onGrant(handler: (g: Grant) => void): void;
}

export interface ShareService {
  share(text: string, url?: string): Promise<'sent' | 'copied' | 'cancelled'>;
}

/**
 * A clock that does not only trust the device. The web build reads the host's HTTP Date header and then advances
 * with a monotonic timer, so a phone clock changed later does not move the weekend window. `trusted` is false when
 * no server time was available (offline or a host that hides the header); callers then fall back to the device.
 */
export interface TimeService {
  now(): number;
  trusted(): boolean;
  /** Best effort; resolves false when the host cannot supply a time. */
  sync(): Promise<boolean>;
}

/** App builds only: save when the app goes to the background; handle the Android back button. */
export interface Lifecycle {
  onPause(cb: () => void): void;
  onBack(cb: () => boolean): void;
}

export interface Platform {
  readonly id: PlatformId;
  readonly features: Features;
  readonly kv: Kv;
  loadState(): GameState | null;
  saveState(state: GameState): void;
  loadLang(): string | null;
  saveLang(lang: string): void;
  preferredLanguages(): readonly string[];
  /** Result of the age screen on this device. Kept so a child cannot simply try again with another year. */
  loadAge(): AgeResult | null;
  saveAge(result: AgeResult): void;
  /** Dev builds only: forget the age result so the screen can be tested again. */
  clearAge(): void;

  // ---- optional, for host sites ----
  /** Video ads for this build. */
  readonly ads?: AdService;
  readonly host?: HostHooks;
  readonly store?: StoreService;
  readonly share?: ShareService;
  readonly time?: TimeService;
  readonly lifecycle?: Lifecycle;
  /** @deprecated Read features.ageGate instead. Kept so older platform objects still work. */
  readonly ageGate?: boolean;
}
