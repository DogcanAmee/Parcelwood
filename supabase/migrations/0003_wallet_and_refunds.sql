-- Parcelwood backend, part 3: the server keeps each player's gem balance, and refunds take gems back.
-- Apply after 0001 and 0002.
--
-- Before this, gems lived only in the save, and push_save accepted any gem count a player uploaded.
-- Now:
--   * public.wallets is the balance. Only the server changes it, and every change is one row in public.gem_ledger.
--   * A paid order adds its gems when the order row is written (trigger), whether or not a device has claimed it yet.
--   * A refund takes the order's gems back (trigger on refunded_at / status). The balance may go below zero;
--     the save and the game then show 0, and spend_gems refuses until later purchases cover it.
--   * push_save writes the server balance into every uploaded save, so an edited gem count is never stored.
--   * spend_gems is the only way to spend gems (for "10 extra parcels" once it is sold).
-- Each ledger row has a unique (reason, ref), so the same order, refund or spend can never count twice.

-- ---------- balance and ledger ----------
create table public.wallets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  gems       int not null default 0,          -- may be negative after a refund of gems already spent
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
create policy "players read their own wallet" on public.wallets
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.gem_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null, -- kept after account deletion for records
  delta      int  not null check (delta <> 0),
  reason     text not null check (reason in ('order', 'refund', 'spend')),
  ref        text not null,                   -- order: 'discord:<id>' / 'web:<id>'; spend: '<user id>:<client ref>'
  created_at timestamptz not null default now(),
  unique (reason, ref)
);
create index gem_ledger_user on public.gem_ledger (user_id, created_at);
alter table public.gem_ledger enable row level security;
create policy "players read their own gem history" on public.gem_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

-- Adds one ledger row and moves the balance by delta. Returns false (and changes nothing) if a row with the same
-- reason and ref already exists. Internal: only the triggers and functions below call it.
create function public.wallet_apply(p_user uuid, p_delta int, p_reason text, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_delta = 0 then return false; end if;
  insert into public.gem_ledger (user_id, delta, reason, ref) values (p_user, p_delta, p_reason, p_ref)
  on conflict (reason, ref) do nothing;
  if not found then return false; end if;
  insert into public.wallets as w (user_id, gems) values (p_user, p_delta)
  on conflict (user_id) do update set gems = w.gems + excluded.gems, updated_at = now();
  return true;
end;
$$;
revoke all on function public.wallet_apply(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.wallet_apply(uuid, int, text, text) to service_role;

-- ---------- refunds on orders ----------
alter table public.discord_orders add column refunded_at timestamptz;
alter table public.web_orders add column refunded_at timestamptz;

-- Order rows credit and debit the wallet themselves, so every way of writing an order (record_discord_order,
-- the future Stripe webhook) and every way of refunding one (refund_order, a manual SQL fix) stays in step.
create function public.order_wallet_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  src text := case when tg_table_name = 'discord_orders' then 'discord' else 'web' end;
  was_refunded boolean := tg_op = 'UPDATE' and old.refunded_at is not null;
  now_refunded boolean := new.refunded_at is not null;
begin
  if tg_op = 'INSERT' and not now_refunded then
    perform public.wallet_apply(new.user_id, new.gems, 'order', src || ':' || new.id);
  elsif now_refunded and not was_refunded then
    -- Take back only what this order actually added (none if it was written already refunded,
    -- or its account was deleted before the order was recorded).
    if exists (select 1 from public.gem_ledger where reason = 'order' and ref = src || ':' || new.id) then
      perform public.wallet_apply(new.user_id, -new.gems, 'refund', src || ':' || new.id);
    end if;
  elsif was_refunded and not now_refunded then
    raise exception 'a refunded order cannot be un-refunded';
  end if;
  return new;
end;
$$;
revoke all on function public.order_wallet_sync() from public, anon, authenticated;

create trigger discord_orders_wallet after insert or update of refunded_at on public.discord_orders
  for each row execute function public.order_wallet_sync();

-- web_orders already has status ('paid' | 'refunded'); keep refunded_at and status the same.
create function public.web_order_status_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'refunded' and new.refunded_at is null then new.refunded_at := now(); end if;
  if new.refunded_at is not null then new.status := 'refunded'; end if;
  return new;
end;
$$;
create trigger web_orders_status before insert or update of status, refunded_at on public.web_orders
  for each row execute function public.web_order_status_sync();
create trigger web_orders_wallet after insert or update of status, refunded_at on public.web_orders
  for each row execute function public.order_wallet_sync();

-- Marks one order refunded. Called by the discord-webhook and discord-claim functions (and later the Stripe
-- webhook). Returns the gems taken back, 0 if it was already refunded or added nothing, null if there is no such order.
create function public.refund_order(p_source text, p_id text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  g int;
begin
  if p_source = 'discord' then
    update public.discord_orders set refunded_at = now() where id = p_id and refunded_at is null returning user_id, gems into uid, g;
    if not found then
      return case when exists (select 1 from public.discord_orders where id = p_id) then 0 else null end;
    end if;
  elsif p_source = 'web' then
    update public.web_orders set refunded_at = now() where id = p_id and refunded_at is null returning user_id, gems into uid, g;
    if not found then
      return case when exists (select 1 from public.web_orders where id = p_id) then 0 else null end;
    end if;
  else
    raise exception 'unknown order source';
  end if;
  return case when exists (select 1 from public.gem_ledger where reason = 'refund' and ref = p_source || ':' || p_id) then g else 0 end;
end;
$$;
revoke all on function public.refund_order(text, text) from public, anon, authenticated;
grant execute on function public.refund_order(text, text) to service_role;

-- Refunded orders are never handed to a device. An order claimed before its refund keeps its claim;
-- the wallet still takes the gems back, and the game shows the server balance on its next sync.
create or replace function public.claim_discord_orders()
returns table (id text, product text, gems int)
language sql
security definer
set search_path = ''
as $$
  update public.discord_orders o set claimed_at = now()
  where o.user_id = auth.uid() and o.claimed_at is null and o.refunded_at is null
  returning o.id, o.product, o.gems;
$$;

-- ---------- the game's side ----------
-- The caller's balance as the game shows it (never below 0).
create function public.wallet_gems()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(coalesce((select w.gems from public.wallets w where w.user_id = auth.uid()), 0), 0);
$$;
revoke all on function public.wallet_gems() from public, anon;
grant execute on function public.wallet_gems() to authenticated;

-- Spends gems. p_ref is the game's id for this spend: retrying with the same ref never spends twice.
-- Returns the balance after spending, or null when the balance is too low (nothing is spent).
create function public.spend_gems(p_amount int, p_ref text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  bal int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'bad amount'; end if;
  if p_ref is null or p_ref !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'bad ref'; end if;
  insert into public.wallets (user_id) values (uid) on conflict (user_id) do nothing;
  select gems into bal from public.wallets where user_id = uid for update;  -- one spend at a time per player
  if exists (select 1 from public.gem_ledger where reason = 'spend' and ref = uid::text || ':' || p_ref) then
    return greatest(bal, 0);                                                -- already spent: same answer again
  end if;
  if bal < p_amount then return null; end if;
  perform public.wallet_apply(uid, -p_amount, 'spend', uid::text || ':' || p_ref);
  return bal - p_amount;
end;
$$;
revoke all on function public.spend_gems(int, text) from public, anon;
grant execute on function public.spend_gems(int, text) to authenticated;

-- Same checks as 0001, then the server balance replaces whatever gem count the device sent.
create or replace function public.push_save(p_state jsonb, p_expected bigint)
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
  if jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(p_state->'coins') <> 'number' or jsonb_typeof(p_state->'shards') <> 'number'
     or jsonb_typeof(p_state->'gems') <> 'number' or jsonb_typeof(p_state->'parcels') <> 'array'
     or (p_state->>'v') is distinct from '1'
  then raise exception 'bad save'; end if;
  p_state := jsonb_set(p_state, '{gems}', to_jsonb(greatest(coalesce((select w.gems from public.wallets w where w.user_id = uid), 0), 0)));
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

-- ---------- existing data ----------
-- Orders written before this migration count once; the gem numbers already in saves are not trusted.
insert into public.gem_ledger (user_id, delta, reason, ref)
select user_id, gems, 'order', 'discord:' || id from public.discord_orders where user_id is not null and gems > 0
union all
select user_id, gems, 'order', 'web:' || id from public.web_orders where user_id is not null and gems > 0 and status = 'paid'
on conflict (reason, ref) do nothing;
insert into public.wallets (user_id, gems)
select user_id, sum(delta)::int from public.gem_ledger where user_id is not null group by user_id
on conflict (user_id) do update set gems = excluded.gems, updated_at = now();
update public.saves s
set state = jsonb_set(s.state, '{gems}', to_jsonb(greatest(coalesce((select w.gems from public.wallets w where w.user_id = s.user_id), 0), 0)))
where (s.state->'gems') is distinct from to_jsonb(greatest(coalesce((select w.gems from public.wallets w where w.user_id = s.user_id), 0), 0));
