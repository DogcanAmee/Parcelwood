// The part of the Discord Embedded App SDK this game uses. The real SDK (@discord/embedded-app-sdk) is only
// imported by the Discord entry (discord/main.ts), so the web build and `npm test` never need the package.
// Shapes follow the SDK 2.5.0 type definitions.

export type DiscordPlatformKind = 'desktop' | 'mobile';

/** An entitlement as the SDK reports it. type 1 = purchase, 4 = test-mode purchase. */
export interface SdkEntitlement {
  id: string;
  sku_id: string;
  type: number;
  consumed?: boolean | null;
  deleted?: boolean | null;
}

export interface SdkSku {
  id: string;
  name: string;
  type: number;
  price: { amount: number; currency: string };
}

export interface DiscordSdkLike {
  readonly clientId: string;
  readonly instanceId: string;
  readonly platform: string; // 'desktop' (desktop app and browser) or 'mobile'
  readonly guildId: string | null; // the server the Activity runs in (null in DMs)
  readonly customId: string | null; // custom_id of the shared link that launched it
  ready(): Promise<void>;
  // The event's data is not typed by the SDK; the store re-reads entitlements instead of trusting it.
  subscribe(event: 'ENTITLEMENT_CREATE', listener: (data: unknown) => unknown): Promise<unknown>;
  commands: {
    authorize(args: { client_id: string; scope: 'identify'[]; response_type?: 'code'; state?: string; prompt?: 'none' }): Promise<{ code: string }>;
    authenticate(args: { access_token?: string | null }): Promise<{ access_token: string; user: { id: string; username: string; global_name?: string | null } }>;
    getSkus(): Promise<{ skus: SdkSku[] }>;
    getEntitlements(): Promise<{ entitlements: SdkEntitlement[] }>;
    startPurchase(args: { sku_id: string }): Promise<SdkEntitlement[] | null>;
    shareLink(args: { message: string; custom_id?: string }): Promise<{ success: boolean; didCopyLink: boolean; didSendMessage: boolean }>;
  };
}

/** Purchases open Discord's own payment window, which exists on desktop and in the browser but not in the phone apps. */
export function canPurchase(sdk: Pick<DiscordSdkLike, 'platform'>): boolean {
  return sdk.platform !== 'mobile';
}
