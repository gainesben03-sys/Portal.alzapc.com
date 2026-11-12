-- Offboarding: one row per person leaving. Ben and the client's executives only
-- (it can hold the reason someone was let go). Exit survey answers are written by the server.
-- Safe to run more than once.
create table if not exists public.departures (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists departures_client_idx on public.departures (client_id, created_at desc);
create index if not exists departures_survey_idx on public.departures ((data -> 'survey' ->> 'token'));
alter table public.departures enable row level security;
drop policy if exists departures_read on public.departures;
create policy departures_read on public.departures for select using (public.is_advisor() or public.is_exec(client_id));
drop policy if exists departures_insert on public.departures;
create policy departures_insert on public.departures for insert with check (public.is_advisor() or public.is_exec(client_id));
drop policy if exists departures_update on public.departures;
create policy departures_update on public.departures for update using (public.is_advisor() or public.is_exec(client_id)) with check (public.is_advisor() or public.is_exec(client_id));
drop policy if exists departures_delete on public.departures;
create policy departures_delete on public.departures for delete using (public.is_advisor());
drop trigger if exists departures_touch on public.departures;
create trigger departures_touch before update on public.departures for each row execute function public.touch();
