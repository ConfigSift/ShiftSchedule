-- Add coverage enable toggle and per-hour minimum staffing map to schedule_view_settings
alter table public.schedule_view_settings
  add column if not exists coverage_enabled boolean not null default false,
  add column if not exists min_staff_by_hour jsonb not null default '{}';
