-- AlzaHR Client Portal: new hires (onboarding tracker)
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.

create table if not exists public.hires (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null,
  created_by text not null default public.me_email(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hires_client_idx on public.hires (client_id);

drop trigger if exists hires_touch on public.hires;
create trigger hires_touch before update on public.hires for each row execute function public.touch();

alter table public.hires enable row level security;
drop policy if exists hires_read on public.hires;
drop policy if exists hires_insert on public.hires;
drop policy if exists hires_update on public.hires;
drop policy if exists hires_delete on public.hires;
create policy hires_read on public.hires for select using (public.can_see(client_id));
create policy hires_insert on public.hires for insert with check (public.can_see(client_id));
create policy hires_update on public.hires for update using (public.can_see(client_id)) with check (public.can_see(client_id));
create policy hires_delete on public.hires for delete using (public.is_advisor());
