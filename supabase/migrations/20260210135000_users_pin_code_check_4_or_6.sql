-- Allow 4 or 6 digit legacy pin_code values (normalize to 6 digits in app code)

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'users_pin_code_check') then
    alter table public.users drop constraint users_pin_code_check;
  end if;
  alter table public.users
    add constraint users_pin_code_check
    check (
      pin_code is null
      or pin_code ~ '^[0-9]{4}$'
      or pin_code ~ '^[0-9]{6}$'
    );
end $$;
