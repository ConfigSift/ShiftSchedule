-- Enforce per-organization email uniqueness (case-insensitive, trimmed)
-- and align pin_code constraint with 4-digit PINs.

-- Ensure pin_code column exists
alter table if exists public.users
  add column if not exists pin_code text;

-- Replace legacy pin_code check (6 digits) with 4 digits
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'users_pin_code_check') then
    alter table public.users drop constraint users_pin_code_check;
  end if;
  alter table public.users
    add constraint users_pin_code_check
    check (pin_code is null or pin_code ~ '^[0-9]{4}$');
end $$;

-- Unique per org for normalized emails
create unique index if not exists users_org_real_email_norm_unique
  on public.users (organization_id, lower(btrim(real_email)))
  where real_email is not null and btrim(real_email) <> '';

create unique index if not exists users_org_email_norm_unique
  on public.users (organization_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';
