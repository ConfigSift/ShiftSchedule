# Staff/Auth Schema Audit (Phase 1)

This is a **read‑only** schema audit package. It does not change data or business logic.  
Run the SQL scripts in `scripts/sql/` (in order) and paste the requested outputs back for Phase 2.

## Scope
We need authoritative answers for:
- **Profile table** (org‑scoped staff profile, usually `public.users`)
- **Membership table** (auth user ↔ org role, usually `public.organization_memberships`)
- **Organizations/restaurants**
- **Supabase Auth identity** (`auth.users`)
- **PIN/passcode storage** (if any DB columns exist)
- **RLS policies** that could block admin actions

## What These Scripts Will Tell Us
1. **Tables & views** in `public` and `auth` schemas.  
2. **Key tables & columns** (by name and by column presence).  
3. **Constraints & indexes** (PK/unique/foreign keys).  
4. **Foreign key relationships** (how tables link).  
5. **RLS policies** and which tables have RLS enabled.  
6. **Duplicate detection** (per‑org email/auth_user_id duplicates, orphaned rows).  
7. **Role mismatches** between `users.role` and `organization_memberships.role`.  
8. **PIN/passcode storage** (DB columns/functions that contain pin/passcode/password).

## Initial Findings (Based on Repo Migrations/Code)
> These are **expectations** based on repo migrations; confirm with SQL output.

- **Membership role is the source of truth for permissions.**  
  Code uses `organization_memberships.role` for auth checks and routing; `users.role` is treated as legacy/display.
- **Uniqueness constraints are expected** (via migrations):
  - `users_org_real_email_unique` → `(organization_id, lower(real_email))`
  - `users_org_auth_user_id_unique` → `(organization_id, auth_user_id) WHERE auth_user_id IS NOT NULL`
  - `organization_memberships` should already enforce `(organization_id, auth_user_id)` uniqueness
- **PIN appears to be stored only in Supabase Auth** (password hash) and not in a public table.  
  Confirm with `08_pin_storage_audit.sql`.
- **Soft deletes are unclear.**  
  If no `deleted_at` / `is_deleted` columns exist on `public.users`, then deletes are hard deletes and “re‑add email” must reuse `auth.users` identity safely.
- **Blank UUID errors** (`invalid input syntax for type uuid: ""`) likely originate from client code sending an empty string.  
  The SQL checks for null/missing org/id will help confirm DB health.

## Invariants We Must Enforce (Phase 2)
1. **Per‑org uniqueness**
   - Only one profile row per `(organization_id, lower(real_email))`.
   - Only one profile row per `(organization_id, auth_user_id)` when linked.
   - Only one membership row per `(organization_id, auth_user_id)`.
2. **Email change**
   - Update **only** the auth user linked to that profile (`auth_user_id`).
   - If the new email is owned by a different auth user → **409 conflict**.
   - Never change PIN/password as part of email change.
3. **PIN/passcode**
   - `set-passcode` must operate on the **linked auth user only**.
   - Never select/update auth users by email alone.
4. **Re‑add email**
   - If an auth user exists with that email, link only if safe and explicit.
   - Do not reset PIN unless explicitly provided.
5. **Permissions**
   - Use membership role (not profile role) consistently everywhere.

## RUN THESE QUERIES
Run the scripts in order and paste back outputs from **02, 03, 04, 06, 08**.

1) `scripts/sql/01_list_tables.sql`  
2) `scripts/sql/02_describe_key_tables.sql`  ← **paste output**  
3) `scripts/sql/03_constraints_and_indexes.sql`  ← **paste output**  
4) `scripts/sql/04_foreign_keys.sql`  ← **paste output**  
5) `scripts/sql/05_rls_policies.sql`  
6) `scripts/sql/06_duplicate_detection.sql`  ← **paste output**  
7) `scripts/sql/07_membership_role_mismatch.sql`  
8) `scripts/sql/08_pin_storage_audit.sql`  ← **paste output**

When you paste results, also include the **Supabase project** or database name if available, so we can confirm schema context.
