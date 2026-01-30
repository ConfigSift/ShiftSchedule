-- Add job_pay column to store per-job hourly pay rates as JSONB
-- Format: {"JobName": 15.50, "OtherJob": 18.00}

alter table if exists public.users
  add column if not exists job_pay jsonb not null default '{}'::jsonb;

comment on column public.users.job_pay is 'Per-job hourly pay rates as JSON object: {"JobName": rate}';
