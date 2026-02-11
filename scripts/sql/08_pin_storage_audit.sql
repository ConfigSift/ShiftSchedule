-- 08_pin_storage_audit.sql
-- Identify where PIN/passcode might be stored in DB schema.

-- A) Columns with pin/passcode/password-ish names
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema in ('public', 'auth')
  and (
    column_name ilike '%pin%'
    or column_name ilike '%passcode%'
    or column_name ilike '%password%'
  )
order by table_schema, table_name, ordinal_position;

-- B) Search for relevant functions/triggers by name
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'auth')
  and (
    p.proname ilike '%pin%'
    or p.proname ilike '%passcode%'
    or p.proname ilike '%password%'
  )
order by schema_name, function_name;
