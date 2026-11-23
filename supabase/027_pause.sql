-- 027: The Pause. Counts only: one row each time someone opens, starts or finishes a monthly Pause.
-- No names, emails or reflections are ever stored. Only the server (service role) reads or writes it.
create table if not exists public.pause_events (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(id) on delete cascade,
  month text not null,            -- yyyy-mm
  kind text not null check (kind in ('visit', 'start', 'complete', 'coach')),
  at timestamptz not null default now()
);
create index if not exists pause_events_client_month on public.pause_events (client_id, month);
alter table public.pause_events enable row level security;
-- no policies on purpose: browsers can't read or write this table
