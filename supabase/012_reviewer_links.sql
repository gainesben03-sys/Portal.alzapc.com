-- Reviewer links: people outside the portal watch pitches for a role and say yes or no.
-- Their calls live in their own table so nothing the portal saves can overwrite them.
-- Safe to run more than once.

create table if not exists public.outside_reviews (
  id text primary key,                 -- <candidate id>:<reviewer link id>
  client_id text not null references public.clients(id) on delete cascade,
  candidate_id text not null,
  data jsonb not null default '{}'::jsonb, -- { candidateId, roleId, reviewerId, name, decision, note, at }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outside_reviews_client_idx on public.outside_reviews (client_id);
create index if not exists outside_reviews_candidate_idx on public.outside_reviews (candidate_id);

alter table public.outside_reviews enable row level security;
-- Ben and the client's team can read them. Only the server (the reviewer link) writes them.
drop policy if exists outside_reviews_read on public.outside_reviews;
create policy outside_reviews_read on public.outside_reviews for select using (public.is_advisor() or public.is_member(client_id));
drop policy if exists outside_reviews_delete on public.outside_reviews;
create policy outside_reviews_delete on public.outside_reviews for delete using (public.is_advisor());

-- Finding a role by its reviewer link
create index if not exists roles_reviewers_idx on public.roles using gin ((data -> 'reviewers'));
