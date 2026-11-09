-- Parcelwood backend, part 5: Discord social (docs/design-v2.md, step 3).
--
-- Carry parcels: a player who finished all three of today's letters can carry one parcel to a friend. The
-- client asks for a random token (carry_send), shares an Activity link carrying it (Discord shareLink
-- custom_id), and the friend redeems it once (carry_claim). The sender's thank-you reward is paid from the
-- server's count (carry_thanks), so neither side can claim twice.
--
-- Server board: players of the same Discord server add their finished letters to one weekly total
-- (guild_board_add) and read it back (guild_board_get). Each player counts at most 21 letters a week
-- (3 a day), so one account cannot fill a server's board alone. The guild id comes from the client;
-- a fake id only lets a player fill a board nobody else reads.
--
-- Tables are closed to clients (RLS on, no grants); only these functions touch them.

-- ---------- carry parcels ----------
create table public.carry_parcels (
  token      text primary key,
  sender     uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  thanked    boolean not null default false
);
create index carry_parcels_sender on public.carry_parcels (sender, created_at desc);
create index carry_parcels_claimer on public.carry_parcels (claimed_by, claimed_at desc);
alter table public.carry_parcels enable row level security;
revoke all on table public.carry_parcels from public, anon, authenticated;

-- A new token. At most 3 a day, so cancelled share windows can be retried but tokens cannot be farmed.
create function public.carry_send()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t   text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.carry_parcels c where c.sender = uid and c.created_at > now() - interval '1 day') >= 3 then
    raise exception 'carry limit';
  end if;
  insert into public.carry_parcels as c (token, sender)
  values (replace(gen_random_uuid()::text, '-', ''), uid)
  returning c.token into t;
  return t;
end;
$$;

-- 'ok' the first time a friend opens it; 'own' for the sender; 'gone' when used, unknown or too old (14 days),
-- or when this player already took 3 carried parcels today.
create function public.carry_claim(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  row public.carry_parcels%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return 'gone'; end if;
  select * into row from public.carry_parcels c where c.token = p_token for update;
  if not found or row.claimed_by is not null or row.created_at < now() - interval '14 days' then return 'gone'; end if;
  if row.sender = uid then return 'own'; end if;
  if (select count(*) from public.carry_parcels c where c.claimed_by = uid and c.claimed_at > now() - interval '1 day') >= 3 then
    return 'gone';
  end if;
  update public.carry_parcels c set claimed_by = uid, claimed_at = now() where c.token = p_token;
  return 'ok';
end;
$$;

-- How many of my carried parcels friends have opened since I last asked. Each is counted once.
create function public.carry_thanks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  with done as (
    update public.carry_parcels c set thanked = true
    where c.sender = uid and c.claimed_by is not null and not c.thanked
    returning 1
  ) select count(*) into n from done;
  return n;
end;
$$;

-- ---------- server board ----------
create table public.guild_board (
  guild_id text not null check (guild_id ~ '^[0-9]{5,25}$'),
  week     date not null,
  user_id  uuid not null references auth.users (id) on delete cascade,
  letters  int not null default 0 check (letters between 0 and 21),
  primary key (guild_id, week, user_id)
);
alter table public.guild_board enable row level security;
revoke all on table public.guild_board from public, anon, authenticated;

-- Adds finished letters to this week's total (week = the Monday the client shows, within a day of the server's).
create function public.guild_board_add(p_guild text, p_week date, p_n int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_guild is null or p_guild !~ '^[0-9]{5,25}$' then raise exception 'bad guild'; end if;
  if p_n is null or p_n < 1 or p_n > 3 then raise exception 'bad count'; end if;
  if p_week is null or extract(isodow from p_week) <> 1 or abs(p_week - (current_date - (extract(isodow from current_date)::int - 1))) > 7 then
    raise exception 'bad week';
  end if;
  insert into public.guild_board as g (guild_id, week, user_id, letters)
  values (p_guild, p_week, uid, least(p_n, 21))
  on conflict (guild_id, week, user_id) do update set letters = least(g.letters + excluded.letters, 21);
end;
$$;

-- This week's total, how many players helped, and my own share.
create function public.guild_board_get(p_guild text, p_week date)
returns table (total int, players int, mine int)
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(sum(g.letters), 0)::int,
         count(*)::int,
         coalesce(sum(g.letters) filter (where g.user_id = auth.uid()), 0)::int
  from public.guild_board g
  where auth.uid() is not null and g.guild_id = p_guild and g.week = p_week;
$$;

revoke all on function public.carry_send(), public.carry_claim(text), public.carry_thanks(),
  public.guild_board_add(text, date, int), public.guild_board_get(text, date) from public, anon;
grant execute on function public.carry_send(), public.carry_claim(text), public.carry_thanks(),
  public.guild_board_add(text, date, int), public.guild_board_get(text, date) to authenticated;
