-- ============================================================
-- WEX STARS — Supabase schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Everything that touches balance / admin rights / promo limits runs through
-- SECURITY DEFINER functions below, NOT direct table updates from the browser —
-- that's what stops a user from editing their own balance via devtools.
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  balance integer not null default 0 check (balance >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

-- users may INSERT their own row once (the username-creation step at signup)
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);

-- NOTE: intentionally no general UPDATE policy for authenticated users.
-- balance and is_admin can only change via the RPC functions below.

-- ---------- promo codes ----------
create table if not exists public.promo_codes (
  code text primary key,
  max_redemptions integer,          -- null = unlimited
  times_redeemed integer not null default 0,
  grants_admin boolean not null default false,
  bonus_balance integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;
-- no client-facing policies at all: codes are only ever read/written inside
-- the SECURITY DEFINER function, so the code list can't be scraped from the browser.

-- seed the admin-panel promo code from the spec: usable twice, total, ever.
insert into public.promo_codes (code, max_redemptions, grants_admin, bonus_balance)
values ('BTPX8Z', 2, true, 0)
on conflict (code) do nothing;

create table if not exists public.promo_redemptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null references public.promo_codes(code),
  redeemed_at timestamptz not null default now(),
  unique (user_id, code)   -- same account can't redeem the same code twice
);
alter table public.promo_redemptions enable row level security;
create policy "redemptions: read own" on public.promo_redemptions
  for select using (auth.uid() = user_id);

-- ---------- withdrawals ----------
create table if not exists public.withdrawals (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount in (15, 25, 50)),
  gift_type text not null check (gift_type in ('mishka', 'serdce')),
  message text,
  target_username text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default now()
);

alter table public.withdrawals enable row level security;

create policy "withdrawals: read own" on public.withdrawals
  for select using (auth.uid() = user_id);

create policy "withdrawals: admins read all" on public.withdrawals
  for select using (public.is_admin());

-- no direct insert/update policies — those go through the RPC functions.

-- ---------- helper: is the current user an admin? ----------
-- SECURITY DEFINER + a fixed search_path so it can read profiles regardless
-- of RLS, without opening a recursive policy loop.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- admins additionally need to see the requester's username in the admin panel join
create policy "profiles: admins read all" on public.profiles
  for select using (public.is_admin());

-- ============================================================
-- RPC: redeem_promo_code(p_code)
-- Atomically checks per-user + global redemption limits, then applies the
-- code's reward (balance bonus and/or permanent admin flag).
-- ============================================================
create or replace function public.redeem_promo_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_code from public.promo_codes where code = upper(p_code) for update;
  if not found then
    raise exception 'not_found';
  end if;

  if exists (select 1 from public.promo_redemptions where user_id = v_uid and code = v_code.code) then
    raise exception 'already_redeemed';
  end if;

  if v_code.max_redemptions is not null and v_code.times_redeemed >= v_code.max_redemptions then
    raise exception 'limit_reached';
  end if;

  insert into public.promo_redemptions (user_id, code) values (v_uid, v_code.code);
  update public.promo_codes set times_redeemed = times_redeemed + 1 where code = v_code.code;

  if v_code.bonus_balance > 0 then
    update public.profiles set balance = balance + v_code.bonus_balance where id = v_uid;
  end if;

  if v_code.grants_admin then
    update public.profiles set is_admin = true where id = v_uid;
  end if;

  return json_build_object('ok', true, 'bonus_balance', v_code.bonus_balance, 'grants_admin', v_code.grants_admin);
end;
$$;

-- ============================================================
-- RPC: create_withdrawal(...)
-- Validates balance + recipient, deducts immediately (held as 'pending'),
-- so the same balance can't be spent twice.
-- ============================================================
create or replace function public.create_withdrawal(
  p_amount integer,
  p_gift_type text,
  p_message text,
  p_target_username text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_withdrawal_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if p_amount not in (15, 25, 50) then
    raise exception 'invalid_amount';
  end if;

  if not exists (select 1 from public.profiles where username = p_target_username) then
    raise exception 'target_not_found';
  end if;

  select balance into v_balance from public.profiles where id = v_uid for update;
  if v_balance < p_amount then
    raise exception 'insufficient_balance';
  end if;

  update public.profiles set balance = balance - p_amount where id = v_uid;

  insert into public.withdrawals (user_id, amount, gift_type, message, target_username)
  values (v_uid, p_amount, p_gift_type, nullif(p_message, ''), p_target_username)
  returning id into v_withdrawal_id;

  return json_build_object('ok', true, 'withdrawal_id', v_withdrawal_id);
end;
$$;

-- ============================================================
-- RPC: admin_confirm_withdrawal(p_withdrawal_id)
-- Only callable by an admin account (checked via is_admin()).
-- ============================================================
create or replace function public.admin_confirm_withdrawal(p_withdrawal_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  update public.withdrawals
  set status = 'confirmed'
  where id = p_withdrawal_id and status = 'pending';

  if not found then
    raise exception 'not_found_or_already_confirmed';
  end if;

  return json_build_object('ok', true);
end;
$$;

-- allow authenticated users to call the RPCs (RLS/logic inside still applies)
grant execute on function public.redeem_promo_code(text) to authenticated;
grant execute on function public.create_withdrawal(integer, text, text, text) to authenticated;
grant execute on function public.admin_confirm_withdrawal(bigint) to authenticated;
grant execute on function public.is_admin() to authenticated;
