-- Business hour ranges
create table if not exists public.business_hour_ranges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  day_of_week int not null,
  open_time time not null,
  close_time time not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_hour_ranges_org_idx on public.business_hour_ranges (organization_id);
create index if not exists business_hour_ranges_org_day_idx on public.business_hour_ranges (organization_id, day_of_week);

-- Core hour ranges
create table if not exists public.core_hour_ranges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  day_of_week int not null,
  open_time time not null,
  close_time time not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists core_hour_ranges_org_idx on public.core_hour_ranges (organization_id);
create index if not exists core_hour_ranges_org_day_idx on public.core_hour_ranges (organization_id, day_of_week);

-- Migrate existing single-range data into ranges tables
insert into public.business_hour_ranges (organization_id, day_of_week, open_time, close_time, enabled, sort_order)
select bh.organization_id, bh.day_of_week, bh.open_time, bh.close_time, bh.enabled, 0
from public.business_hours bh
where bh.open_time is not null
  and bh.close_time is not null
  and not exists (
    select 1 from public.business_hour_ranges bhr
    where bhr.organization_id = bh.organization_id
      and bhr.day_of_week = bh.day_of_week
      and bhr.open_time = bh.open_time
      and bhr.close_time = bh.close_time
  );

insert into public.core_hour_ranges (organization_id, day_of_week, open_time, close_time, enabled, sort_order)
select ch.organization_id, ch.day_of_week, ch.open_time, ch.close_time, ch.enabled, 0
from public.core_hours ch
where ch.open_time is not null
  and ch.close_time is not null
  and not exists (
    select 1 from public.core_hour_ranges chr
    where chr.organization_id = ch.organization_id
      and chr.day_of_week = ch.day_of_week
      and chr.open_time = ch.open_time
      and chr.close_time = ch.close_time
  );

alter table public.business_hour_ranges enable row level security;
alter table public.core_hour_ranges enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_hour_ranges' and policyname = 'business_hour_ranges_select') then
    create policy business_hour_ranges_select on public.business_hour_ranges for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = business_hour_ranges.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_hour_ranges' and policyname = 'business_hour_ranges_write') then
    create policy business_hour_ranges_write on public.business_hour_ranges for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = business_hour_ranges.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = business_hour_ranges.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'core_hour_ranges' and policyname = 'core_hour_ranges_select') then
    create policy core_hour_ranges_select on public.core_hour_ranges for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = core_hour_ranges.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'core_hour_ranges' and policyname = 'core_hour_ranges_write') then
    create policy core_hour_ranges_write on public.core_hour_ranges for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = core_hour_ranges.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = core_hour_ranges.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;
