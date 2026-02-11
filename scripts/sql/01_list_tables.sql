-- 01_list_tables.sql
-- List base tables and views in public/auth schemas (deterministic ordering)

select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema in ('public', 'auth')
order by table_schema, table_name, table_type;
