-- Shoutout nudges: a reminder to recognize someone, sent at once or in waves across the week.
-- The server sends wave 1 right away and the daily job sends the rest. Safe to run more than once.
create table if not exists public.nudges (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nudges_client_idx on public.nudges (client_id, created_at desc);
alter table public.nudges enable row level security;
drop policy if exists nudges_read on public.nudges;
create policy nudges_read on public.nudges for select using (public.is_advisor() or public.is_exec(client_id));
