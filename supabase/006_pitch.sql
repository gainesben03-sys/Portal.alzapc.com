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
