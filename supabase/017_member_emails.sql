-- Portal access: match emails no matter how they were capitalized when someone was added.
-- Safe to run more than once.
update public.members m set email = lower(m.email)
where m.email <> lower(m.email)
  and not exists (select 1 from public.members x where x.client_id = m.client_id and x.email = lower(m.email));

create or replace function public.is_member(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where client_id = cid and lower(email) = public.me_email())
$$;

create or replace function public.is_exec(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where client_id = cid and lower(email) = public.me_email() and access = 'exec')
$$;
