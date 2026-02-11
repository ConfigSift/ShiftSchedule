-- Ensure stable auth linkage for user profiles

create unique index if not exists users_org_auth_user_id_unique
  on public.users (organization_id, auth_user_id)
  where auth_user_id is not null;

create unique index if not exists users_org_real_email_unique
  on public.users (organization_id, lower(real_email))
  where real_email is not null;

comment on column public.users.auth_user_id is
  'Supabase auth user id; should be set and stable. Unique per organization.';
