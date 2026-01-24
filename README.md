## Supabase Quickstart (PowerShell)

```powershell
npm install
```

Create `.env.local` (no quotes required; quotes are ok if you include them):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=StrongPassword123!
```

Vercel environment variables (set these in Project Settings):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

After editing `.env.local`, restart the dev server to pick up changes.

Quick reset (clear `.next` and restart):

```powershell
Remove-Item -Recurse -Force .\.next -ErrorAction SilentlyContinue
pnpm dev
```

Reset the database (applies migrations):

```powershell
supabase db reset
```

## Deploy Checklist

- Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Apply Supabase migrations (CLI `supabase db push` or SQL Editor via `/debug/db`).
- Confirm `/debug/db` shows ALL PASS.

## Applying Supabase migrations

Use one of the following:

CLI (recommended for local dev):
1. `supabase db reset` to recreate and apply all migrations.
2. Or run `supabase db push` to apply new migrations to an existing database.

SQL Editor (no CLI):
1. Run the app: `pnpm dev`
2. Visit `http://localhost:3000/debug/db`
3. Copy the SQL blocks shown for any missing tables/columns.
4. Paste into Supabase Dashboard -> SQL Editor -> Run.

## Windows Build Note (EPERM)

If you see `Error: spawn EPERM` when running `pnpm run build` on Windows, it is typically caused by PowerShell execution policy, antivirus, or Windows Controlled Folder Access when the repo is under Desktop/Documents. Follow the troubleshooting guide above.

- Move the repo to a non-protected folder (e.g. `C:\dev\shiftschedule`).
- Allow `node.exe` and `pnpm` through Controlled Folder Access.
- Re-run `pnpm run build` from a normal Command Prompt (cmd.exe).

Seed the default restaurant (SKYBIRD / RST-K7M2Q9PJ):

```powershell
npm run seed:restaurant
```

Seed the initial admin account:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://<your-project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
pnpm seed:initial-admin
```

Run the dev server:

```powershell
pnpm dev
```

Login (seeded admin):
- Restaurant ID: RST-K7M2Q9PJ
- Email: ggodo@oakland.edu
- PIN: 503211

Staff accounts are created by managers/admins in `/staff`.

Login flow:
- Visit `/login`.
- Enter Restaurant ID (format `RST-XXXXXXXX`), email, and 6-digit PIN.
- Accounts are created by managers/admins in `/staff`.

Restart dev server after env changes:

```powershell
Remove-Item -Recurse -Force .\\.next -ErrorAction SilentlyContinue
pnpm dev
```

## Supabase SQL Editor Setup (No CLI)

If you don't have Supabase CLI installed, use the in-app diagnostics page to get the SQL you need:

1. Run the app: `pnpm dev`
2. Visit `http://localhost:3000/debug/db`
3. Copy the SQL blocks shown for any missing tables/columns.
4. Paste into Supabase Dashboard -> SQL Editor -> Run.
## New Tables & Pages

New Supabase tables used by the app (created via migrations or `/debug/db` SQL blocks):
- `public.chat_rooms`, `public.chat_messages`
- `public.blocked_day_requests`
- `public.business_hours`
- `public.users.hourly_pay`

Manager/Admin tools:
- `/blocked-days` to manage org blackout days and employee block requests
- `/business-hours` to configure open/close hours
- `/chat` for team chat rooms and messages

## Supabase Realtime Requirements

- Enable the `chat_messages` table in the `supabase_realtime` publication (Database → Replication → Realtime) so the app can receive INSERT events.


After schema changes, restart the dev server:

```powershell
Remove-Item -Recurse -Force .\\.next -ErrorAction SilentlyContinue
pnpm dev
```

Note: `.env.local` is only used locally. Configure Vercel env vars separately.

## Recent Updates

- Hardened time-off review/cancel errors and restricted cancels to pending-only.
- Prevented rapid repeat review submits; errors surface via toast messages.
- Replaced API auth checks to use `getUser()` for safer authorization.
- Expanded `/debug/db` SQL to include full time-off schema + RLS.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## QA Checklist

- Log in with Restaurant ID + email + PIN and confirm you reach the correct org.
- Submit a time off request and approve/deny it in `/time-off`.
- Create and review a blocked day request in `/blocked-days`.
- Create a chat room and post messages; confirm initials + name appear.
- Verify employees can view schedules but cannot create/edit shifts.
