// Social features of a host with friends and servers (the Discord Activity). Other builds have none, and the
// game hides those panels. Every call needs a signed-in player; network failures throw.

export type ShareResult = 'sent' | 'copied' | 'cancelled';
export interface GuildInfo { total: number; players: number; mine: number }

export interface SocialService {
  /** The Discord server the Activity runs in; null in a DM or group call (no server board then). */
  readonly guildId: string | null;
  /** custom_id of the shared link that opened this Activity, if any. */
  readonly launchCode: string | null;
  /** Opens the host's share window with a message and an Activity link carrying `code`. */
  share(message: string, code?: string): Promise<ShareResult>;
  /** A one-time token for a carried parcel. */
  carrySend(): Promise<string>;
  /** Redeems a friend's token: 'ok' once, 'own' for the sender, 'gone' if used, unknown or over today's limit. */
  carryClaim(token: string): Promise<'ok' | 'own' | 'gone'>;
  /** Parcels this player carried that friends opened since the last call. */
  carryThanks(): Promise<number>;
  guildAdd(week: string, n: number): Promise<void>;
  guildGet(week: string): Promise<GuildInfo>;
}
