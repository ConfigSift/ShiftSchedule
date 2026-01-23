create table if not exists public.shift_exchange_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  requested_by_auth_user_id uuid not null,
  status text not null default 'OPEN',
  claimed_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists shift_exchange_org_idx on public.shift_exchange_requests (organization_id);
create unique index if not exists shift_exchange_open_unique on public.shift_exchange_requests (shift_id)
  where status = 'OPEN';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'shift_exchange_status_check'
  ) then
    alter table public.shift_exchange_requests
      add constraint shift_exchange_status_check
      check (status in ('OPEN', 'CLAIMED', 'CANCELLED'));
  end if;
end $$;

alter table public.shift_exchange_requests enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shift_exchange_requests' and policyname = 'shift_exchange_select'
  ) then
    create policy shift_exchange_select on public.shift_exchange_requests
      for select
      using (
        (
          status = 'OPEN'
          and exists (
            select 1 from public.users u
            where u.auth_user_id = auth.uid()
              and u.organization_id = shift_exchange_requests.organization_id
          )
        )
        or requested_by_auth_user_id = auth.uid()
        or exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = shift_exchange_requests.organization_id
            and upper(coalesce(u.role, '')) in ('ADMIN', 'MANAGER')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shift_exchange_requests' and policyname = 'shift_exchange_insert'
  ) then
    create policy shift_exchange_insert on public.shift_exchange_requests
      for insert
      with check (
        requested_by_auth_user_id = auth.uid()
        and exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = shift_exchange_requests.organization_id
        )
        and exists (
          select 1
          from public.shifts s
          join public.users u2 on u2.id = s.user_id
          where s.id = shift_exchange_requests.shift_id
            and s.organization_id = shift_exchange_requests.organization_id
            and u2.auth_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shift_exchange_requests' and policyname = 'shift_exchange_update'
  ) then
    create policy shift_exchange_update on public.shift_exchange_requests
      for update
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = shift_exchange_requests.organization_id
            and upper(coalesce(u.role, '')) in ('ADMIN', 'MANAGER')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = shift_exchange_requests.organization_id
            and upper(coalesce(u.role, '')) in ('ADMIN', 'MANAGER')
        )
      );
  end if;
end $$;
