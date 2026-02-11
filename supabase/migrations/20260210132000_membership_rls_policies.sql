-- Align RLS policies with organization_memberships.role (source of truth)

-- Helpers
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org_id
      and m.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_org_manager(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org_id
      and m.auth_user_id = auth.uid()
      and lower(m.role) in ('admin','manager')
  );
$$;

create or replace function public.has_manager()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships
    where lower(role) in ('admin','manager')
  );
$$;

-- Organizations
drop policy if exists "Organizations readable by members" on public.organizations;
create policy "Organizations readable by members"
  on public.organizations
  for select
  using (public.is_org_member(organizations.id));

drop policy if exists "Organizations insertable by managers" on public.organizations;
create policy "Organizations insertable by managers"
  on public.organizations
  for insert
  with check (
    exists (
      select 1 from public.organization_memberships m
      where m.auth_user_id = auth.uid()
        and lower(m.role) in ('admin','manager')
    )
  );

-- Users
drop policy if exists "Users readable by members" on public.users;
create policy "Users readable by members"
  on public.users
  for select
  using (
    auth.uid() = auth_user_id
    or public.is_org_member(users.organization_id)
  );

drop policy if exists "Users insertable by managers" on public.users;
create policy "Users insertable by managers"
  on public.users
  for insert
  with check (public.is_org_manager(users.organization_id));

drop policy if exists "Users updatable by managers" on public.users;
create policy "Users updatable by managers"
  on public.users
  for update
  using (public.is_org_manager(users.organization_id));

drop policy if exists "Users deletable by managers" on public.users;
create policy "Users deletable by managers"
  on public.users
  for delete
  using (public.is_org_manager(users.organization_id));

-- Shifts
drop policy if exists "Shifts readable by org members" on public.shifts;
create policy "Shifts readable by org members"
  on public.shifts
  for select
  using (public.is_org_member(shifts.organization_id));

drop policy if exists "Shifts writable by managers" on public.shifts;
create policy "Shifts writable by managers"
  on public.shifts
  for all
  using (public.is_org_manager(shifts.organization_id))
  with check (public.is_org_manager(shifts.organization_id));

-- Schedule view settings
drop policy if exists schedule_view_settings_select on public.schedule_view_settings;
create policy schedule_view_settings_select on public.schedule_view_settings
  for select
  using (public.is_org_member(schedule_view_settings.organization_id));

drop policy if exists schedule_view_settings_write on public.schedule_view_settings;
create policy schedule_view_settings_write on public.schedule_view_settings
  for all
  using (public.is_org_manager(schedule_view_settings.organization_id))
  with check (public.is_org_manager(schedule_view_settings.organization_id));

-- Business hours
drop policy if exists business_hours_select on public.business_hours;
create policy business_hours_select on public.business_hours
  for select
  using (public.is_org_member(business_hours.organization_id));

drop policy if exists business_hours_write on public.business_hours;
create policy business_hours_write on public.business_hours
  for all
  using (public.is_org_manager(business_hours.organization_id))
  with check (public.is_org_manager(business_hours.organization_id));

-- Core hours
drop policy if exists core_hours_select on public.core_hours;
create policy core_hours_select on public.core_hours
  for select
  using (public.is_org_member(core_hours.organization_id));

drop policy if exists core_hours_write on public.core_hours;
create policy core_hours_write on public.core_hours
  for all
  using (public.is_org_manager(core_hours.organization_id))
  with check (public.is_org_manager(core_hours.organization_id));

-- Hour ranges
drop policy if exists business_hour_ranges_select on public.business_hour_ranges;
create policy business_hour_ranges_select on public.business_hour_ranges
  for select
  using (public.is_org_member(business_hour_ranges.organization_id));

drop policy if exists business_hour_ranges_write on public.business_hour_ranges;
create policy business_hour_ranges_write on public.business_hour_ranges
  for all
  using (public.is_org_manager(business_hour_ranges.organization_id))
  with check (public.is_org_manager(business_hour_ranges.organization_id));

drop policy if exists core_hour_ranges_select on public.core_hour_ranges;
create policy core_hour_ranges_select on public.core_hour_ranges
  for select
  using (public.is_org_member(core_hour_ranges.organization_id));

drop policy if exists core_hour_ranges_write on public.core_hour_ranges;
create policy core_hour_ranges_write on public.core_hour_ranges
  for all
  using (public.is_org_manager(core_hour_ranges.organization_id))
  with check (public.is_org_manager(core_hour_ranges.organization_id));

-- Locations
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select
  using (public.is_org_member(locations.organization_id));

drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations
  for all
  using (public.is_org_manager(locations.organization_id))
  with check (public.is_org_manager(locations.organization_id));

-- Chat rooms/messages
drop policy if exists chat_rooms_select on public.chat_rooms;
create policy chat_rooms_select on public.chat_rooms
  for select
  using (public.is_org_member(chat_rooms.organization_id));

drop policy if exists chat_rooms_insert on public.chat_rooms;
create policy chat_rooms_insert on public.chat_rooms
  for insert
  with check (public.is_org_member(chat_rooms.organization_id));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select
  using (public.is_org_member(chat_messages.organization_id));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert
  with check (
    public.is_org_member(chat_messages.organization_id)
    and exists (
      select 1 from public.chat_rooms r
      where r.id = chat_messages.room_id
        and r.organization_id = chat_messages.organization_id
    )
  );

-- Blocked day requests
drop policy if exists blocked_day_select on public.blocked_day_requests;
create policy blocked_day_select on public.blocked_day_requests
  for select
  using (
    public.is_org_manager(blocked_day_requests.organization_id)
    or blocked_day_requests.requested_by_auth_user_id = auth.uid()
  );

drop policy if exists blocked_day_insert on public.blocked_day_requests;
create policy blocked_day_insert on public.blocked_day_requests
  for insert
  with check (
    blocked_day_requests.requested_by_auth_user_id = auth.uid()
    and public.is_org_member(blocked_day_requests.organization_id)
  );

drop policy if exists blocked_day_update on public.blocked_day_requests;
create policy blocked_day_update on public.blocked_day_requests
  for update
  using (
    public.is_org_manager(blocked_day_requests.organization_id)
    or blocked_day_requests.requested_by_auth_user_id = auth.uid()
  );

-- Time off requests
drop policy if exists "Time off readable by requester or managers" on public.time_off_requests;
create policy "Time off readable by requester or managers"
  on public.time_off_requests
  for select
  using (
    auth.uid() = requester_auth_user_id
    or public.is_org_manager(time_off_requests.organization_id)
  );

drop policy if exists "Time off insertable by requester" on public.time_off_requests;
create policy "Time off insertable by requester"
  on public.time_off_requests
  for insert
  with check (
    auth.uid() = requester_auth_user_id
    and public.is_org_member(time_off_requests.organization_id)
  );

drop policy if exists "Time off updatable by requester" on public.time_off_requests;
create policy "Time off updatable by requester"
  on public.time_off_requests
  for update
  using (auth.uid() = requester_auth_user_id);

drop policy if exists "Time off updatable by managers" on public.time_off_requests;
create policy "Time off updatable by managers"
  on public.time_off_requests
  for update
  using (public.is_org_manager(time_off_requests.organization_id));

-- Shift exchange
drop policy if exists shift_exchange_select on public.shift_exchange_requests;
create policy shift_exchange_select on public.shift_exchange_requests
  for select
  using (
    (
      status = 'OPEN'
      and public.is_org_member(shift_exchange_requests.organization_id)
    )
    or requested_by_auth_user_id = auth.uid()
    or public.is_org_manager(shift_exchange_requests.organization_id)
  );

drop policy if exists shift_exchange_insert on public.shift_exchange_requests;
create policy shift_exchange_insert on public.shift_exchange_requests
  for insert
  with check (
    requested_by_auth_user_id = auth.uid()
    and public.is_org_member(shift_exchange_requests.organization_id)
    and exists (
      select 1
      from public.shifts s
      join public.users u2 on u2.id = s.user_id
      where s.id = shift_exchange_requests.shift_id
        and s.organization_id = shift_exchange_requests.organization_id
        and u2.auth_user_id = auth.uid()
    )
  );

drop policy if exists shift_exchange_update on public.shift_exchange_requests;
create policy shift_exchange_update on public.shift_exchange_requests
  for update
  using (public.is_org_manager(shift_exchange_requests.organization_id))
  with check (public.is_org_manager(shift_exchange_requests.organization_id));
