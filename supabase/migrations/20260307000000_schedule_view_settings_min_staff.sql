-- Add minimum staff per hour threshold to schedule view settings
alter table public.schedule_view_settings
  add column if not exists min_staff_per_hour int not null default 5;
