-- Manager tools: Ask HR and practice.
-- One small table that counts use (for daily limits and so Ben can see who's practicing).
-- It never holds questions, answers or role-play conversations.

create table if not exists public.ai_usage (
  id bigserial primary key,
  email text not null,
  client_id text references public.clients(id) on delete cascade,
  kind text not null,          -- askhr, roleplay, feedback, quiz, sort
  ref text,                    -- handbook/situation, or the training id
  meta jsonb not null default '{}'::jsonb,  -- quiz score
  at timestamptz not null default now()
);
create index if not exists ai_usage_email_idx on public.ai_usage (email, kind, at);
create index if not exists ai_usage_client_idx on public.ai_usage (client_id, at);

alter table public.ai_usage enable row level security;
-- Only Ben reads it. The server writes it with the service key.
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage for select using (public.is_advisor());
