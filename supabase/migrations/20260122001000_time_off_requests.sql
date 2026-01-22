create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  requester_auth_user_id uuid,
  auth_user_id uuid,
  requester_user_id uuid,
  start_date date not null,
  end_date date not null,
  reason text,
  note text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  manager_note text
);

alter table if exists public.time_off_requests enable row level security;

alter table if exists public.time_off_requests
  add column if not exists organization_id uuid,
  add column if not exists user_id uuid,
  add column if not exists requester_auth_user_id uuid,
  add column if not exists auth_user_id uuid,
  add column if not exists requester_user_id uuid,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists reason text,
  add column if not exists note text,
  add column if not exists status text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists manager_note text;

alter table if exists public.time_off_requests
  alter column status set default 'PENDING',
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'time_off_requests_status_check'
  ) then
    alter table public.time_off_requests
      add constraint time_off_requests_status_check
      check (status in ('PENDING','APPROVED','DENIED','CANCELLED'));
  end if;
end $$;

alter table if exists public.shifts
  add column if not exists is_blocked boolean not null default false;

drop policy if exists "Time off readable by requester or managers" on public.time_off_requests;
create policy "Time off readable by requester or managers"
  on public.time_off_requests
  for select
  using (
    auth.uid() = requester_auth_user_id
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = time_off_requests.organization_id
        and upper(coalesce(u.account_type, u.role, '')) in ('ADMIN', 'MANAGER')
    )
  );

drop policy if exists "Time off insertable by requester" on public.time_off_requests;
create policy "Time off insertable by requester"
  on public.time_off_requests
  for insert
  with check (
    auth.uid() = requester_auth_user_id
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = time_off_requests.organization_id
    )
  );

drop policy if exists "Time off updatable by requester" on public.time_off_requests;
create policy "Time off updatable by requester"
  on public.time_off_requests
  for update
  using (auth.uid() = requester_auth_user_id);

drop policy if exists "Time off updatable by managers" on public.time_off_requests;
create policy "Time off updatable by managers"
  on public.time_off_requests
  for update
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = time_off_requests.organization_id
        and upper(coalesce(u.account_type, u.role, '')) in ('ADMIN', 'MANAGER')
    )
  );
