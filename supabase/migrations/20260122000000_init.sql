create extension if not exists "pgcrypto";

alter table if exists public.organizations enable row level security;
alter table if exists public.users enable row level security;
alter table if exists public.shifts enable row level security;

alter table if exists public.users
  add column if not exists full_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists account_type text not null default 'EMPLOYEE',
  add column if not exists jobs text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_type_check'
  ) then
    alter table public.users
      add constraint users_account_type_check
      check (account_type in ('ADMIN','MANAGER','EMPLOYEE'));
  end if;
end $$;

drop policy if exists "Organizations readable by members" on public.organizations;
create policy "Organizations readable by members"
  on public.organizations
  for select
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = organizations.id
    )
  );

drop policy if exists "Organizations insertable by managers" on public.organizations;
create policy "Organizations insertable by managers"
  on public.organizations
  for insert
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and upper(coalesce(u.account_type, '')) in ('ADMIN', 'MANAGER')
    )
  );

drop policy if exists "Users readable by members" on public.users;
create policy "Users readable by members"
  on public.users
  for select
  using (
    auth.uid() = auth_user_id
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = users.organization_id
    )
  );

drop policy if exists "Users insertable by owner" on public.users;
create policy "Users insertable by owner"
  on public.users
  for insert
  with check (auth.uid() = auth_user_id);

drop policy if exists "Users insertable by managers" on public.users;
create policy "Users insertable by managers"
  on public.users
  for insert
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = users.organization_id
        and upper(coalesce(u.account_type, '')) in ('ADMIN', 'MANAGER')
    )
  );

drop policy if exists "Users updatable by managers" on public.users;
create policy "Users updatable by managers"
  on public.users
  for update
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = users.organization_id
        and upper(coalesce(u.account_type, '')) in ('ADMIN', 'MANAGER')
    )
  );

drop policy if exists "Users deletable by managers" on public.users;
create policy "Users deletable by managers"
  on public.users
  for delete
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = users.organization_id
        and upper(coalesce(u.account_type, '')) in ('ADMIN', 'MANAGER')
    )
  );

drop policy if exists "Users updatable by owner" on public.users;
create policy "Users updatable by owner"
  on public.users
  for update
  using (auth.uid() = auth_user_id);

drop policy if exists "Shifts readable by org members" on public.shifts;
create policy "Shifts readable by org members"
  on public.shifts
  for select
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = shifts.organization_id
    )
  );

drop policy if exists "Shifts writable by managers" on public.shifts;
create policy "Shifts writable by managers"
  on public.shifts
  for all
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = shifts.organization_id
        and upper(coalesce(u.account_type, '')) in ('ADMIN', 'MANAGER')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = shifts.organization_id
        and upper(coalesce(u.account_type, '')) in ('ADMIN', 'MANAGER')
    )
  );

create or replace function public.has_manager()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where upper(coalesce(account_type, '')) in ('ADMIN', 'MANAGER')
  );
$$;

grant execute on function public.has_manager() to anon, authenticated;
