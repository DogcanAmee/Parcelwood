-- Parcelwood backend, part 4: a guest's gem balance follows the player into a full account.
--
-- 0003 made the server wallet the only truth. A guest who buys gems and then signs in to an account that
-- already exists gets a new user id, so the old wallet would be left behind. The client asks the guest
-- account for a one-time ticket (issue_guest_ticket) before it switches accounts, keeps it on the device,
-- and the signed-in account redeems it (claim_guest_ticket). Only the server moves gems; the save's own
-- gem count is never trusted.
--
-- The ticket is a random 122-bit token, so it cannot be guessed. Redeeming it twice does nothing extra,
-- and a ticket whose guest account later became a full account in place (manual linking keeps the id)
-- is not redeemable: its wallet is already the player's.

-- ---------- ledger reasons for the move ----------
alter table public.gem_ledger drop constraint gem_ledger_reason_check;
alter table public.gem_ledger add constraint gem_ledger_reason_check
  check (reason in ('order', 'refund', 'spend', 'guest-merge', 'guest-merge-out'));

-- ---------- one-time tickets ----------
create table public.guest_tickets (
  token      text primary key,
  guest      uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  used_by    uuid references auth.users (id) on delete set null
);
create index guest_tickets_open on public.guest_tickets (guest) where used_at is null;
alter table public.guest_tickets enable row level security;
revoke all on table public.guest_tickets from public, anon, authenticated;

-- ---------- guest side: mint or reuse a ticket ----------
-- Only a guest account can ask. Asking again before redeeming returns the same ticket, so a reload or a
-- second sign-in attempt does not leave several live tickets behind.
create function public.issue_guest_ticket()
returns table (token text, gems int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  guest boolean;
  t   text;
  bal int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select coalesce(u.is_anonymous, false) into guest from auth.users u where u.id = uid;
  if not coalesce(guest, false) then raise exception 'not a guest account'; end if;
  select g.token into t from public.guest_tickets g
    where g.guest = uid and g.used_at is null and g.expires_at > now()
    order by g.created_at desc limit 1;
  if t is null then
    insert into public.guest_tickets as g (token, guest)
    values (replace(gen_random_uuid()::text, '-', ''), uid)
    returning g.token into t;
  end if;
  select greatest(coalesce((select w.gems from public.wallets w where w.user_id = uid), 0), 0) into bal;
  return query select t, bal;
end;
$$;
revoke all on function public.issue_guest_ticket() from public, anon;
grant execute on function public.issue_guest_ticket() to authenticated;

-- ---------- account side: redeem it ----------
-- Returns the caller's balance after the move. A ticket that is already used returns the balance unchanged,
-- so a retried request is safe. Expired, unknown and non-guest tickets are refused without touching gems.
create function public.claim_guest_ticket(p_token text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t   public.guest_tickets%rowtype;
  guest boolean;
  bal int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'bad ticket'; end if;
  select * into t from public.guest_tickets g where g.token = p_token for update;
  if not found then raise exception 'bad ticket'; end if;
  if t.used_at is not null then return public.wallet_gems(); end if;
  if t.expires_at <= now() then raise exception 'ticket expired'; end if;
  if t.guest = uid then raise exception 'same account'; end if;
  select coalesce(u.is_anonymous, false) into guest from auth.users u where u.id = t.guest;
  if not coalesce(guest, false) then raise exception 'not a guest account'; end if;
  select coalesce((select w.gems from public.wallets w where w.user_id = t.guest), 0) into bal;
  if bal <> 0 then
    perform public.wallet_apply(t.guest, -bal, 'guest-merge-out', 'account:' || uid::text);
    perform public.wallet_apply(uid, bal, 'guest-merge', 'guest:' || t.guest::text);
  end if;
  update public.guest_tickets set used_at = now(), used_by = uid where token = p_token;
  return public.wallet_gems();
end;
$$;
revoke all on function public.claim_guest_ticket(text) from public, anon;
grant execute on function public.claim_guest_ticket(text) to authenticated;
