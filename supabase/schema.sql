-- AlzaHR Client Portal: database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates what is missing and refreshes policies.
--
-- Security model
--   * Ben (anyone in public.advisors) can see and change everything.
--   * A client user (a row in public.members) sees only their own company's data.
--   * Executives at a client can manage their team and invite codes.
--   * Confidential files are visible only to Ben and the person who uploaded them.
--   * Everything is enforced here in the database, not just hidden in the app.

-- ============================================================
-- Helpers
-- ============================================================

create or replace function public.me_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create table if not exists public.advisors (
  email text primary key,
  name text not null default 'Ben Gaines',
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key,
  name text not null,
  engagement text not null default '',
  pilot boolean not null default false,
  config jsonb not null default '{}'::jsonb,   -- modules, accent, logo, huddle settings, tiles, softAsks, escalationEmail
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  client_id text not null references public.clients(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default '',
  access text not null default 'manager' check (access in ('exec', 'manager', 'hiring')),
  huddle boolean not null default true,
  invited boolean not null default true,
  added_by text,
  created_at timestamptz not null default now(),
  primary key (client_id, email)
);
create index if not exists members_email_idx on public.members (email);

-- Keep emails lowercase so matching is reliable.
create or replace function public.lower_email() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists members_lower_email on public.members;
create trigger members_lower_email before insert or update on public.members
for each row execute function public.lower_email();
drop trigger if exists advisors_lower_email on public.advisors;
create trigger advisors_lower_email before insert or update on public.advisors
for each row execute function public.lower_email();

-- These run with owner rights so policies can call them without recursion.
create or replace function public.is_advisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.advisors where email = public.me_email())
$$;

create or replace function public.is_member(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where client_id = cid and email = public.me_email())
$$;

create or replace function public.is_exec(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where client_id = cid and email = public.me_email() and access = 'exec')
$$;

create or replace function public.can_see(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_advisor() or public.is_member(cid)
$$;

-- ============================================================
-- Client data (one row per item; the app object lives in `data`)
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['actions', 'projects', 'notes', 'files', 'notices', 'roles', 'candidates']
  loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key,
        client_id text not null references public.clients(id) on delete cascade,
        data jsonb not null,
        created_by text not null default public.me_email(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )$f$, t);
    execute format('create index if not exists %I on public.%I (client_id)', t || '_client_idx', t);
  end loop;
end $$;

-- Global content Ben manages
create table if not exists public.resources (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.benefits (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.announcements (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Reminder rules, booking link
create table if not exists public.app_settings (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Each person's dashboard layout and "useful?" votes
create table if not exists public.user_prefs (
  email text primary key default public.me_email(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_codes (
  code text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  access text not null default 'manager' check (access in ('exec', 'manager', 'hiring')),
  expires timestamptz not null default now() + interval '7 days',
  created_by text not null default public.me_email(),
  used_by text,
  created_at timestamptz not null default now()
);

-- So the daily email job never sends the same reminder twice
create table if not exists public.email_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- updated_at bookkeeping
create or replace function public.touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['actions', 'projects', 'notes', 'files', 'notices', 'roles', 'candidates', 'resources', 'benefits', 'announcements', 'app_settings', 'user_prefs']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch()', t || '_touch', t);
  end loop;
end $$;

-- A member who is not an executive may only change their own Huddle setting.
create or replace function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_advisor() or public.is_exec(old.client_id) then
    return new;
  end if;
  if old.email <> public.me_email()
     or new.email <> old.email or new.client_id <> old.client_id
     or new.access <> old.access or new.name <> old.name or new.role <> old.role then
    raise exception 'Only executives can change team members';
  end if;
  return new;
end $$;
drop trigger if exists members_guard on public.members;
create trigger members_guard before update on public.members
for each row execute function public.guard_member_update();

-- First sign-in clears the "invited" flag.
create or replace function public.mark_signed_in() returns void
language sql security definer set search_path = public as $$
  update public.members set invited = false where email = public.me_email() and invited
$$;

-- Join a workspace with an invite code (after the person has verified their email).
create or replace function public.redeem_invite(p_code text, p_name text, p_role text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.invite_codes;
  me text := public.me_email();
begin
  if me = '' then
    raise exception 'Sign in first';
  end if;
  select * into c from public.invite_codes where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'That code does not match an invite';
  end if;
  if c.used_by is not null and c.used_by <> me then
    raise exception 'That code has already been used';
  end if;
  if c.expires < now() then
    raise exception 'That code has expired';
  end if;
  insert into public.members (client_id, email, name, role, access, invited, added_by)
  values (c.client_id, me, coalesce(nullif(trim(p_name), ''), split_part(me, '@', 1)), coalesce(nullif(trim(p_role), ''), 'Team member'), c.access, false, 'code ' || c.code)
  on conflict (client_id, email) do nothing;
  update public.invite_codes set used_by = me where code = c.code;
  return c.client_id;
end $$;

-- Who am I? Used by the app right after sign-in.
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', public.me_email(),
    'advisor', public.is_advisor(),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('clientId', m.client_id, 'name', m.name, 'role', m.role, 'access', m.access) order by m.created_at)
      from public.members m where m.email = public.me_email()
    ), '[]'::jsonb)
  )
$$;

-- ============================================================
-- Row level security
-- ============================================================

alter table public.advisors enable row level security;
alter table public.clients enable row level security;
alter table public.members enable row level security;
alter table public.actions enable row level security;
alter table public.projects enable row level security;
alter table public.notes enable row level security;
alter table public.files enable row level security;
alter table public.notices enable row level security;
alter table public.roles enable row level security;
alter table public.candidates enable row level security;
alter table public.resources enable row level security;
alter table public.benefits enable row level security;
alter table public.announcements enable row level security;
alter table public.app_settings enable row level security;
alter table public.user_prefs enable row level security;
alter table public.invite_codes enable row level security;
alter table public.email_log enable row level security;  -- no policies: server only

-- Clean slate for policies so re-running is safe
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy advisors_self on public.advisors for select using (email = public.me_email());

create policy clients_read on public.clients for select using (public.can_see(id));
create policy clients_write on public.clients for all using (public.is_advisor()) with check (public.is_advisor());

create policy members_read on public.members for select using (public.can_see(client_id));
create policy members_insert on public.members for insert with check (public.is_advisor() or public.is_exec(client_id));
create policy members_delete on public.members for delete using (public.is_advisor() or public.is_exec(client_id));
create policy members_update on public.members for update
  using (public.is_advisor() or public.is_exec(client_id) or email = public.me_email())
  with check (public.is_advisor() or public.is_exec(client_id) or email = public.me_email());

-- Day-to-day client data: members can read and work on their company's items; only Ben deletes.
do $$
declare t text;
begin
  foreach t in array array['actions', 'projects', 'notes', 'roles', 'candidates']
  loop
    execute format('create policy %I on public.%I for select using (public.can_see(client_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.can_see(client_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_see(client_id)) with check (public.can_see(client_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.is_advisor())', t || '_delete', t);
  end loop;
end $$;

-- Shared files: confidential ones only for Ben and the uploader.
create policy files_read on public.files for select using (
  public.is_advisor()
  or (public.is_member(client_id) and (coalesce((data ->> 'confidential')::boolean, false) = false or created_by = public.me_email()))
);
create policy files_insert on public.files for insert with check (public.can_see(client_id));
create policy files_update on public.files for update using (public.is_advisor()) with check (public.is_advisor());
create policy files_delete on public.files for delete using (public.is_advisor());

-- Notifications are Ben's bell: clients can create them, only Ben reads them.
create policy notices_read on public.notices for select using (public.is_advisor());
create policy notices_insert on public.notices for insert with check (public.can_see(client_id));
create policy notices_update on public.notices for update using (public.is_advisor()) with check (public.is_advisor());
create policy notices_delete on public.notices for delete using (public.is_advisor());

-- Library resources: a client sees only what has been shared with them.
create policy resources_read on public.resources for select using (
  public.is_advisor()
  or exists (
    select 1 from public.members m
    where m.email = public.me_email()
      and resources.data -> 'shares' @> jsonb_build_array(jsonb_build_object('clientId', m.client_id))
  )
);
create policy resources_write on public.resources for all using (public.is_advisor()) with check (public.is_advisor());

create policy benefits_read on public.benefits for select using (auth.role() = 'authenticated');
create policy benefits_write on public.benefits for all using (public.is_advisor()) with check (public.is_advisor());
create policy announcements_read on public.announcements for select using (auth.role() = 'authenticated');
create policy announcements_write on public.announcements for all using (public.is_advisor()) with check (public.is_advisor());

create policy settings_read on public.app_settings for select using (auth.role() = 'authenticated');
create policy settings_write on public.app_settings for all using (public.is_advisor()) with check (public.is_advisor());

create policy prefs_own on public.user_prefs for all using (email = public.me_email()) with check (email = public.me_email());

create policy codes_read on public.invite_codes for select using (public.is_advisor() or public.is_exec(client_id));
create policy codes_insert on public.invite_codes for insert with check (public.is_advisor() or public.is_exec(client_id));
create policy codes_delete on public.invite_codes for delete using (public.is_advisor() or public.is_exec(client_id));

grant execute on function public.redeem_invite(text, text, text) to authenticated;
grant execute on function public.whoami() to authenticated;
grant execute on function public.mark_signed_in() to authenticated;

-- ============================================================
-- File storage (private bucket; files open through short-lived links)
-- Path format: <client_id>/<file_id>/<file name>
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('client-files', 'client-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists portal_files_insert on storage.objects;
drop policy if exists portal_files_read on storage.objects;
drop policy if exists portal_files_delete on storage.objects;

create policy portal_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'client-files' and public.can_see((storage.foldername(name))[1]));

create policy portal_files_read on storage.objects for select to authenticated
using (
  bucket_id = 'client-files'
  and (
    public.is_advisor()
    or exists (
      select 1 from public.files f
      where f.data ->> 'path' = storage.objects.name
        and public.is_member(f.client_id)
        and (coalesce((f.data ->> 'confidential')::boolean, false) = false or f.created_by = public.me_email())
    )
  )
);

create policy portal_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'client-files' and public.is_advisor());

-- ============================================================
-- Documents Claude uses when drafting (also in 002_knowledge.sql)
-- ============================================================
create table if not exists public.knowledge (
  id text primary key,
  client_id text references public.clients(id) on delete cascade, -- null = Ben's default templates
  kind text not null check (kind in ('handbook', 'policy', 'template', 'letterhead', 'other')),
  title text not null,
  file_name text not null,
  path text not null,
  mime text not null default '',
  text text not null default '',
  chars integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_client_idx on public.knowledge (client_id);

alter table public.knowledge enable row level security;
drop policy if exists knowledge_advisor on public.knowledge;
create policy knowledge_advisor on public.knowledge for all using (public.is_advisor()) with check (public.is_advisor());

-- Ben's default templates live in the "alza" folder of the private bucket.
drop policy if exists portal_files_insert on storage.objects;
create policy portal_files_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-files'
  and (public.is_advisor() or public.can_see((storage.foldername(name))[1]))
);

-- ============================================================
-- New hires (also in 003_hires.sql)
-- ============================================================
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

-- ============================================================
-- Starting data
-- ============================================================

insert into public.advisors (email, name) values
  ('ben@alzapc.com', 'Ben Gaines')
on conflict (email) do nothing;

insert into public.app_settings (key, data) values
  ('global', '{"rules": {"friendlyBefore": 3, "dueDay": true, "overdueNotice": 1, "escalateAfter": 3, "blockerAfter": 7}, "bookingUrl": "https://calendly.com/ben-alzapc/30min"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- e-signature (also in 004_esign.sql)
create table if not exists public.signatures (
  id text primary key,                 -- the random token in the signing link
  client_id text not null references public.clients(id) on delete cascade,
  hire_id text not null,
  doc_kind text not null,              -- offer | agreement
  title text not null,
  body text not null,                  -- exactly what the signer sees and signs
  doc_hash text not null,              -- SHA-256 of body
  source_path text,                    -- the Word/PDF file it came from
  signer_name text not null,
  signer_email text not null,
  status text not null default 'sent', -- sent | viewed | signed | declined | voided
  sent_by text not null,
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  signed_at timestamptz,
  signed_name text,
  signed_ip text,
  signed_agent text,
  decline_reason text,
  signed_path text,                    -- the signed PDF in storage
  expires_at timestamptz not null default now() + interval '30 days',
  events jsonb not null default '[]'::jsonb
);
create index if not exists signatures_hire_idx on public.signatures (hire_id);

alter table public.signatures enable row level security;
drop policy if exists signatures_read on public.signatures;
create policy signatures_read on public.signatures for select using (public.is_advisor() or public.is_exec(client_id));
-- no insert/update/delete policies: only the server (service key) writes

-- ---------------------------------------------------------------- push notifications (also in 005_push.sql)
create table if not exists public.push_subs (
  endpoint text primary key,           -- one row per device/browser
  email text not null,
  sub jsonb not null,
  agent text,
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
create index if not exists push_subs_email_idx on public.push_subs (lower(email));

create table if not exists public.push_prefs (
  email text primary key,              -- lower-case
  topics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_subs enable row level security;
alter table public.push_prefs enable row level security;
drop policy if exists push_subs_own on public.push_subs;
create policy push_subs_own on public.push_subs for select using (lower(email) = lower(public.me_email()));
drop policy if exists push_prefs_own on public.push_prefs;
create policy push_prefs_own on public.push_prefs for select using (lower(email) = lower(public.me_email()));

-- ---------------------------------------------------------------- video screening (also in 006_pitch.sql)
update storage.buckets set file_size_limit = 52428800 where id = 'client-files';

-- Fast lookup of a role from its public pitch link
create index if not exists roles_pitch_slug_idx on public.roles ((data -> 'pitch' ->> 'slug'));
create index if not exists candidates_role_idx on public.candidates ((data ->> 'roleId'));

-- Pitches Ben hasn't shared yet stay invisible to the client's team (not just hidden on screen)
drop policy if exists candidates_read on public.candidates;
create policy candidates_read on public.candidates for select using (
  public.is_advisor()
  or (public.is_member(client_id) and coalesce((data ->> 'hidden')::boolean, false) = false)
);
drop policy if exists candidates_update on public.candidates;
create policy candidates_update on public.candidates for update
  using (public.is_advisor() or (public.is_member(client_id) and coalesce((data ->> 'hidden')::boolean, false) = false))
  with check (public.is_advisor() or (public.is_member(client_id) and coalesce((data ->> 'hidden')::boolean, false) = false));


-- ===================================================================== newsletters (008)
-- AlzaHR Client Portal: newsletters (Manager Minute, The Pause)
--
-- Ben queues, edits and copies each issue in the console. Clients only see an issue
-- after Ben saves it to their Library.

create table if not exists public.newsletters (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null,
  created_by text not null default public.me_email(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists newsletters_client_idx on public.newsletters (client_id);

drop trigger if exists newsletters_touch on public.newsletters;
create trigger newsletters_touch before update on public.newsletters for each row execute function public.touch();

alter table public.newsletters enable row level security;
drop policy if exists newsletters_read on public.newsletters;
drop policy if exists newsletters_write on public.newsletters;
-- Ben sees everything; a client's people see only issues saved to their Library
create policy newsletters_read on public.newsletters for select
  using (public.is_advisor() or (public.is_member(client_id) and coalesce((data->>'inLibrary')::boolean, false)));
create policy newsletters_write on public.newsletters for all
  using (public.is_advisor()) with check (public.is_advisor());



-- ===================================================================== manager hub (009)
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
