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
