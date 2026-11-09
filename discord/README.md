# Parcelwood on Discord (Activity build)

The same game as the web build, packaged as a Discord Activity. Plan: https://claude.ai/artifact/E61zqDF3HtWW6gSUuy3iEP

Status (2026-10-31): code written and tested with a local mock of Discord and of the server. Nothing is deployed,
no Discord application exists yet, and the Supabase project is not set up.

Town levels and the town content (requests, urgent and unnamed parcels, daily events, gifts) are shared with the
web build. Rush Hour is web-only and has no entry in the Discord build.

## Run and build

After the shared changes in `SHARED-CHANGES.md` are in (they add the SDK and the scripts):

```
npm run dev:discord        # local mock: no Discord, no server; free instant purchases; ?mobile shows the phone view
npm run build:discord      # -> discord/dist/（不含 sw.js / manifest.webmanifest）
npm run check:release      # 构建完跑一遍：确认没有网页版专属的 Rush Hour / Station Week
npm test                   # includes tests/discord/
```

Before that: `npm install --no-save @discord/embedded-app-sdk@2.5.0`, then
`npx tsc -p discord/tsconfig.json && npx vite build --config discord/vite.config.ts`.

## How it fits together

- `discord/main.ts` entry. Inside Discord (URL has `frame_id`) with settings: real SDK. A release build opened
  outside Discord only says "play in Discord"; one inside Discord without settings refuses to start.
- `src/discord/auth.ts` sign-in: `authorize` (scope `identify`) -> `discord-auth` function -> Supabase session ->
  `authenticate`. The age screen comes first; nothing signs in before it is passed. Under 13: blocked, nothing stored.
- `src/discord/store.ts` shop: `startPurchase` (desktop app and browser only) -> `discord-claim` reads purchases
  from Discord with the bot token and records each once -> `claim_discord_orders()` hands each order to exactly
  one device -> the order waits in a per-player inbox on that device until the game has added it and saved.
  Gems are added only when the device save is synced with the signed-in account.
- Saves: the web build's `saves` table and code, unchanged.
- `supabase/migrations/0002_discord.sql`: `discord_accounts`, `discord_orders`, `record_discord_order`, `claim_discord_orders`.
- First-purchase double gems: counted per Discord account, real purchases only (test-mode purchases never count).
- No ads, so "remove ads" is not sold. Prices match the web: 60 gems $0.99, 330 gems $4.99, uniform $1.99.
- No web fonts (only mapped addresses load inside Discord); system fonts are used.

## Settings

Build (`discord/.env.local`, or Vercel env vars): see `discord/.env.example`. None is secret.

Server (Supabase function secrets, set in the Supabase dashboard, never in the page or in chat):
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`,
`DISCORD_SKU_GEMS60`, `DISCORD_SKU_GEMS330`, `DISCORD_SKU_OUTFIT`, `ALLOWED_ORIGIN` (`https://<client id>.discordsays.com`),
`DISCORD_PUBLIC_KEY` (Developer Portal > General Information; used by `discord-webhook` to check Discord's signature).
Test project only: `ALLOW_TEST_PURCHASES=true` (Discord's test-mode purchases add gems). Never on the live project.

Supabase Auth settings (live project): turn off password sign-up if the web game does not use passwords.
Discord accounts use a random placeholder address and are found only through `discord_accounts`, so this is
extra protection, not required.

## Still to verify on the real services

1. Plan D2: hosted Supabase accepts the placeholder address and `generateLink` + `verifyOtp` returns a session.
2. Entitlement endpoints accept the bot token (`Authorization: Bot ...`).
3. The Activity opens with `discord/vercel.json`'s `frame-ancestors` on desktop, browser and phone.
4. Whether Discord's `ENTITLEMENT_CREATE` event fires (the SDK docs call it "coming soon"); the game does not depend on it.
5. The `/sb` URL mapping is reached at `/sb/...` (current Discord docs: "make requests to `/api`"). The SDK's
   README still shows the older `/.proxy/api/...` form. If `/sb/...` returns the game's 404 page, set
   `VITE_DISCORD_SB_PREFIX=/.proxy/sb`.

## Before taking real money

- Server gem balance and refunds: `supabase/migrations/0003_wallet_and_refunds.sql` and the `discord-webhook` function.
  Live project (2026-11-02): 0003 applied; `discord-claim` v5 and `discord-webhook` v1 deployed (verify_jwt off).
  Still to do by the owner:
  1. Set the `DISCORD_PUBLIC_KEY` secret (until then `discord-webhook` answers 500 to everything).
  2. In Developer Portal > Webhooks, set the endpoint to `https://muzxulfegdezzomfpplt.supabase.co/functions/v1/discord-webhook`,
     turn on events and subscribe to Entitlement Delete. Discord checks the endpoint with a signed PING when saved.
- How it works: the server keeps the balance (`wallets`, one `gem_ledger` row per change). An order adds its gems when it
  is recorded; a refund takes them back, even if a device already claimed it. `push_save` stores the server balance,
  not the uploaded number. After each claim the game shows the server balance, which also fixes the save-conflict
  case where gems delivered to the discarded save were lost.
- Still to check on the real services: whether Discord sends `ENTITLEMENT_DELETE` for a refunded one-time (consumable)
  purchase, and whether the entitlements list returns it as `deleted` after it was consumed. Discord's docs only spell
  this out for subscriptions. Test with a test-mode purchase, then delete the entitlement in the Developer Portal.
- Privacy policy: Discord ids stay in `discord_orders` after account deletion (purchase records).

## Discord's rule on gambling-like content

Discord's app rules do not allow gambling-like features. What is sold here is fixed: 60 or 330 gems, or the
uniform. No paid item is a random box. The distance from the rule: gems are spent in the game on
"10 extra parcels", and parcels are blind boxes (published odds), so real money reaches randomness one step
removed. Ways to close it if Discord asks: in the Discord build, sell extra parcels for coins only, or make the
paid extra parcels show their contents before opening. Tao decides.

Decision (Tao, 2026-10-31): keep the current design in the Discord build. Extra parcels stay buyable with gems,
and Discord support is not asked first. If Discord's review rejects it, the two options above are the fallback.

## Deployment (2026-10-31)

- Repo: GitHub `DogcanAmee/parcelwood` (root = `game-design/app`). Vercel project `parcelwood-discord`
  (team (owner's Vercel team)'s projects), Root Directory `discord`.
- Env (plain, not secret): `VITE_DISCORD_CLIENT_ID` and `VITE_DISCORD_SB_PREFIX=/sb` on Production and Preview;
  `VITE_DISCORD_PREVIEW=1` on Preview for branch `discord-test` only.
- Branch `discord-test` = test build without Supabase (local mock: saves on the device, no Discord sign-in,
  pretend shop). Discord URL mapping `/` points at its branch address while testing.
- Production (`main`) has no Supabase key yet, so inside Discord it shows the "not set up" screen until the
  Supabase project exists (free plan has no room: flowood and asiaus-prod use both slots).

### Production backend (2026-10-31)
- Supabase project `parcelwood` (ref muzxulfegdezzomfpplt, us-east-1, org HubGoodFood's Org, Pro, Micro). Migrations 0001 + 0002 applied.
- Functions delete-account, discord-auth, discord-claim deployed with verify_jwt off (each checks the session in code; the platform JWT check does not accept sb_publishable_ keys). They read SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS and fall back to the legacy keys.
- Vercel production (branch main) has VITE_SUPABASE_PUBLISHABLE_KEY. Discord URL mapping `/sb` -> muzxulfegdezzomfpplt.supabase.co.
- Root mapping `/` still points at the discord-test preview until the function secrets are set; then switch it to parcelwood-discord.vercel.app.
- Secrets (set by the owner in Supabase > Edge Functions > Secrets): DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, ALLOWED_ORIGIN=https://1566183042773553203.discordsays.com. SKU ids later. Never ALLOW_TEST_PURCHASES on this project.
