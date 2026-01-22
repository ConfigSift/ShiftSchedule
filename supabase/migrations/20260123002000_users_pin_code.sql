alter table if exists public.users
  add column if not exists pin_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_pin_code_check'
  ) then
    alter table public.users
      add constraint users_pin_code_check
      check (pin_code is null or pin_code ~ '^[0-9]{6}$');
  end if;
end $$;
