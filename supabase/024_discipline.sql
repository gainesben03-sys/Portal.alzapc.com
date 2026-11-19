-- Discipline documentation: write-ups, email recaps and file notes, plus discipline templates.
-- Private to each company's executives and Ben. The portal reads and writes these through the
-- server, which checks who's asking; the table itself is Ben-only.
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run more than once.

-- "Discipline template" as a document type in setup
alter table public.knowledge drop constraint if exists knowledge_kind_check;
alter table public.knowledge add constraint knowledge_kind_check check (kind in ('handbook', 'policy', 'template', 'discipline', 'letterhead', 'other'));

create table if not exists public.discipline_records (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discipline_client_idx on public.discipline_records (client_id, created_at desc);
create index if not exists discipline_person_idx on public.discipline_records (client_id, (data ->> 'personId'));
alter table public.discipline_records enable row level security;
drop policy if exists discipline_all on public.discipline_records;
create policy discipline_all on public.discipline_records for all using (public.is_advisor()) with check (public.is_advisor());
drop trigger if exists discipline_touch on public.discipline_records;
create trigger discipline_touch before update on public.discipline_records for each row execute function public.touch();
