-- Row Level Security for Pic Your AI
-- Run this in the Supabase SQL editor. Safe to re-run — uses DROP IF EXISTS before each CREATE.
-- The app always uses SUPABASE_SERVICE_ROLE_KEY server-side, which bypasses RLS.
-- These policies protect direct Supabase API calls (e.g. anyone who gets the anon key).

-- Enable RLS on all tables (idempotent)
alter table users         enable row level security;
alter table credits       enable row level security;
alter table subscriptions enable row level security;
alter table jobs          enable row level security;
alter table transactions  enable row level security;

-- ── users ────────────────────────────────────────────────────────────────────
drop policy if exists "users can read own profile"   on users;
drop policy if exists "users can insert own profile" on users;
drop policy if exists "users can update own profile" on users;

create policy "users can read own profile"
on users for select
using (auth.uid() = auth_user_id);

-- No INSERT/UPDATE/DELETE policies → only the service role can write

-- ── credits ──────────────────────────────────────────────────────────────────
drop policy if exists "users can read own credits" on credits;

create policy "users can read own credits"
on credits for select
using (
  user_id in (select id from users where auth_user_id = auth.uid())
);

-- ── subscriptions ─────────────────────────────────────────────────────────────
drop policy if exists "users can read own subscriptions" on subscriptions;

create policy "users can read own subscriptions"
on subscriptions for select
using (
  user_id in (select id from users where auth_user_id = auth.uid())
);

-- ── jobs ─────────────────────────────────────────────────────────────────────
drop policy if exists "users can read own jobs" on jobs;

create policy "users can read own jobs"
on jobs for select
using (
  user_id in (select id from users where auth_user_id = auth.uid())
);

-- ── transactions ─────────────────────────────────────────────────────────────
drop policy if exists "users can read own transactions" on transactions;

create policy "users can read own transactions"
on transactions for select
using (
  user_id in (select id from users where auth_user_id = auth.uid())
);
