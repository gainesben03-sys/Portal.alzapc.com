-- Alza Pulse: employee surveys. Three tables, every read and write through the portal's server.
-- Responses are kept apart from invitations on purpose: an anonymous answer has no name, email,
-- invite link or time of day on it, so nobody (Ben included) can trace it back to a person.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.pulse_surveys (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pulse_surveys_client_idx on public.pulse_surveys (client_id, created_at desc);
create index if not exists pulse_surveys_open_idx on public.pulse_surveys ((data ->> 'openToken'));

create table if not exists public.pulse_invites (
  token text primary key,
  survey_id text not null references public.pulse_surveys(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  done boolean not null default false,
  data jsonb not null default '{}'::jsonb
);
create index if not exists pulse_invites_survey_idx on public.pulse_invites (survey_id);

create table if not exists public.pulse_responses (
  id text primary key,
  survey_id text not null references public.pulse_surveys(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  day date not null default current_date,
  data jsonb not null default '{}'::jsonb
);
create index if not exists pulse_responses_survey_idx on public.pulse_responses (survey_id);

alter table public.pulse_surveys enable row level security;
alter table public.pulse_invites enable row level security;
alter table public.pulse_responses enable row level security;
drop policy if exists pulse_surveys_all on public.pulse_surveys;
create policy pulse_surveys_all on public.pulse_surveys for all using (public.is_advisor()) with check (public.is_advisor());
drop policy if exists pulse_invites_all on public.pulse_invites;
create policy pulse_invites_all on public.pulse_invites for all using (public.is_advisor()) with check (public.is_advisor());
drop policy if exists pulse_responses_all on public.pulse_responses;
create policy pulse_responses_all on public.pulse_responses for all using (public.is_advisor()) with check (public.is_advisor());
drop trigger if exists pulse_surveys_touch on public.pulse_surveys;
create trigger pulse_surveys_touch before update on public.pulse_surveys for each row execute function public.touch();
