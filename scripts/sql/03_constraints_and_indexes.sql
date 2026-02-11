-- 03_constraints_and_indexes.sql
-- List constraints and indexes for public/auth schemas.

-- A) Constraints (PK, FK, UNIQUE, CHECK, EXCLUDE)
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth')
order by schema_name, table_name, constraint_type, constraint_name;

-- B) Indexes
select
  schemaname as schema_name,
  tablename as table_name,
  indexname as index_name,
  indexdef as index_definition
from pg_indexes
where schemaname in ('public', 'auth')
order by schema_name, table_name, index_name;
