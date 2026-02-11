-- 07_membership_role_mismatch.sql
-- Compare users.role (profile) vs organization_memberships.role (authoritative).

select
  u.organization_id,
  u.id as user_id,
  u.auth_user_id,
  u.role as user_role,
  m.role as membership_role,
  u.email,
  u.real_email
from public.users u
join public.organization_memberships m
  on m.organization_id = u.organization_id
 and m.auth_user_id = u.auth_user_id
where u.role is not null
  and m.role is not null
  and lower(trim(u.role)) <> lower(trim(m.role))
order by u.organization_id, u.id;
