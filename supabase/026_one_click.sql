-- One-click links in review emails: each link works once. This table remembers which were used.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- Until it's run, links still work but can be used more than once before they expire.
create table if not exists public.link_uses (
  id text primary key,
  email text not null,
  used_at timestamptz not null default now()
);
alter table public.link_uses enable row level security;
drop policy if exists link_uses_all on public.link_uses;
create policy link_uses_all on public.link_uses for all using (public.is_advisor()) with check (public.is_advisor());
