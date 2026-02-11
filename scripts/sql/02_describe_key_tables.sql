-- 02_describe_key_tables.sql
-- Discover key tables by column presence, then describe their columns.

-- A) Candidate tables by relevant column presence
select
  table_schema,
  table_name,
  array_agg(column_name order by ordinal_position) as columns
from information_schema.columns
where table_schema in ('public', 'auth')
  and column_name in (
    'organization_id',
    'auth_user_id',
    'role',
    'email',
    'real_email',
    'user_id',
    'passcode',
    'pin',
    'pin_code',
    'pin_hash',
    'password',
    'deleted_at',
    'is_deleted'
  )
group by table_schema, table_name
order by table_schema, table_name;

-- B) Detailed column info for key tables (heuristic by name)
with key_tables as (
  select distinct table_schema, table_name
  from information_schema.tables
  where table_schema in ('public', 'auth')
    and table_type = 'BASE TABLE'
    and (
      table_name in (
        'users',
        'organization_memberships',
        'organizations',
        'restaurants',
        'profiles',
        'staff',
        'employees',
        'memberships'
      )
      or table_name like '%organization%'
      or table_name like '%membership%'
      or table_name like '%user%'
      or table_name like '%profile%'
      or table_name like '%staff%'
    )
)
select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
join key_tables k
  on k.table_schema = c.table_schema
 and k.table_name = c.table_name
order by c.table_schema, c.table_name, c.ordinal_position;
