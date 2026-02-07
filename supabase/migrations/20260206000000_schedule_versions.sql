-- Schedule versioning: one draft + one published per org/week.
-- Introduces schedule_versions table, backfills from existing shifts,
-- and replaces shifts_unique_weekly with a version-aware unique index.

----------------------------------------------------------------------
-- 1. schedule_versions table
----------------------------------------------------------------------
create table if not exists public.schedule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  week_start_date date not null,
  schedule_state text not null default 'draft',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  created_by uuid
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'schedule_versions_state_check'
  ) then
    alter table public.schedule_versions
      add constraint schedule_versions_state_check
      check (schedule_state in ('draft', 'published'));
  end if;
end $$;

-- At most one draft and one published per org/week
create unique index if not exists schedule_versions_one_draft
  on public.schedule_versions (organization_id, week_start_date)
  where schedule_state = 'draft';

create unique index if not exists schedule_versions_one_published
  on public.schedule_versions (organization_id, week_start_date)
  where schedule_state = 'published';

-- General lookup index
create index if not exists schedule_versions_org_week_idx
  on public.schedule_versions (organization_id, week_start_date);

----------------------------------------------------------------------
-- 2. shifts.schedule_version_id FK
----------------------------------------------------------------------
alter table public.shifts
  add column if not exists schedule_version_id uuid
    references public.schedule_versions(id) on delete set null;

create index if not exists shifts_schedule_version_idx
  on public.shifts (schedule_version_id);

----------------------------------------------------------------------
-- 3. RLS on schedule_versions
----------------------------------------------------------------------
alter table public.schedule_versions enable row level security;

do $$ begin
  -- Org members can read all versions (draft + published)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_versions'
      and policyname = 'schedule_versions_select'
  ) then
    create policy schedule_versions_select
      on public.schedule_versions for select
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = schedule_versions.organization_id
        )
      );
  end if;

  -- Only managers can create / update / delete versions
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_versions'
      and policyname = 'schedule_versions_write'
  ) then
    create policy schedule_versions_write
      on public.schedule_versions for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = schedule_versions.organization_id
            and upper(coalesce(u.account_type, u.role, '')) in ('ADMIN', 'MANAGER')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = schedule_versions.organization_id
            and upper(coalesce(u.account_type, u.role, '')) in ('ADMIN', 'MANAGER')
        )
      );
  end if;
end $$;

----------------------------------------------------------------------
-- 4. Backfill schedule_versions from existing shifts
----------------------------------------------------------------------

-- Temporary helper: compute the week-start date for a given date.
-- starts_on: 0 = Sunday, 1 = Monday  (mirrors JS getDay() convention)
create or replace function public._tmp_week_start(d date, starts_on int)
returns date language sql immutable as $$
  select d - ((extract(dow from d)::int - starts_on + 7) % 7);
$$;

-- Create one schedule_version per (org, computed week_start, schedule_state)
insert into public.schedule_versions
  (organization_id, week_start_date, schedule_state, published_at)
select distinct
  s.organization_id,
  public._tmp_week_start(
    s.shift_date,
    case
      when (select svs.week_start_day
            from public.schedule_view_settings svs
            where svs.organization_id = s.organization_id
            limit 1) = 'monday'
      then 1 else 0
    end
  ),
  s.schedule_state,
  case when s.schedule_state = 'published' then now() else null end
from public.shifts s
where s.schedule_state is not null;

-- Link each existing shift to its schedule_version
update public.shifts s
set schedule_version_id = sv.id
from public.schedule_versions sv
where s.organization_id = sv.organization_id
  and s.schedule_state = sv.schedule_state
  and sv.week_start_date = public._tmp_week_start(
        s.shift_date,
        case
          when (select svs.week_start_day
                from public.schedule_view_settings svs
                where svs.organization_id = s.organization_id
                limit 1) = 'monday'
          then 1 else 0
        end
      )
  and s.schedule_version_id is null;

-- Clean up temp function
drop function if exists public._tmp_week_start(date, int);

----------------------------------------------------------------------
-- 5. Replace shifts uniqueness strategy
----------------------------------------------------------------------

-- Drop old index that keyed on schedule_state directly
drop index if exists public.shifts_unique_weekly;

-- New: unique per version, excludes tombstones (is_blocked) and
-- un-versioned legacy rows (schedule_version_id IS NULL)
create unique index if not exists shifts_unique_per_version
  on public.shifts (schedule_version_id, user_id, shift_date, start_time, end_time)
  where schedule_version_id is not null and is_blocked = false;
