-- 05_rls_policies.sql
-- RLS enabled tables and policies in public/auth schemas.

-- A) Tables with RLS flags
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth')
  and c.relkind = 'r'
order by schema_name, table_name;

-- B) Policies
select
  schemaname as schema_name,
  tablename as table_name,
  policyname as policy_name,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'auth')
order by schema_name, table_name, policy_name;
