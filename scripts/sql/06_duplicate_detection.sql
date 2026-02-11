-- 06_duplicate_detection.sql
-- Duplicate detection and orphan checks for staff identity tables.
-- NOTE: If any referenced table does not exist in your schema, comment out that section.

-- A) Duplicate real_email within same organization (users)
select
  organization_id,
  lower(real_email) as real_email,
  count(*) as row_count,
  array_agg(id order by id) as user_ids
from public.users
where real_email is not null and trim(real_email) <> ''
group by organization_id, lower(real_email)
having count(*) > 1
order by row_count desc, organization_id;

-- B) Duplicate email within same organization (users.email)
select
  organization_id,
  lower(email) as email,
  count(*) as row_count,
  array_agg(id order by id) as user_ids
from public.users
where email is not null and trim(email) <> ''
group by organization_id, lower(email)
having count(*) > 1
order by row_count desc, organization_id;

-- C) Duplicate auth_user_id within same organization (users)
select
  organization_id,
  auth_user_id,
  count(*) as row_count,
  array_agg(id order by id) as user_ids
from public.users
where auth_user_id is not null
group by organization_id, auth_user_id
having count(*) > 1
order by row_count desc, organization_id;

-- D) Duplicate membership rows (organization_memberships)
select
  organization_id,
  auth_user_id,
  count(*) as row_count
from public.organization_memberships
group by organization_id, auth_user_id
having count(*) > 1
order by row_count desc, organization_id;

-- E) Orphaned users.auth_user_id (no corresponding auth.users)
select
  u.id,
  u.organization_id,
  u.auth_user_id
from public.users u
left join auth.users au on au.id = u.auth_user_id
where u.auth_user_id is not null and au.id is null
order by u.organization_id, u.id;

-- F) Orphaned organization_memberships.auth_user_id (no corresponding auth.users)
select
  m.organization_id,
  m.auth_user_id
from public.organization_memberships m
left join auth.users au on au.id = m.auth_user_id
where m.auth_user_id is not null and au.id is null
order by m.organization_id;

-- G) Users with missing org or id (should not exist)
select
  id,
  organization_id,
  email,
  real_email
from public.users
where id is null
   or organization_id is null;
