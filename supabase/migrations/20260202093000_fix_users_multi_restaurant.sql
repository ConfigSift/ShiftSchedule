/*
  Fix public.users constraints for multi-restaurant employees.
  - Remove global uniqueness on auth_user_id/email/real_email/employee_number.
  - Normalize real_email to lowercase and backfill from email when missing.
  - Enforce per-organization uniqueness for auth_user_id, real_email (case-insensitive), and employee_number.
*/

-- Backfill and normalize emails
UPDATE public.users
SET real_email = lower(email)
WHERE real_email IS NULL
  AND email IS NOT NULL;

UPDATE public.users
SET real_email = lower(real_email)
WHERE real_email IS NOT NULL;

-- Drop global unique constraints that block multi-restaurant profiles
DO $$
DECLARE
  constraint_name text;
  auth_attnum int;
  org_attnum int;
  email_attnum int;
  real_email_attnum int;
  employee_attnum int;
BEGIN
  SELECT attnum INTO auth_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'auth_user_id'
    AND NOT attisdropped;

  SELECT attnum INTO org_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'organization_id'
    AND NOT attisdropped;

  SELECT attnum INTO email_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'email'
    AND NOT attisdropped;

  SELECT attnum INTO real_email_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'real_email'
    AND NOT attisdropped;

  SELECT attnum INTO employee_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'employee_number'
    AND NOT attisdropped;

  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.users'::regclass
      AND con.contype = 'u'
      AND (
        (auth_attnum IS NOT NULL AND auth_attnum = ANY (con.conkey)
          AND (org_attnum IS NULL OR NOT org_attnum = ANY (con.conkey)))
        OR (email_attnum IS NOT NULL AND email_attnum = ANY (con.conkey)
          AND (org_attnum IS NULL OR NOT org_attnum = ANY (con.conkey)))
        OR (real_email_attnum IS NOT NULL AND real_email_attnum = ANY (con.conkey)
          AND (org_attnum IS NULL OR NOT org_attnum = ANY (con.conkey)))
        OR (employee_attnum IS NOT NULL AND employee_attnum = ANY (con.conkey)
          AND (org_attnum IS NULL OR NOT org_attnum = ANY (con.conkey)))
      )
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

-- Drop global unique indexes that are not tied to constraints
DO $$
DECLARE
  idx record;
  auth_attnum int;
  org_attnum int;
  email_attnum int;
  real_email_attnum int;
  employee_attnum int;
  has_org boolean;
  has_auth boolean;
  has_email boolean;
  has_real_email boolean;
  has_employee boolean;
BEGIN
  SELECT attnum INTO auth_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'auth_user_id'
    AND NOT attisdropped;

  SELECT attnum INTO org_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'organization_id'
    AND NOT attisdropped;

  SELECT attnum INTO email_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'email'
    AND NOT attisdropped;

  SELECT attnum INTO real_email_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'real_email'
    AND NOT attisdropped;

  SELECT attnum INTO employee_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass
    AND attname = 'employee_number'
    AND NOT attisdropped;

  FOR idx IN
    SELECT i.indexrelid,
           c.relname AS index_name,
           pg_get_indexdef(i.indexrelid) AS indexdef,
           i.indkey
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND i.indisunique
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid
      )
  LOOP
    has_org := org_attnum IS NOT NULL AND org_attnum = ANY (idx.indkey);
    has_auth := auth_attnum IS NOT NULL AND auth_attnum = ANY (idx.indkey);
    has_email := email_attnum IS NOT NULL AND email_attnum = ANY (idx.indkey);
    has_real_email := real_email_attnum IS NOT NULL AND real_email_attnum = ANY (idx.indkey);
    has_employee := employee_attnum IS NOT NULL AND employee_attnum = ANY (idx.indkey);

    IF NOT has_org AND (
      has_auth
      OR has_email
      OR has_real_email
      OR has_employee
      OR idx.indexdef ILIKE '%auth_user_id%'
      OR idx.indexdef ILIKE '%lower(real_email)%'
      OR idx.indexdef ILIKE '%real_email%'
      OR idx.indexdef ILIKE '%email%'
      OR idx.indexdef ILIKE '%employee_number%'
    ) THEN
      EXECUTE format('DROP INDEX IF EXISTS %I.%I', 'public', idx.index_name);
    END IF;
  END LOOP;
END $$;

-- Enforce per-organization uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS users_org_auth_user_id_unique
  ON public.users (organization_id, auth_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS users_org_real_email_unique
  ON public.users (organization_id, lower(real_email));

CREATE UNIQUE INDEX IF NOT EXISTS users_org_employee_number_unique
  ON public.users (organization_id, employee_number);
