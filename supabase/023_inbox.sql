-- Email to work: emails Ben forwards (or pastes) and what each became. Ben's side only.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.inbox_items (
  id text primary key,
  client_id text references public.clients(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inbox_items_created_idx on public.inbox_items (created_at desc);
create index if not exists inbox_items_email_idx on public.inbox_items ((data ->> 'emailId'));
alter table public.inbox_items enable row level security;
drop policy if exists inbox_items_all on public.inbox_items;
create policy inbox_items_all on public.inbox_items for all using (public.is_advisor()) with check (public.is_advisor());
drop trigger if exists inbox_items_touch on public.inbox_items;
create trigger inbox_items_touch before update on public.inbox_items for each row execute function public.touch();
