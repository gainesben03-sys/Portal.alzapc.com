-- Shoutout challenges: Appreciation Chain, Team Goal, Welcome Wagon.
-- Ben, executives and managers start them from the portal; only the server writes.
-- Safe to run more than once.

create table if not exists public.challenges (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists challenges_client_idx on public.challenges (client_id, created_at desc);
create index if not exists shoutouts_challenge_idx on public.shoutouts ((data ->> 'challengeId'));

alter table public.challenges enable row level security;
drop policy if exists challenges_read on public.challenges;
create policy challenges_read on public.challenges for select using (public.is_advisor() or public.is_member(client_id));
