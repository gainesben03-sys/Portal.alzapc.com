-- AlzaHR Client Portal: Manager Hub (team roster, check-ins and recognition)
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Who can see what:
--   people (the roster):  Ben, the client's executives, and each manager for the people they manage.
--                         Only Ben adds, edits or removes people.
--   checkins (check-in notes and recognition): ONLY Ben and the person's manager. Executives can't read
--                         them. Managers can add and edit their own entries but can't delete them
--                         (they're documentation); only Ben can delete.

create table if not exists public.people (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null,
  created_by text not null default public.me_email(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_client_idx on public.people (client_id);
create index if not exists people_manager_idx on public.people ((lower(data->>'managerEmail')));

create table if not exists public.checkins (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null,
  created_by text not null default public.me_email(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checkins_client_idx on public.checkins (client_id);

drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people for each row execute function public.touch();
drop trigger if exists checkins_touch on public.checkins;
create trigger checkins_touch before update on public.checkins for each row execute function public.touch();

alter table public.people enable row level security;
alter table public.checkins enable row level security;

drop policy if exists people_read on public.people;
drop policy if exists people_write on public.people;
create policy people_read on public.people for select using (
  public.is_advisor()
  or public.is_exec(client_id)
  or (public.is_member(client_id) and lower(data->>'managerEmail') = public.me_email())
);
create policy people_write on public.people for all using (public.is_advisor()) with check (public.is_advisor());

drop policy if exists checkins_read on public.checkins;
drop policy if exists checkins_insert on public.checkins;
drop policy if exists checkins_update on public.checkins;
drop policy if exists checkins_delete on public.checkins;
-- the manager on the entry must also be the person's manager on the roster
create policy checkins_read on public.checkins for select using (
  public.is_advisor() or (public.is_member(client_id) and lower(data->>'managerEmail') = public.me_email())
);
create policy checkins_insert on public.checkins for insert with check (
  public.is_advisor() or (
    public.is_member(client_id)
    and lower(data->>'managerEmail') = public.me_email()
    and exists (select 1 from public.people p where p.id = checkins.data->>'personId' and p.client_id = checkins.client_id and lower(p.data->>'managerEmail') = public.me_email())
  )
);
create policy checkins_update on public.checkins for update
  using (public.is_advisor() or (public.is_member(client_id) and lower(data->>'managerEmail') = public.me_email()))
  with check (public.is_advisor() or (public.is_member(client_id) and lower(data->>'managerEmail') = public.me_email()));
create policy checkins_delete on public.checkins for delete using (public.is_advisor());
