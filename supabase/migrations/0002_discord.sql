-- Parcelwood backend, part 2: the Discord Activity build. Not applied anywhere yet; apply after 0001.
-- Discord players are normal Supabase users made by the discord-auth function, so saves use public.saves as-is.

-- ---------- which game account belongs to which Discord account ----------
create table public.discord_accounts (
  discord_id text primary key check (discord_id ~ '^[0-9]{5,25}$'),
  user_id    uuid not null unique references auth.users (id) on delete cascade, -- deleting the account frees the Discord id
  created_at timestamptz not null default now()
);
alter table public.discord_accounts enable row level security;
create policy "players read their own discord link" on public.discord_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
-- No insert/update policy: only the discord-auth function (service role) writes here.

-- ---------- Discord purchases ----------
-- One row per Discord entitlement. The id is Discord's entitlement id, so a purchase can be recorded only once.
-- Only the discord-claim function (service role) inserts, through record_discord_order below.
create table public.discord_orders (
  id              text primary key check (id ~ '^[0-9]{5,25}$'),
  user_id         uuid references auth.users (id) on delete set null,   -- kept after account deletion for records
  discord_user_id text not null,
  product         text not null check (product in ('gems60', 'gems330', 'outfit')),
  sku_id          text not null,
  gems            int  not null check (gems >= 0),
  first_bonus     boolean not null default false,
  list_cents      int  not null,             -- list price in US cents; Discord does not report what was charged
  test            boolean not null default false, -- bought in Discord's application test mode (no real money)
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz                -- set when a device takes the order to add it to the game
);
create index discord_orders_discord_user on public.discord_orders (discord_user_id, product);
create index discord_orders_user_unclaimed on public.discord_orders (user_id) where claimed_at is null;
alter table public.discord_orders enable row level security;
create policy "players read their own discord orders" on public.discord_orders
  for select to authenticated using ((select auth.uid()) = user_id);

-- Records one purchase. Returns the gems it is worth (existing row: its stored value, never recomputed).
-- The first real (not test-mode) purchase of each gem pack by this Discord account is doubled. Counted by Discord
-- account, not game account, so deleting the game account and starting again does not give the bonus twice.
-- The lock stops two claims running at the same moment from both counting as "first".
create function public.record_discord_order(
  p_id text, p_user uuid, p_discord_user text, p_product text, p_sku text, p_base_gems int, p_list_cents int, p_test boolean
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing int;
  first boolean;
  g int;
begin
  perform pg_advisory_xact_lock(hashtextextended('discord:' || p_discord_user, 0));
  select gems into existing from public.discord_orders where id = p_id;
  if found then return existing; end if;
  first := p_product in ('gems60', 'gems330') and not p_test and not exists (
    select 1 from public.discord_orders
    where discord_user_id = p_discord_user and product = p_product and not test
  );
  g := case when first then p_base_gems * 2 else p_base_gems end;
  insert into public.discord_orders (id, user_id, discord_user_id, product, sku_id, gems, first_bonus, list_cents, test)
  values (p_id, p_user, p_discord_user, p_product, p_sku, g, first, p_list_cents, p_test);
  return g;
end;
$$;
revoke all on function public.record_discord_order(text, uuid, text, text, text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.record_discord_order(text, uuid, text, text, text, int, int, boolean) to service_role;

-- The game calls this to take its new orders: marks every unclaimed order of the caller as claimed and returns
-- them, in one statement, so two devices asking at the same moment cannot both get the same order
-- (same pattern as claim_web_orders in 0001).
create function public.claim_discord_orders()
returns table (id text, product text, gems int)
language sql
security definer
set search_path = ''
as $$
  update public.discord_orders o set claimed_at = now()
  where o.user_id = auth.uid() and o.claimed_at is null
  returning o.id, o.product, o.gems;
$$;
revoke all on function public.claim_discord_orders() from public, anon;
grant execute on function public.claim_discord_orders() to authenticated;
