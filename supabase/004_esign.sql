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
