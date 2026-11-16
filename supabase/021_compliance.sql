-- Required training (compliance): one row per person per course per cycle, with the certificate or
-- sign-off that proves it. Every read and write goes through the portal's server, which checks who's
-- asking. Only Ben can read it straight from the database. Records stay after someone leaves.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.training_records (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_client_idx on public.training_records (client_id, created_at desc);
create index if not exists training_person_idx on public.training_records ((data ->> 'personId'));
create index if not exists training_token_idx on public.training_records ((data ->> 'token'));
alter table public.training_records enable row level security;
drop policy if exists training_read on public.training_records;
create policy training_read on public.training_records for select using (public.is_advisor());
drop policy if exists training_write on public.training_records;
create policy training_write on public.training_records for all using (public.is_advisor()) with check (public.is_advisor());
drop trigger if exists training_touch on public.training_records;
create trigger training_touch before update on public.training_records for each row execute function public.touch();
