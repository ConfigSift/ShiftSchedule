-- Add week_start_day to schedule view settings
alter table public.schedule_view_settings
  add column if not exists week_start_day text not null default 'sunday';

update public.schedule_view_settings
  set week_start_day = 'sunday'
  where week_start_day is null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'schedule_view_settings_week_start_day_check'
  ) then
    alter table public.schedule_view_settings
      add constraint schedule_view_settings_week_start_day_check
      check (week_start_day in ('sunday', 'monday'));
  end if;
end $$;
