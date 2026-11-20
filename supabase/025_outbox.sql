-- Outbox: emails waiting for approval before they go out, and Ben's notes saved for one daily summary.
-- The portal reads and writes these through the server, which checks who's asking; the table itself is Ben-only.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run more than once.

create table if not exists public.outbox (
  id text primary key,
  client_id text references public.clients(id) on delete cascade,
  status text not null default 'held',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outbox_status_idx on public.outbox (status, created_at);
create index if not exists outbox_client_idx on public.outbox (client_id, status, created_at desc);
alter table public.outbox enable row level security;
drop policy if exists outbox_all on public.outbox;
create policy outbox_all on public.outbox for all using (public.is_advisor()) with check (public.is_advisor());
drop trigger if exists outbox_touch on public.outbox;
create trigger outbox_touch before update on public.outbox for each row execute function public.touch();
