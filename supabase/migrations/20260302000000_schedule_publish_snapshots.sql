create table if not exists public.schedule_publish_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  scope text not null check (scope in ('day', 'week')),
  range_start date not null,
  range_end date not null,
  created_at timestamptz not null default now(),
  created_by_auth_user_id uuid null
);

create table if not exists public.schedule_publish_snapshot_shifts (
  snapshot_id uuid not null references public.schedule_publish_snapshots(id) on delete cascade,
  shift_id uuid not null,
  user_id uuid not null,
  shift_hash text not null,
  primary key (snapshot_id, shift_id)
);

