-- Shoutouts (employee recognition). One table for every shoutout, however it came in:
-- the QR code form, a text message, or the portal. Only the server writes; it screens every
-- shoutout first and holds anything questionable for review.
-- Safe to run more than once.

create table if not exists public.shoutouts (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shoutouts_client_idx on public.shoutouts (client_id, created_at desc);
create index if not exists shoutouts_status_idx on public.shoutouts ((data ->> 'status'));
create index if not exists shoutouts_to_idx on public.shoutouts ((data -> 'to' ->> 'personId'));

-- One reaction per person (or device) per emoji
create table if not exists public.shout_reactions (
  shout_id text not null references public.shoutouts(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  who text not null,       -- a signed-in email, or a random id kept on the phone that reacted
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (shout_id, who, emoji)
);
create index if not exists shout_reactions_client_idx on public.shout_reactions (client_id);

-- Text conversations in progress, and numbers that said STOP
create table if not exists public.sms_threads (
  phone text not null,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (phone, client_id)
);
create table if not exists public.sms_optouts (
  phone text primary key,
  at timestamptz not null default now()
);

alter table public.shoutouts enable row level security;
alter table public.shout_reactions enable row level security;
alter table public.sms_threads enable row level security;
alter table public.sms_optouts enable row level security;

-- Ben sees everything. The client's team sees live shoutouts; executives also see held ones to review.
drop policy if exists shoutouts_read on public.shoutouts;
create policy shoutouts_read on public.shoutouts for select using (
  public.is_advisor()
  or (public.is_member(client_id) and data ->> 'status' = 'live')
  or public.is_exec(client_id)
);
drop policy if exists shout_reactions_read on public.shout_reactions;
create policy shout_reactions_read on public.shout_reactions for select using (public.is_advisor() or public.is_member(client_id));
-- sms_threads and sms_optouts: server only (no policies)

-- Finding a company by its QR code link or texting number
create index if not exists clients_shout_token_idx on public.clients ((config -> 'recognition' ->> 'token'));
create index if not exists clients_shout_sms_idx on public.clients ((config -> 'recognition' ->> 'smsNumber'));
