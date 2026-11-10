-- Leave of Absence center. HR administrators only: Ben, plus the people Ben names as HR admins
-- for a client. Executives and managers can't see any of it. Medical and confidential documents
-- are stored under <client>/leave/<case>/ and are only ever opened through the portal, which
-- checks access and records who opened what.
-- Safe to run more than once.

-- Who is an HR admin for a client (Ben manages this list)
create table if not exists public.leave_admins (
  client_id text not null references public.clients(id) on delete cascade,
  email text not null,
  medical boolean not null default true,   -- can open medical documents
  added_at timestamptz not null default now(),
  primary key (client_id, email)
);
alter table public.leave_admins enable row level security;
drop policy if exists leave_admins_read on public.leave_admins;
create policy leave_admins_read on public.leave_admins for select using (public.is_advisor() or lower(email) = public.me_email());
drop policy if exists leave_admins_write on public.leave_admins;
create policy leave_admins_write on public.leave_admins for all using (public.is_advisor()) with check (public.is_advisor());

create or replace function public.is_hr_admin(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_advisor()
      or (public.is_member(cid) and exists (select 1 from public.leave_admins a where a.client_id = cid and lower(a.email) = public.me_email()));
$$;

-- Leave cases (one per absence; several protections can apply to one case)
create table if not exists public.leave_cases (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leave_cases_client_idx on public.leave_cases (client_id, updated_at desc);
alter table public.leave_cases enable row level security;
drop policy if exists leave_cases_read on public.leave_cases;
create policy leave_cases_read on public.leave_cases for select using (public.is_hr_admin(client_id));
drop policy if exists leave_cases_insert on public.leave_cases;
create policy leave_cases_insert on public.leave_cases for insert with check (public.is_hr_admin(client_id));
drop policy if exists leave_cases_update on public.leave_cases;
create policy leave_cases_update on public.leave_cases for update using (public.is_hr_admin(client_id)) with check (public.is_hr_admin(client_id));
drop policy if exists leave_cases_delete on public.leave_cases;
create policy leave_cases_delete on public.leave_cases for delete using (public.is_advisor());

-- Audit trail: written by the server only, read by HR admins. Never edited or deleted from the portal.
create table if not exists public.leave_audit (
  id bigserial primary key,
  client_id text not null references public.clients(id) on delete cascade,
  case_id text not null,
  who text not null,
  what text not null,          -- created, updated, opened document, uploaded document, sent email, ...
  detail text,
  at timestamptz not null default now()
);
create index if not exists leave_audit_case_idx on public.leave_audit (case_id, at desc);
alter table public.leave_audit enable row level security;
drop policy if exists leave_audit_read on public.leave_audit;
create policy leave_audit_read on public.leave_audit for select using (public.is_hr_admin(client_id));

-- Keep updated_at honest
drop trigger if exists leave_cases_touch on public.leave_cases;
create trigger leave_cases_touch before update on public.leave_cases for each row execute function public.touch();
