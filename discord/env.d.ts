/// <reference types="vite/client" />
// Build-time settings of the Discord build. Copy discord/.env.example to discord/.env.local.
interface ImportMetaEnv {
  readonly VITE_DISCORD_CLIENT_ID?: string;
  readonly VITE_DISCORD_SKU_GEMS60?: string;
  readonly VITE_DISCORD_SKU_GEMS330?: string;
  readonly VITE_DISCORD_SKU_OUTFIT?: string;
  readonly VITE_DISCORD_SB_PREFIX?: string;
  /** '1' lets a release build run the local mock outside Discord (test previews only). */
  readonly VITE_DISCORD_PREVIEW?: string;
}
