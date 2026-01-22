alter table if exists public.users
  add column if not exists hourly_pay numeric not null default 0;
