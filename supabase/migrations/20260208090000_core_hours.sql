-- Core hours
create table if not exists public.core_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  day_of_week int not null,
  open_time time,
  close_time time,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists core_hours_org_idx on public.core_hours (organization_id);
create unique index if not exists core_hours_org_day_unique on public.core_hours (organization_id, day_of_week);

alter table public.core_hours enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'core_hours' and policyname = 'core_hours_select') then
    create policy core_hours_select on public.core_hours for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = core_hours.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'core_hours' and policyname = 'core_hours_write') then
    create policy core_hours_write on public.core_hours for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = core_hours.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = core_hours.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;
