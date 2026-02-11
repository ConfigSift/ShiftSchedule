-- Org-scoped PIN storage (hashed) + auth_user_id uniqueness per org

alter table if exists public.users
  add column if not exists pin_hash text,
  add column if not exists pin_updated_at timestamptz,
  add column if not exists pin_version int default 1;

create unique index if not exists users_org_auth_user_unique
  on public.users (organization_id, auth_user_id)
  where auth_user_id is not null;
