-- AlzaHR Client Portal: push notifications (phone and computer alerts).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Only the server reads and writes these (service key). People manage their own
-- devices and choices through the portal.

create table if not exists public.push_subs (
  endpoint text primary key,           -- one row per device/browser
  email text not null,
  sub jsonb not null,
  agent text,
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
create index if not exists push_subs_email_idx on public.push_subs (lower(email));

create table if not exists public.push_prefs (
  email text primary key,              -- lower-case
  topics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_subs enable row level security;
alter table public.push_prefs enable row level security;
drop policy if exists push_subs_own on public.push_subs;
create policy push_subs_own on public.push_subs for select using (lower(email) = lower(public.me_email()));
drop policy if exists push_prefs_own on public.push_prefs;
create policy push_prefs_own on public.push_prefs for select using (lower(email) = lower(public.me_email()));
