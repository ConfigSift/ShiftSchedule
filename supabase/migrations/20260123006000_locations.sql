create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists locations_org_idx on public.locations (organization_id);
create unique index if not exists locations_org_name_idx on public.locations (organization_id, lower(name));

alter table public.locations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'locations' and policyname = 'locations_select'
  ) then
    create policy locations_select on public.locations
      for select
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = locations.organization_id
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'locations' and policyname = 'locations_write'
  ) then
    create policy locations_write on public.locations
      for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = locations.organization_id
            and upper(coalesce(u.role, '')) in ('ADMIN', 'MANAGER')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = locations.organization_id
            and upper(coalesce(u.role, '')) in ('ADMIN', 'MANAGER')
        )
      );
  end if;
end $$;

alter table if exists public.shifts
  add column if not exists location_id uuid references public.locations(id) on delete set null;
