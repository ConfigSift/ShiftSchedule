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

## 13) Locations / Areas
- [x] Locations table + shifts.location_id migration (`supabase/migrations/20260123006000_locations.sql`)
- [x] Locations CRUD APIs (`src/app/api/locations/*`)
- [x] Locations management page (`src/app/locations/page.tsx`, `src/app/manager/page.tsx`)
- [x] Location assignment in shifts (`src/components/AddShiftModal.tsx`, `src/store/scheduleStore.ts`)
- [x] Location labels in timeline + week view (`src/components/Timeline.tsx`, `src/components/WeekView.tsx`)

## 14) Shift Exchange
- [x] shift_exchange_requests migration (`supabase/migrations/20260123007000_shift_exchange.sql`)
- [x] Shift exchange APIs (`src/app/api/shift-exchange/*`)
- [x] Shift Exchange page (`src/app/shift-exchange/page.tsx`)
- [x] Schedule link to Shift Exchange (`src/components/Dashboard.tsx`)

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
- Locations: `/locations`
- Shift Exchange: `/shift-exchange`
- DB diagnostics: `/debug/db`

## How to Test (Click-to-Add Shifts)
- Day view (`/dashboard`): click empty space in a lane to open Add Shift; verify 15-min snap + default 2-hour duration, and overlap warnings.
- Day view: click a shift to edit; drag/resize should not open Add Shift.
- Week view (`/dashboard` > Week): click empty space in a day column to open Add Shift; verify overlap warnings and role restrictions.

## How to Test (UI Polish)
- Hover empty schedule space with existing shifts: see subtle "Click to add shift" hint; no hint when hovering a shift (`/dashboard` Day + Week).
- Left staff panel: only staff filters/selection show; no My Time Off / My Blocked Days (`/dashboard`).
- Light mode: schedule background fills full area between fixed header/footer (no white gutters on wide screens).

## How to Test (Copy Schedule)
- `/dashboard`: click "Copy Schedule" (manager/admin), run "Copy to next day" and confirm shifts appear + summary counts.
- `/dashboard`: run "Copy current week schedule to next week" and confirm shifts appear + summary counts.
- `/dashboard`: use "Copy to N weeks ahead" and "Copy to date range" with overlaps/blocked dates; verify skipped counts.

## How to Test (Chat Enhancements)
- `/chat`: verify layout fits between fixed header/footer; messages list is the only scrolling panel.
- Manager/admin: rename and delete rooms (confirmation shown) and confirm list updates.
- Export CSV downloads with created_at, author_name, message_body columns.
- Send a message from another session and verify realtime insert + new message indicator.

## How to Test (Staff Sidebar UX)
- `/dashboard`: verify staff tiles are denser and readable; selection/hover states still clear.
- `/dashboard`: use "Search staff" to filter by name; selections remain when filtered out.
- `/dashboard`: sidebar fills full height between fixed bars and scrolls internally without cut off.

## How to Test (Profile Permissions)
- Employee: edit own name/phone/email only; save works (`/staff/[userId]`).
- Employee: hourly pay is hidden in profile view and any staff profile modal.
- Manager/admin: hourly pay visible/editable for staff profiles (`/staff` and `/staff/[userId]`).
- Manager/admin: "Back to Site Manager" link works (`/staff/[userId]`).
- Tamper: POST `/api/me/update-profile` with `hourlyPay` or `role` returns 400 with forbidden fields.

## How to Test (Locations)
- Apply migration `supabase/migrations/20260123006000_locations.sql` via Supabase CLI or SQL Editor.
- `/locations`: create/edit/delete locations (manager/admin only); employees should be blocked.
- `/dashboard`: Add/Edit Shift shows Location dropdown; select location and save.
- Timeline/Week view: shift blocks show location label and tooltip details.
- Copy Schedule: copied shifts preserve `location_id`.

## How to Test (Shift Exchange)
- Apply migration `supabase/migrations/20260123007000_shift_exchange.sql` via Supabase CLI or SQL Editor.
- `/shift-exchange`: My Shifts tab shows upcoming shifts; drop creates OPEN request; cancel removes it.
- `/shift-exchange`: Available tab lists OPEN requests; pick up reassigns shift and marks CLAIMED.
- `/dashboard`: verify schedule updates after drop/pickup (refresh happens automatically).

## Release Checklist
- DB/migrations applied: Not verified in this run
- `/debug/db` ALL PASS: Not verified in this run
- Known bugs: `pnpm run build` fails with `spawn EPERM` on this Windows/Desktop path; reproduce by running `cmd /c pnpm run build`
- Manual test URLs: `/login`, `/dashboard`, `/review-requests`, `/time-off`, `/blocked-days`, `/business-hours`, `/chat`, `/manager`, `/debug/db`

## Final DONE Checklist
- Header nav order verified: Schedule | Review Requests | Team Chat | Manage Staff | Blocked Days | Business Hours
- Review Requests is the single review hub (`/review-requests`); `/time-off` and `/blocked-days` link back
- Chat enhancements tested: rename/delete/export/realtime
- Copy Schedule works for managers/admins


