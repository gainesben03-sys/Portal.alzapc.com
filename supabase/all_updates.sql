-- AlzaHR Client Portal: catch-up. Runs every database update (002 to 007) in order.
-- Safe to run even if some were already run. Supabase → SQL Editor → New query → paste all → Run.

-- ===================================================================== 002_knowledge.sql
-- AlzaHR Client Portal: documents Claude uses when drafting
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.

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

-- ===================================================================== 003_hires.sql
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

-- ===================================================================== 004_esign.sql
-- AlzaHR Client Portal: built-in e-signature for offer letters and agreements.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Signers never sign in. Each request has a long random link; the server reads and
-- writes these rows with the service key. Ben and the client's executives can read them.

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

-- ===================================================================== 005_push.sql
-- AlzaHR Client Portal: push notifications (phone and computer alerts).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Only the server reads and writes these (service key). People manage their own
-- devices and choices through the portal.

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

-- ===================================================================== 006_pitch.sql
-- AlzaHR Client Portal: video screening (candidate pitches).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.

-- Pitch videos are stored privately with the client's other files. Allow up to 50 MB per file
-- (the most a free Supabase project takes; portal recordings are usually 5-15 MB).
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

-- ===================================================================== 007_my_clients.sql
-- AlzaHR Client Portal: add Ben's current clients, their projects, and Ben's open to-dos.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run: it skips anything already there.
--
-- What it adds (all editable afterward in the portal):
--   Clients:  Blueprint Studios, Hensley, Students Run LA, Presidio Bay / The Main Post
--   Projects: current work for each, with steps
--   To-dos:   one or two items on Ben's "You owe" list per client (due a week out; adjust in the portal)
--   Context:  a short "Client context" note per client that Claude reads when drafting (Ben only; clients never see it)
--
-- Not added on purpose:
--   * People. Invite each client's team from Clients → [client] → People with access, so they get the sign-in email.
--   * Community Action Marin and Sausalito Yacht Club. Investigation work is confidential and does not belong in a
--     shared client portal.
--   * Quickstream Solutions and STG Group. Add them in the console if they're active.

do $$
declare
  cid text;
  due_week text := to_char(current_date + 7, 'YYYY-MM-DD');
  due_month text := to_char(current_date + 30, 'YYYY-MM-DD');
  ben jsonb := '{"name":"Ben Gaines","role":"Alza advisor"}';
  base_cfg jsonb := '{"modules":{"recruiting":true,"resources":true,"wellness":false,"board":true,"hires":true},"accent":"#19283c","escalationEmail":"","softAsks":true,"huddle":{"cadence":"weekly","day":1,"skipIfQuiet":true,"bundleReminders":true,"personalNote":""}}';

begin
  -- ================================================================== Blueprint Studios
  select id into cid from public.clients where lower(name) = lower('Blueprint Studios') limit 1;
  if cid is null then
    cid := 'blueprint';
    insert into public.clients (id, name, engagement, pilot, config)
    values (cid, 'Blueprint Studios', 'Fractional HR and recruiting', true, base_cfg || '{"accent":"#1940f8"}')
    on conflict (id) do nothing;
  end if;

  insert into public.projects (id, client_id, created_by, data) values
  ('seed-bp-training', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'Manager training series', 'status', 'active',
    'summary', 'Six sessions across the employee lifecycle, tied to ADP, plus a Manager Field Guide with clear do and don''t guidance.',
    'steps', '[{"id":"s1","text":"Session outline for all six sessions","done":true},{"id":"s2","text":"Manager Field Guide: hiring and onboarding","done":false},{"id":"s3","text":"Sessions 1-2 delivered","done":false},{"id":"s4","text":"Sessions 3-4 delivered","done":false},{"id":"s5","text":"Sessions 5-6 delivered","done":false}]'::jsonb,
    'nextMilestone', 'Manager Field Guide', 'milestoneDue', due_month)),
  ('seed-bp-avlv', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'Trade Show & AV Manager search (Las Vegas)', 'status', 'active',
    'summary', 'Full-cycle search for the Las Vegas location.',
    'steps', '[{"id":"s1","text":"Intake and scorecard","done":true},{"id":"s2","text":"Sourcing","done":false},{"id":"s3","text":"Screening","done":false},{"id":"s4","text":"Finalists to Blueprint","done":false},{"id":"s5","text":"Offer and close","done":false}]'::jsonb,
    'nextMilestone', 'Finalists to Blueprint', 'milestoneDue', due_month)),
  ('seed-bp-oe', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'Open enrollment portal', 'status', 'active',
    'summary', 'An interactive open enrollment guide for employees, shared through Happeo.',
    'steps', '[{"id":"s1","text":"Plan details and rates gathered","done":false},{"id":"s2","text":"Portal built","done":false},{"id":"s3","text":"Leadership review","done":false},{"id":"s4","text":"Shared with employees on Happeo","done":false}]'::jsonb,
    'nextMilestone', 'Portal built', 'milestoneDue', due_month)),
  ('seed-bp-ai', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'AI Use Policy', 'status', 'done',
    'summary', 'Company AI Use Policy, written at the COO''s direction.', 'steps', '[]'::jsonb, 'nextMilestone', 'Done', 'milestoneDue', to_char(current_date, 'YYYY-MM-DD'))),
  ('seed-bp-auto', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'HR celebrations and monthly digest', 'status', 'done',
    'summary', 'Automatic birthday and work anniversary emails, a monthly HR digest, and a leadership preview, run from a Google Sheet.', 'steps', '[]'::jsonb, 'nextMilestone', 'Done', 'milestoneDue', to_char(current_date, 'YYYY-MM-DD')))
  on conflict (id) do nothing;

  insert into public.actions (id, client_id, created_by, data) values
  ('seed-bp-a1', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'side', 'alza', 'kind', 'document', 'title', 'Finish the Manager Field Guide (hiring and onboarding)',
    'detail', 'Prescriptive do and don''t guidance for managers, used alongside the training series.', 'owner', ben, 'due', due_week, 'status', 'in_progress', 'attachments', '[]'::jsonb,
    'history', jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Ben Gaines', 'text', 'Added to Ben''s list'))))
  on conflict (id) do nothing;

  insert into public.knowledge (id, client_id, kind, title, file_name, path, text, chars) values
  ('seed-ctx-bp', cid, 'other', 'Client context', 'client-context.txt', 'none',
   'Blueprint Studios is a multi-location events and production company (including a Las Vegas location). Leaders: Mircea (CEO) and Samar (COO). Payroll and HR system: ADP. Intranet: Happeo. Sister company: Hensley. Work so far: a six-session manager training series tied to ADP with a Manager Field Guide; an AI Use Policy written at the COO''s direction; automated birthday, anniversary and monthly digest emails; ongoing recruiting (recent roles include Director of Sales, Field Operations Supervisor, Account Manager, an EA for the COO, and a Trade Show & AV Manager in Las Vegas); an interactive open enrollment portal.', 0)
  on conflict (id) do nothing;

  -- ================================================================== Hensley
  select id into cid from public.clients where lower(name) = lower('Hensley') limit 1;
  if cid is null then
    cid := 'hensley';
    insert into public.clients (id, name, engagement, pilot, config) values (cid, 'Hensley', 'Fractional HR', false, base_cfg) on conflict (id) do nothing;
  end if;

  insert into public.projects (id, client_id, created_by, data) values
  ('seed-hs-perf', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'Performance check-ins launch', 'status', 'active',
    'summary', 'Hensley''s first formal performance process: one-page check-ins for warehouse and field roles and for office and management, with monthly one-on-ones.',
    'steps', '[{"id":"s1","text":"Check-in forms built (warehouse/field and office/management)","done":true},{"id":"s2","text":"Process adopted","done":false},{"id":"s3","text":"Managers trained","done":false},{"id":"s4","text":"First reviews (December)","done":false},{"id":"s5","text":"Tracking begins (Q1 2027)","done":false},{"id":"s6","text":"Mid-year reviews (June 2027)","done":false}]'::jsonb,
    'nextMilestone', 'Managers trained', 'milestoneDue', '2026-11-30')),
  ('seed-hs-401k', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', '401(k) alignment with Blueprint', 'status', 'active',
    'summary', 'Bring Hensley''s 401(k) plan in line with Blueprint Studios'' plan.',
    'steps', '[{"id":"s1","text":"Compare plan documents","done":false},{"id":"s2","text":"Recommend changes","done":false},{"id":"s3","text":"Provider updates made","done":false},{"id":"s4","text":"Employees notified","done":false}]'::jsonb,
    'nextMilestone', 'Recommend changes', 'milestoneDue', due_month))
  on conflict (id) do nothing;

  insert into public.actions (id, client_id, created_by, data) values
  ('seed-hs-a1', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'side', 'alza', 'kind', 'document', 'title', 'Manager training on the new check-in forms',
    'detail', 'Coaching-focused session: monthly one-on-ones, no-surprises feedback, and how to use the five focus areas.', 'owner', ben, 'due', due_week, 'status', 'not_started', 'attachments', '[]'::jsonb,
    'history', jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Ben Gaines', 'text', 'Added to Ben''s list'))))
  on conflict (id) do nothing;

  insert into public.knowledge (id, client_id, kind, title, file_name, path, text, chars) values
  ('seed-ctx-hs', cid, 'other', 'Client context', 'client-context.txt', 'none',
   'Hensley is a sister company of Blueprint Studios with warehouse and field roles (warehouse, installers, drivers) and office and management roles. It is standing up its first formal performance process, kept simple: one-page check-ins rated Exceeding / Meeting / Needs Focus. Warehouse focus areas: Attendance & Reliability, Teamwork & Attitude, Communication, Ability to Do the Job, Safety & Responsibility. Office focus areas: Communication, Teamwork, Results, Initiative & Problem-Solving, Reliability. Managers hold at least monthly one-on-ones. Rollout: adopt Oct 2026, train managers Oct-Nov 2026, first reviews Dec 2026, tracking Q1 2027, mid-year reviews June 2027. Also aligning the 401(k) plan with Blueprint''s.', 0)
  on conflict (id) do nothing;

  -- ================================================================== Students Run LA
  select id into cid from public.clients where lower(name) in (lower('Students Run LA'), lower('SRLA')) limit 1;
  if cid is null then
    cid := 'srla';
    insert into public.clients (id, name, engagement, pilot, config) values (cid, 'Students Run LA', 'Fractional HR', false, base_cfg) on conflict (id) do nothing;
  end if;

  insert into public.projects (id, client_id, created_by, data) values
  ('seed-srla-perf', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'Growth & Impact Plan', 'status', 'active',
    'summary', 'SRLA''s first-year performance program: annual plan, quarterly check-ins, and an annual review rated Exceeding / Meeting / Developing.',
    'steps', '[{"id":"s1","text":"Performance package built (plan, check-in, review, manager guide)","done":true},{"id":"s2","text":"Leadership sign-off","done":false},{"id":"s3","text":"Manager walkthrough","done":false},{"id":"s4","text":"First quarterly check-ins","done":false}]'::jsonb,
    'nextMilestone', 'Leadership sign-off', 'milestoneDue', due_month))
  on conflict (id) do nothing;

  insert into public.knowledge (id, client_id, kind, title, file_name, path, text, chars) values
  ('seed-ctx-srla', cid, 'other', 'Client context', 'client-context.txt', 'none',
   'Students Run LA is a nonprofit; CEO Gaby Arvizu. Performance program: the Growth & Impact Plan, built on four themes (Empowerment, Clarity, Development, Impact), with an annual plan, quarterly check-ins, an annual review with three ratings (Exceeding / Meeting / Developing) and a manager guide. Past work includes job description reviews and an ongoing HR services proposal.', 0)
  on conflict (id) do nothing;

  -- ================================================================== Presidio Bay / The Main Post
  select id into cid from public.clients where lower(name) like '%presidio%' or lower(name) like '%main post%' limit 1;
  if cid is null then
    cid := 'presidio-bay';
    insert into public.clients (id, name, engagement, pilot, config) values (cid, 'Presidio Bay / The Main Post', 'Fractional HR and PEO exit', false, base_cfg || '{"accent":"#7a1f2b"}') on conflict (id) do nothing;
  end if;

  insert into public.projects (id, client_id, created_by, data) values
  ('seed-pb-peo', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'Leaving TriNet: Rippling + IMA Benefits', 'status', 'active',
    'summary', 'Move off the TriNet PEO to Rippling for payroll and IMA for benefits, live April 1, 2027.',
    'steps', '[{"id":"s1","text":"TriNet agreement reviewed for exit costs","done":true},{"id":"s2","text":"Proposals compared (TriNet, Paylocity, Rippling, IMA)","done":true},{"id":"s3","text":"Rippling and IMA selected","done":true},{"id":"s4","text":"Out-of-pocket gap plan (threshold HRA)","done":false},{"id":"s5","text":"Rippling implementation","done":false},{"id":"s6","text":"Benefits open enrollment","done":false},{"id":"s7","text":"Go-live April 1, 2027","done":false}]'::jsonb,
    'nextMilestone', 'Out-of-pocket gap plan', 'milestoneDue', due_month)),
  ('seed-pb-time', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'Timekeeping training for managers', 'status', 'active',
    'summary', 'An on-demand training for managers of the new non-exempt team members.',
    'steps', '[{"id":"s1","text":"Training deck built","done":true},{"id":"s2","text":"Uploaded to TriNet","done":false},{"id":"s3","text":"Managers complete it","done":false}]'::jsonb,
    'nextMilestone', 'Managers complete it', 'milestoneDue', due_month)),
  ('seed-pb-onb', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'name', 'New hire onboarding', 'status', 'active',
    'summary', 'Offer letters and agreements from your templates, e-signature, and welcome and first-day emails, now run through the portal''s New hires.',
    'steps', '[{"id":"s1","text":"Onboarding presentation","done":true},{"id":"s2","text":"Offer letter and agreement templates in the portal","done":false},{"id":"s3","text":"Welcome and first-day emails set up","done":false},{"id":"s4","text":"First hire run through the portal","done":false}]'::jsonb,
    'nextMilestone', 'Templates in the portal', 'milestoneDue', due_month))
  on conflict (id) do nothing;

  insert into public.actions (id, client_id, created_by, data) values
  ('seed-pb-a1', cid, 'ben@alzapc.com', jsonb_build_object('clientId', cid, 'side', 'alza', 'kind', 'document', 'title', 'Threshold HRA proposal to close the out-of-pocket gap',
    'detail', 'The new plan''s out-of-pocket maximum is roughly double the current one. Propose a threshold HRA to bridge it, with cost.', 'owner', ben, 'due', due_week, 'status', 'in_progress', 'attachments', '[]'::jsonb,
    'history', jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Ben Gaines', 'text', 'Added to Ben''s list'))))
  on conflict (id) do nothing;

  insert into public.knowledge (id, client_id, kind, title, file_name, path, text, chars) values
  ('seed-ctx-pb', cid, 'other', 'Client context', 'client-context.txt', 'none',
   'Presidio Bay Ventures and The Main Post (TMP). Brand color: maroon. Currently on the TriNet PEO; moving to Rippling (payroll) and IMA (benefits) with go-live April 1, 2027. Main concern raised: the new plan''s out-of-pocket maximum is roughly double, so a threshold HRA is proposed to bridge it. Has added several non-exempt employees; managers have an on-demand timekeeping training. Past work: a branded onboarding presentation, a California-compliant internship approach (paid arrangement when there is no academic credit), and a Washington internship offer letter template. Wants offer letters and agreements generated from their templates with a pre-start welcome email.', 0)
  on conflict (id) do nothing;
end $$;

-- character counts for the context notes
update public.knowledge set chars = length(text) where id like 'seed-ctx-%' and chars = 0;
