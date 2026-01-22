This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Windows Setup (Supabase Postgres)

This app uses Prisma with Supabase Postgres and NextAuth for PIN-based logins.

### Install

```powershell
npm install
```

### Environment Variables (PowerShell, UTF-8)

Prisma reads `DATABASE_URL` from the root `.env` (UTF-8). Next.js uses `.env.local` for app secrets.

Use the Supabase session pooler connection with the exact parameters below. The password must be your Supabase **Database password** (not the anon key).

Pooler params (confirmed):
- host: aws-1-us-east-2.pooler.supabase.com
- port: 5432
- database: postgres
- user: postgres.ggzqctyjlwajqytyfssq
- pool_mode: session

```powershell
# Supabase session pooler connection string. Use the Database password (not the anon key).
$dbPassword = "YOUR_SUPABASE_DATABASE_PASSWORD"
$dbUrl = "postgresql://postgres.ggzqctyjlwajqytyfssq:$dbPassword@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
Set-Content -Path .env -Value "DATABASE_URL=`"$dbUrl`"" -Encoding UTF8
Set-Content -Path .env.local -Value "DATABASE_URL=`"$dbUrl`"" -Encoding UTF8
```

#### Optional but recommended: DIRECT_URL for Prisma migrations

`DIRECT_URL` lets Prisma migrations use a direct, non-pooler connection while the app runtime uses the session pooler via `DATABASE_URL`.

- Use `DATABASE_URL` for app runtime and regular queries (session pooler).
- Use `DIRECT_URL` for `prisma migrate`/`db:reset` (direct connection from Supabase settings).
- The direct connection string also uses the Supabase Database password (not the anon key).

```powershell
# Direct connection string (Supabase Settings > Database > Connection string > Direct).
$directPassword = "YOUR_SUPABASE_DATABASE_PASSWORD"
$directUrl = "postgresql://postgres.ggzqctyjlwajqytyfssq:$directPassword@YOUR_SUPABASE_DIRECT_HOST:5432/postgres?sslmode=require"
Add-Content -Path .env -Value "DIRECT_URL=`"$directUrl`"" -Encoding UTF8
Add-Content -Path .env.local -Value "DIRECT_URL=`"$directUrl`"" -Encoding UTF8
```

Supabase API (supabase-js) uses Next.js public env vars in `.env.local`. These are not the Prisma database connection string.

```powershell
$sbUrl = "https://ggzqctyjlwajqytyfssq.supabase.co"
$sbAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnenFjdHlqbHdhanF5dHlmc3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMDA4NDksImV4cCI6MjA4NDU3Njg0OX0.H-bactZImISz8cdAc0bFl6ppXqW9_vxrfMsTTvrcwzM"
Add-Content -Path .env.local -Value "NEXT_PUBLIC_SUPABASE_URL=`"$sbUrl`"" -Encoding UTF8
Add-Content -Path .env.local -Value "NEXT_PUBLIC_SUPABASE_ANON_KEY=`"$sbAnonKey`"" -Encoding UTF8
```

Add any Next.js secrets to `.env.local` as needed, for example:

```powershell
$nextAuthUrl = "http://localhost:3000"
$nextAuthSecret = [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
Add-Content -Path .env.local -Value "NEXTAUTH_URL=`"$nextAuthUrl`"" -Encoding UTF8
Add-Content -Path .env.local -Value "NEXTAUTH_SECRET=`"$nextAuthSecret`"" -Encoding UTF8
```

### Migrate + Seed

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` prints which URL is used. If `DIRECT_URL` is set, Prisma migrations use it automatically via `directUrl` in the schema.

### Connectivity Check (Windows)

Prints parsed connection details (with password masked) and verifies TCP connectivity.

```powershell
npm run db:check
```

### Reset Database (re-apply migrations + seed)

```powershell
npm run db:reset
```

This wipes local data and re-applies migrations before seeding. Do not run against production.

### Run Dev Server

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Build

```powershell
npm run build
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Default Manager Credentials

- Name: Manager
- PIN: 1234

## QA Checklist

- Log in as Manager and confirm the notification bell links to `/manager/timeoff`.
- Submit a time off request from `/profile`, approve it in `/manager/timeoff`, and confirm it appears in staff views.
- In the staff sidebar, use each section checkbox to select and deselect all members in that section.
- Verify Add Team Member (People) and Add Shift buttons show intentional hover feedback.
- Post a chat message and confirm it persists after refresh with sender and timestamp.
- Submit a drop request, see it posted to chat, accept once, and verify server-side overlap/time-off checks prevent invalid reassignments.
- Validate staff cannot access `/manager/*` pages and manager-only actions are blocked server-side.
