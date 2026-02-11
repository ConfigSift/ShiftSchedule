-- 04_foreign_keys.sql
-- List foreign keys across public/auth schemas.

select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as fk_name,
  pg_get_constraintdef(con.oid) as definition,
  n2.nspname as referenced_schema,
  c2.relname as referenced_table
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_class c2 on c2.oid = con.confrelid
join pg_namespace n2 on n2.oid = c2.relnamespace
where con.contype = 'f'
  and n.nspname in ('public', 'auth')
order by schema_name, table_name, fk_name;
