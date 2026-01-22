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
- Passcode: 503211

Staff accounts are created by managers/admins in `/staff`.

Login flow:
- Visit `/login`.
- Enter Restaurant ID (format `RST-XXXXXXXX`), email, and 6-digit passcode.
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
4. Paste into Supabase Dashboard → SQL Editor → Run.

After schema changes, restart the dev server:

```powershell
Remove-Item -Recurse -Force .\\.next -ErrorAction SilentlyContinue
pnpm dev
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## QA Checklist

- Log in as Manager and confirm the notification bell links to `/manager/timeoff`.
- Submit a time off request from `/profile`, approve it in `/manager/timeoff`, and confirm it appears in staff views.
- In the staff sidebar, use each section checkbox to select and deselect all members in that section.
- Verify Add Team Member (People) and Add Shift buttons show intentional hover feedback.
- Post a chat message and confirm it persists after refresh with sender and timestamp.
- Submit a drop request, see it posted to chat, accept once, and verify server-side overlap/time-off checks prevent invalid reassignments.
- Validate staff cannot access `/manager/*` pages and manager-only actions are blocked server-side.
