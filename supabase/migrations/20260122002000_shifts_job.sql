alter table if exists public.shifts
  add column if not exists job text;
