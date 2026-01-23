# ShiftFlow Progress Checklist

Checked items are verified in code and reachable in the UI.

## 1) Team Chat Improvements
- [x] Message author name + initials avatar in bubbles (`src/app/chat/page.tsx`)
- [x] Left room list panel + room switching (`src/app/chat/page.tsx`)
- [x] Manager/Admin can create rooms via modal (`src/app/chat/page.tsx`, `src/app/api/chat/rooms/create/route.ts`)
- [x] Rooms/messages persisted in Supabase (`supabase/migrations/20260123004000_chat_blocked_business.sql`)
- [x] RLS policies for chat rooms/messages (`supabase/migrations/20260123004000_chat_blocked_business.sql`, `src/app/debug/db/page.tsx`)

## 2) Responsive Header / Top Bar Bug
- [x] Header uses sticky positioning + z-index to avoid overlap (`src/components/Header.tsx`)
- [x] Header wraps on narrow widths (`src/components/Header.tsx`)

## 3) Shift Block Visual Improvements (Timeline)
- [x] Job label shown bottom-left in shift block (`src/components/Timeline.tsx`)
- [x] Time range centered in shift block (`src/components/Timeline.tsx`)
- [x] Hover tooltip with employee/job/time and edge clamping (`src/components/Timeline.tsx`)

## 4) Time Off Approve/Deny Fix
- [x] Approve/Deny routed to API with manager note saved (`src/app/api/time-off/review/route.ts`, `src/app/time-off/page.tsx`)
- [x] UI refresh after update (`src/store/scheduleStore.ts`)
- [x] Review endpoint returns diagnosable 400s + UI blocks rapid re-submits (`src/app/api/time-off/review/route.ts`, `src/app/time-off/page.tsx`)

## 5) Blocked Days System
- [x] Manager page to create/edit/delete blocks (`src/app/blocked-days/page.tsx`)
- [x] Employee blocked day request with reason + cancel (`src/components/BlockedDayRequestModal.tsx`, `src/components/StaffSidebar.tsx`)
- [x] Manager approve/deny requests (`src/app/blocked-days/page.tsx`, `src/app/api/blocked-days/review/route.ts`)
- [x] Timeline visuals for employee blocks + org blackout (`src/components/Timeline.tsx`, `src/components/WeekView.tsx`)
- [x] Enforcement prevents shift assignment unless override (`src/components/AddShiftModal.tsx`, `src/store/scheduleStore.ts`)
- [x] Org blackout prevents time off requests (`src/components/TimeOffRequestModal.tsx`, `src/app/api/time-off/request/route.ts`)
- [x] Table + RLS for blocked_day_requests (`supabase/migrations/20260123004000_chat_blocked_business.sql`, `src/app/debug/db/page.tsx`)
- [x] Cancel requests only allowed while pending (`src/app/api/time-off/cancel/route.ts`, `src/app/api/blocked-days/cancel/route.ts`)

## 6) Login Screen Unification
- [x] Restaurant ID + Email + PIN for all logins (`src/app/login/LoginClient.tsx`)
- [x] Manager/admin toggle removed (`src/app/login/LoginClient.tsx`)

## 7) Employee Permissions on Schedule
- [x] EMPLOYEE view-only in UI (no add/edit/delete/drag) (`src/components/Timeline.tsx`, `src/components/WeekView.tsx`, `src/components/AddShiftModal.tsx`)
- [x] Store layer blocks shift mutations for EMPLOYEE (`src/store/scheduleStore.ts`)
- [x] Manager-only block actions enforced in API (`src/app/api/blocked-days/*`)

## 8) Site Manager Changes
- [x] No copy button in Site Manager (`src/app/manager/page.tsx`)
- [x] Remove Manage Staff / Time Off options (`src/app/manager/page.tsx`)
- [x] Admin-only edit restaurant name (`src/app/manager/page.tsx`, `src/app/api/organizations/update/route.ts`)
- [x] Hover/selected styling on org list (`src/app/manager/page.tsx`)

## 9) Staff Profile: Hourly Pay + Labor Cost
- [x] users.hourly_pay column in SQL generator (`src/app/debug/db/page.tsx`)
- [x] Hourly Pay editable in staff profile (manager/admin) (`src/app/staff/[userId]/page.tsx`, `src/components/StaffProfileModal.tsx`)
- [x] Labor cost uses hourly_pay * shift duration (`src/components/StatsFooter.tsx`)

## 10) Timeline UX: Continuous Scroll + Business Hours Highlight
- [x] Continuous horizontal scroll edges navigate dates (`src/components/Timeline.tsx`, `src/components/WeekView.tsx`)
- [x] Business hours highlight in timeline (`src/components/Timeline.tsx`)
- [x] Business hours configuration page + API (`src/app/business-hours/page.tsx`, `src/app/api/business-hours/save/route.ts`)
- [x] business_hours table + RLS (`supabase/migrations/20260123004000_chat_blocked_business.sql`, `src/app/debug/db/page.tsx`)

## 12) Fixed Bars + Review Requests Consolidation
- [x] Fixed header/footer shell with scrollable middle (`src/app/layout.tsx`, `src/components/AppShell.tsx`, `src/components/StatsFooter.tsx`)
- [x] Schedule date controls moved into dashboard view (`src/components/Dashboard.tsx`)
- [x] Header nav order + review requests link (`src/components/Header.tsx`)
- [x] Review Requests page with time off + blocked day tabs (`src/app/review-requests/page.tsx`, `src/components/review/*`)

## 11) Permissions Hardening
- [x] API routes use `getUser()` for auth checks (`src/app/api/admin/*`, `src/app/api/me/update-profile/route.ts`)
- [x] Shift writes restricted to manager/admin via RLS (`supabase/migrations/20260122000000_init.sql`)

## Build / Env Notes
- [ ] `pnpm run build` succeeds locally (Windows EPERM prevented TypeScript spawn on this machine; see README note)

## Where to Test
- Login: `/login`
- Schedule (day/week): `/dashboard`
- Time off review: `/time-off`
- Review requests: `/review-requests`
- Blocked days: `/blocked-days`
- Business hours: `/business-hours`
- Team chat: `/chat`
- Site manager: `/manager`
- DB diagnostics: `/debug/db`

## How to Test (Click-to-Add Shifts)
- Day view (`/dashboard`): click empty space in a lane to open Add Shift; verify 15-min snap + default 2-hour duration, and overlap warnings.
- Day view: click a shift to edit; drag/resize should not open Add Shift.
- Week view (`/dashboard` > Week): click empty space in a day column to open Add Shift; verify overlap warnings and role restrictions.

## Release Checklist
- DB/migrations applied: Not verified in this run
- `/debug/db` ALL PASS: Not verified in this run
- Known bugs: `pnpm run build` fails with `spawn EPERM` on this Windows/Desktop path; reproduce by running `cmd /c pnpm run build`
- Manual test URLs: `/login`, `/dashboard`, `/time-off`, `/blocked-days`, `/business-hours`, `/chat`, `/manager`, `/debug/db`
