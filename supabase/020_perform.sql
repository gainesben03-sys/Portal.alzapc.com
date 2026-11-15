-- Alza Perform: performance reviews and improvement plans. One row per review.
-- Reviews are sensitive, so the browser never reads this table directly: every read and write goes
-- through the portal's server, which checks who's asking (the person's manager, the review admins
-- picked in settings, or Ben). Only Ben can read it straight from the database.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.perform_reviews (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists perform_client_idx on public.perform_reviews (client_id, created_at desc);
create index if not exists perform_person_idx on public.perform_reviews ((data ->> 'personId'));
create index if not exists perform_self_idx on public.perform_reviews ((data -> 'self' ->> 'token'));
create index if not exists perform_share_idx on public.perform_reviews ((data -> 'share' ->> 'token'));
alter table public.perform_reviews enable row level security;
drop policy if exists perform_read on public.perform_reviews;
create policy perform_read on public.perform_reviews for select using (public.is_advisor());
drop policy if exists perform_write on public.perform_reviews;
create policy perform_write on public.perform_reviews for all using (public.is_advisor()) with check (public.is_advisor());
drop trigger if exists perform_touch on public.perform_reviews;
create trigger perform_touch before update on public.perform_reviews for each row execute function public.touch();
