-- Parcelwood backend, part 1: account saves (P1) and web orders (P2, used once Stripe is set up).
-- Not applied anywhere yet. Apply with the Supabase CLI (supabase db push) or paste into the SQL editor
-- after the project exists. Guests are Supabase anonymous users, which have the "authenticated" role.

-- ---------- account saves ----------
create table public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade, -- deleting the account deletes the save
  state      jsonb not null,
  version    bigint not null default 1,      -- goes up by one on every upload; stops two devices overwriting each other
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
create policy "players read their own save" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
-- No insert/update policy: players write only through push_save below.

-- Upload a save. Writes only if the cloud copy is still at p_expected (0 = no save yet).
-- Returns the new version, or null when another device uploaded first (the game then re-syncs).
create function public.push_save(p_state jsonb, p_expected bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v   bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if octet_length(p_state::text) > 262144 then raise exception 'save too large'; end if;
  -- Basic shape check. The game checks every field again when it loads a save (src/core/sanitize.ts).
  if jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(p_state->'coins') <> 'number' or jsonb_typeof(p_state->'shards') <> 'number'
     or jsonb_typeof(p_state->'gems') <> 'number' or jsonb_typeof(p_state->'parcels') <> 'array'
     or (p_state->>'v') is distinct from '1'
  then raise exception 'bad save'; end if;
  if p_expected = 0 then
    insert into public.saves (user_id, state, version) values (uid, p_state, 1)
    on conflict (user_id) do nothing
    returning version into v;
  else
    update public.saves set state = p_state, version = version + 1, updated_at = now()
    where user_id = uid and version = p_expected
    returning version into v;
  end if;
  return v;
end;
$$;
revoke all on function public.push_save(jsonb, bigint) from public, anon;
grant execute on function public.push_save(jsonb, bigint) to authenticated;

-- ---------- web orders (P2: Stripe Checkout) ----------
-- Only the Stripe webhook function (service role) inserts rows. Players can read and claim their own.
-- The webhook must take user_id from the Checkout Session that our server created for the signed-in player
-- (client_reference_id set server-side), never from anything the browser sends.
create table public.web_orders (
  id           text primary key,                                        -- Stripe Checkout Session id
  user_id      uuid references auth.users (id) on delete set null,      -- kept after account deletion for tax records
  product      text not null,                                           -- gems60 | gems330 | noads | outfit
  gems         int  not null default 0,
  amount_cents int  not null,
  currency     text not null,
  status       text not null default 'paid' check (status in ('paid', 'refunded')),
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz
);
alter table public.web_orders enable row level security;
create policy "players read their own orders" on public.web_orders
  for select to authenticated using ((select auth.uid()) = user_id);

-- Marks every paid, unclaimed order of the caller as claimed and returns them, in one statement,
-- so an order can be claimed only once even if two devices ask at the same moment.
create function public.claim_web_orders()
returns table (id text, product text, gems int)
language sql
security definer
set search_path = ''
as $$
  update public.web_orders o set claimed_at = now()
  where o.user_id = auth.uid() and o.claimed_at is null and o.status = 'paid'
  returning o.id, o.product, o.gems;
$$;
revoke all on function public.claim_web_orders() from public, anon;
grant execute on function public.claim_web_orders() to authenticated;
