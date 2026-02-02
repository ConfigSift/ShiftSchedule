-- Employee auth + multi-restaurant support additions (non-breaking)

alter table if exists public.organizations
  add column if not exists restaurant_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_restaurant_code_unique'
  ) then
    create unique index if not exists organizations_restaurant_code_unique
      on public.organizations (restaurant_code);
  end if;
end $$;

alter table if exists public.users
  add column if not exists employee_number int,
  add column if not exists real_email text,
  add column if not exists role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_employee_number_range'
  ) then
    alter table public.users
      add constraint users_employee_number_range
      check (employee_number is null or (employee_number between 1 and 9999));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_indexes where indexname = 'users_org_employee_number_unique'
  ) then
    create unique index users_org_employee_number_unique
      on public.users (organization_id, employee_number)
      where employee_number is not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_indexes where indexname = 'users_org_real_email_unique'
  ) then
    create unique index users_org_real_email_unique
      on public.users (organization_id, lower(real_email))
      where real_email is not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role is null or upper(role) in ('ADMIN','MANAGER','EMPLOYEE'));
  end if;
end $$;

update public.users
set role = coalesce(role, account_type)
where role is null;

