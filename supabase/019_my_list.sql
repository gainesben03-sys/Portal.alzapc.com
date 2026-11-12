-- My list: each person's private checklist. Only the person themselves can read or change
-- their items: not their company, not Ben. Reminder emails are sent by the server.
-- Safe to run more than once.
create table if not exists public.my_list (
  id text primary key,
  email text not null,
  client_id text references public.clients(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  done_at timestamptz,
  due date,
  remind_at timestamptz,
  scheduled_id text,      -- the reminder email waiting to go out
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists my_list_email_idx on public.my_list (lower(email), created_at desc);
create index if not exists my_list_remind_idx on public.my_list (remind_at) where done = false and reminded_at is null;
alter table public.my_list enable row level security;
drop policy if exists my_list_own on public.my_list;
create policy my_list_own on public.my_list for all
  using (lower(email) = public.me_email())
  with check (lower(email) = public.me_email());
drop trigger if exists my_list_touch on public.my_list;
create trigger my_list_touch before update on public.my_list for each row execute function public.touch();
