-- Organization memberships (multi-restaurant access)

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null,
  user_id uuid null references public.users(id) on delete set null,
  role text not null default 'employee',
  created_at timestamptz default now(),
  unique (organization_id, auth_user_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organization_memberships_role_check'
  ) then
    alter table public.organization_memberships
      add constraint organization_memberships_role_check
      check (role in ('admin','manager','employee'));
  end if;
end $$;

alter table if exists public.organization_memberships enable row level security;

drop policy if exists "Members can read own memberships" on public.organization_memberships;
create policy "Members can read own memberships"
  on public.organization_memberships
  for select
  using (auth_user_id = auth.uid());

drop policy if exists "Admins/managers can manage memberships" on public.organization_memberships;
create policy "Admins/managers can manage memberships"
  on public.organization_memberships
  for all
  using (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = organization_memberships.organization_id
        and m.auth_user_id = auth.uid()
        and m.role in ('admin','manager')
    )
  )
  with check (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = organization_memberships.organization_id
        and m.auth_user_id = auth.uid()
        and m.role in ('admin','manager')
    )
  );

insert into public.organization_memberships (organization_id, auth_user_id, user_id, role)
select
  organization_id,
  auth_user_id,
  id as user_id,
  lower(coalesce(role, 'employee')) as role
from public.users
where auth_user_id is not null
on conflict (organization_id, auth_user_id)
do update set
  user_id = excluded.user_id,
  role = excluded.role;

