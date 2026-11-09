/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** '1' turns on the developer panel in a build. Test previews only. */
  readonly VITE_DEVTOOLS?: string;
  /** '1' = CrazyGames preview build with pretend ads and no SDK (build:crazygames:preview). Never upload it. */
  readonly VITE_CG_MOCK_ADS?: string;
  /**
   * Optional AdSense publisher id for the web build (for example `ca-pub-1234567890123456`).
   * M1 always loads the tag with `data-adbreak-test="on"`. With no id, a local test ad is shown.
   */
  readonly VITE_ADSENSE_CLIENT?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

/** Replaced at build time: true for the web build, false for the CrazyGames and Discord builds. */
declare const __WEB_BUILD__: boolean;
