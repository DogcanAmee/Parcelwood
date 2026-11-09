# Discord build: changes needed in shared files

The Discord build only adds files of its own (`src/discord/`, `discord/`, `tests/discord/`,
`supabase/functions/discord-*`, `supabase/migrations/0002_discord.sql`). Four shared files need small changes,
which belong to whoever owns them. They are in `discord/shared.patch` (made against the 2026-10-31 versions,
applies with `patch -p1 < discord/shared.patch` from `game-design/app`).

| File | Change | Why |
|---|---|---|
| `package.json` | add dependency `@discord/embedded-app-sdk` `^2.5.0`; scripts `dev:discord`, `typecheck:discord`, `build:discord` | Discord SDK for `discord/main.ts`. The web build never imports it. |
| `src/ui/app.ts` | if `backend.store` exists: shop lists the Discord products with Discord prices, buy buttons call `store.buy`, phone shows "buy on a computer"; a `grant()` adds delivered gems and saves, and refuses (the order waits) until the device save is synced with the signed-in account; claims run in the save-sync queue after sign-in, after an account change and after a save conflict is settled. If `auth.provider === 'discord'`: account page shows the Discord name, no email / Apple / Google / sign-out, keeps "delete account". | No change for builds without `backend.store` (web, CrazyGames). |
| `src/i18n/strings.ts` | merge `DISCORD_UI` from `src/discord/strings.ts`, the same way `ACCOUNT_UI` is merged | Shop and account text in en / zh / es. |
| `tests/discord/shop.discord.test.ts` (new) | UI test for the above | Only passes with the `app.ts` change, so it ships with it. |

Without these changes the Discord build still builds and runs (sign-in, cloud saves), but the shop shows
"coming soon" like the web build and the account page shows an empty "Signed in as".

Checked with the patch applied to a fresh copy of today's shared files: `tsc`, `tsc -p discord/tsconfig.json`,
`vitest run` (107 tests), web build and Discord build. Without the patch (and without the SDK installed): `tsc`,
`vitest run` (102 tests) and the web build pass.

Suggested later (not in the patch, shared code): keep delivered purchase order ids in the save state, so a save
conflict resolved to the other device's copy cannot drop delivered gems. Same gap exists for web purchases.

If the shop or account page has changed by the time this is applied (for example rewarded ads for CrazyGames),
keep the same hooks: shop asks `backend.store` when present; account page checks `auth.provider === 'discord'`.

## Status (2026-10-31, later)

`shared.patch` has been applied by the CrazyGames thread (137 tests, three builds). Afterwards the Discord text was
moved out of the shared merge: `src/i18n/strings.ts` no longer imports `src/discord/strings.ts`;
`createDiscordBackend()` adds `DISCORD_UI` itself (`installDiscordStrings()`), so only the Discord build carries
that text. `shared.patch` is kept as a record; do not apply it again.
