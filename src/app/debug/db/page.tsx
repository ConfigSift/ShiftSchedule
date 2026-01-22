'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { formatSupabaseEnvError, getSupabaseEnv } from '../../../lib/supabase/env';

type CheckItem = {
  id: string;
  label: string;
  ok: boolean;
  details?: string;
};

const USERS_REQUIRED_COLUMNS = ['auth_user_id', 'organization_id', 'email', 'jobs', 'pin_code', 'hourly_pay'];
const USERS_NAME_COLUMNS = ['full_name', 'first_name', 'last_name'];
const USERS_ROLE_COLUMNS = ['account_type', 'role'];

const TIME_OFF_REQUIRED_COLUMNS = [
  'organization_id',
  'start_date',
  'end_date',
  'status',
  'reason',
  'note',
  'manager_note',
  'created_at',
  'updated_at',
  'reviewed_by',
  'reviewed_at',
];
const TIME_OFF_REQUESTER_COLUMNS = ['requester_auth_user_id', 'auth_user_id', 'requester_user_id'];

const SHIFTS_REQUIRED_COLUMNS = [
  'organization_id',
  'shift_date',
  'start_time',
  'end_time',
  'is_blocked',
  'job',
];

const CHAT_ROOMS_REQUIRED_COLUMNS = ['organization_id', 'name', 'created_by_auth_user_id', 'created_at'];
const CHAT_MESSAGES_REQUIRED_COLUMNS = [
  'room_id',
  'organization_id',
  'author_auth_user_id',
  'body',
  'created_at',
];

const BLOCKED_DAY_REQUIRED_COLUMNS = [
  'organization_id',
  'user_id',
  'scope',
  'start_date',
  'end_date',
  'reason',
  'status',
  'manager_note',
  'requested_by_auth_user_id',
  'reviewed_by_auth_user_id',
  'reviewed_at',
  'created_at',
  'updated_at',
];

const BUSINESS_HOURS_REQUIRED_COLUMNS = [
  'organization_id',
  'day_of_week',
  'open_time',
  'close_time',
  'enabled',
];

export default function DebugDbPage() {
  const { supabaseUrl, isValid } = getSupabaseEnv();
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [missingColumns, setMissingColumns] = useState<Record<string, string[]>>({});
  const isDev = process.env.NODE_ENV !== 'production';

  const isMissingTableError = (message: string, table: string) =>
    message.toLowerCase().includes('relation') && message.toLowerCase().includes(table);
  const isMissingColumnError = (message: string, column: string) =>
    message.toLowerCase().includes(column) && message.toLowerCase().includes('does not exist');

  const checkTable = async (client: ReturnType<typeof getSupabaseClient>, table: string) => {
    const result = await client.from(table).select('id').limit(1);
    if (!result.error) return { ok: true };
    if (isMissingTableError(result.error.message, table)) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, error: result.error.message };
  };

  const checkColumn = async (client: ReturnType<typeof getSupabaseClient>, table: string, column: string) => {
    const result = await client.from(table).select(column).limit(1);
    if (!result.error) return { ok: true };
    if (isMissingTableError(result.error.message, table)) {
      return { ok: false, error: result.error.message };
    }
    if (isMissingColumnError(result.error.message, column)) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, error: result.error.message };
  };

  const runChecks = async () => {
    setLoading(true);
    setError(null);
    setMissingColumns({});
    try {
      if (!isValid) {
        throw new Error(formatSupabaseEnvError());
      }

      const client = getSupabaseClient();

      const usersTable = await checkTable(client, 'users');
      const orgTable = await checkTable(client, 'organizations');
      const shiftsTable = await checkTable(client, 'shifts');
      const timeOffTable = await checkTable(client, 'time_off_requests');
      const chatRoomsTable = await checkTable(client, 'chat_rooms');
      const chatMessagesTable = await checkTable(client, 'chat_messages');
      const blockedDaysTable = await checkTable(client, 'blocked_day_requests');
      const businessHoursTable = await checkTable(client, 'business_hours');

      const columnStatus: Record<string, string[]> = {};
      const checksList: CheckItem[] = [];

      const addMissing = (table: string, column: string) => {
        if (!columnStatus[table]) columnStatus[table] = [];
        columnStatus[table].push(column);
      };

      checksList.push({
        id: 'users_table',
        label: 'public.users table exists',
        ok: usersTable.ok,
        details: !usersTable.ok && usersTable.error ? usersTable.error : undefined,
      });
      checksList.push({
        id: 'organizations_table',
        label: 'public.organizations table exists',
        ok: orgTable.ok,
        details: !orgTable.ok && orgTable.error ? orgTable.error : undefined,
      });
      checksList.push({
        id: 'shifts_table',
        label: 'public.shifts table exists',
        ok: shiftsTable.ok,
        details: !shiftsTable.ok && shiftsTable.error ? shiftsTable.error : undefined,
      });
      checksList.push({
        id: 'time_off_table',
        label: 'public.time_off_requests table exists',
        ok: timeOffTable.ok,
        details: !timeOffTable.ok && timeOffTable.error ? timeOffTable.error : undefined,
      });
      if (!timeOffTable.ok) addMissing('time_off_requests', '__table__');
      checksList.push({
        id: 'chat_rooms_table',
        label: 'public.chat_rooms table exists',
        ok: chatRoomsTable.ok,
        details: !chatRoomsTable.ok && chatRoomsTable.error ? chatRoomsTable.error : undefined,
      });
      if (!chatRoomsTable.ok) addMissing('chat_rooms', '__table__');
      checksList.push({
        id: 'chat_messages_table',
        label: 'public.chat_messages table exists',
        ok: chatMessagesTable.ok,
        details: !chatMessagesTable.ok && chatMessagesTable.error ? chatMessagesTable.error : undefined,
      });
      if (!chatMessagesTable.ok) addMissing('chat_messages', '__table__');
      checksList.push({
        id: 'blocked_days_table',
        label: 'public.blocked_day_requests table exists',
        ok: blockedDaysTable.ok,
        details: !blockedDaysTable.ok && blockedDaysTable.error ? blockedDaysTable.error : undefined,
      });
      if (!blockedDaysTable.ok) addMissing('blocked_day_requests', '__table__');
      checksList.push({
        id: 'business_hours_table',
        label: 'public.business_hours table exists',
        ok: businessHoursTable.ok,
        details: !businessHoursTable.ok && businessHoursTable.error ? businessHoursTable.error : undefined,
      });
      if (!businessHoursTable.ok) addMissing('business_hours', '__table__');

      if (usersTable.ok) {
        const baseColumns = await Promise.all(
          USERS_REQUIRED_COLUMNS.map(async (column) => ({ column, ...(await checkColumn(client, 'users', column)) }))
        );
        baseColumns.forEach((result) => {
          if (!result.ok) addMissing('users', result.column);
        });

        const nameChecks = await Promise.all(
          USERS_NAME_COLUMNS.map(async (column) => ({ column, ...(await checkColumn(client, 'users', column)) }))
        );
        const hasFullName = nameChecks.find((c) => c.column === 'full_name')?.ok;
        const hasFirstName = nameChecks.find((c) => c.column === 'first_name')?.ok;
        const hasLastName = nameChecks.find((c) => c.column === 'last_name')?.ok;
        const nameOk = Boolean(hasFullName || (hasFirstName && hasLastName));
        if (!nameOk) {
          addMissing('users', 'full_name');
          addMissing('users', 'first_name');
          addMissing('users', 'last_name');
        }

        const roleChecks = await Promise.all(
          USERS_ROLE_COLUMNS.map(async (column) => ({ column, ...(await checkColumn(client, 'users', column)) }))
        );
        const roleOk = roleChecks.some((c) => c.ok);
        if (!roleOk) {
          addMissing('users', 'account_type');
          addMissing('users', 'role');
        }

        checksList.push({
          id: 'users_required',
          label: 'users has auth_user_id, organization_id, email, jobs, pin_code',
          ok: baseColumns.every((c) => c.ok),
          details: baseColumns.some((c) => !c.ok)
            ? `Missing: ${baseColumns.filter((c) => !c.ok).map((c) => c.column).join(', ')}`
            : undefined,
        });
        checksList.push({
          id: 'users_name',
          label: 'users has full_name or first_name + last_name',
          ok: nameOk,
          details: !nameOk ? 'Missing name columns' : undefined,
        });
        checksList.push({
          id: 'users_role',
          label: 'users has account_type or role',
          ok: roleOk,
          details: !roleOk ? 'Missing role columns' : undefined,
        });
      }

      if (orgTable.ok) {
        const orgCode = await checkColumn(client, 'organizations', 'restaurant_code');
        if (!orgCode.ok) addMissing('organizations', 'restaurant_code');
        checksList.push({
          id: 'organizations_code',
          label: 'organizations has restaurant_code',
          ok: orgCode.ok,
          details: !orgCode.ok ? orgCode.error : undefined,
        });
      }

      if (timeOffTable.ok) {
        const reqColumns = await Promise.all(
          TIME_OFF_REQUIRED_COLUMNS.map(async (column) => ({
            column,
            ...(await checkColumn(client, 'time_off_requests', column)),
          }))
        );
        reqColumns.forEach((result) => {
          if (!result.ok) addMissing('time_off_requests', result.column);
        });
        const requesterChecks = await Promise.all(
          TIME_OFF_REQUESTER_COLUMNS.map(async (column) => ({
            column,
            ...(await checkColumn(client, 'time_off_requests', column)),
          }))
        );
        const requesterOk = requesterChecks.some((c) => c.ok);
        if (!requesterOk) {
          TIME_OFF_REQUESTER_COLUMNS.forEach((column) => addMissing('time_off_requests', column));
        }

        checksList.push({
          id: 'time_off_required',
          label: 'time_off_requests has required columns',
          ok: reqColumns.every((c) => c.ok),
          details: reqColumns.some((c) => !c.ok)
            ? `Missing: ${reqColumns.filter((c) => !c.ok).map((c) => c.column).join(', ')}`
            : undefined,
        });
        checksList.push({
          id: 'time_off_requester',
          label: 'time_off_requests has requester_auth_user_id or auth_user_id or requester_user_id',
          ok: requesterOk,
          details: !requesterOk ? 'Missing requester identifier columns' : undefined,
        });
      }

      if (shiftsTable.ok) {
        const shiftColumns = await Promise.all(
          SHIFTS_REQUIRED_COLUMNS.map(async (column) => ({
            column,
            ...(await checkColumn(client, 'shifts', column)),
          }))
        );
        shiftColumns.forEach((result) => {
          if (!result.ok) addMissing('shifts', result.column);
        });
        checksList.push({
          id: 'shifts_required',
          label: 'shifts has organization_id, shift_date, start_time, end_time, is_blocked, job',
          ok: shiftColumns.every((c) => c.ok),
          details: shiftColumns.some((c) => !c.ok)
            ? `Missing: ${shiftColumns.filter((c) => !c.ok).map((c) => c.column).join(', ')}`
            : undefined,
        });
      }

      if (chatRoomsTable.ok) {
        const roomColumns = await Promise.all(
          CHAT_ROOMS_REQUIRED_COLUMNS.map(async (column) => ({
            column,
            ...(await checkColumn(client, 'chat_rooms', column)),
          }))
        );
        roomColumns.forEach((result) => {
          if (!result.ok) addMissing('chat_rooms', result.column);
        });
        checksList.push({
          id: 'chat_rooms_required',
          label: 'chat_rooms has required columns',
          ok: roomColumns.every((c) => c.ok),
          details: roomColumns.some((c) => !c.ok)
            ? `Missing: ${roomColumns.filter((c) => !c.ok).map((c) => c.column).join(', ')}`
            : undefined,
        });
      }

      if (chatMessagesTable.ok) {
        const messageColumns = await Promise.all(
          CHAT_MESSAGES_REQUIRED_COLUMNS.map(async (column) => ({
            column,
            ...(await checkColumn(client, 'chat_messages', column)),
          }))
        );
        messageColumns.forEach((result) => {
          if (!result.ok) addMissing('chat_messages', result.column);
        });
        checksList.push({
          id: 'chat_messages_required',
          label: 'chat_messages has required columns',
          ok: messageColumns.every((c) => c.ok),
          details: messageColumns.some((c) => !c.ok)
            ? `Missing: ${messageColumns.filter((c) => !c.ok).map((c) => c.column).join(', ')}`
            : undefined,
        });
      }

      if (blockedDaysTable.ok) {
        const blockedColumns = await Promise.all(
          BLOCKED_DAY_REQUIRED_COLUMNS.map(async (column) => ({
            column,
            ...(await checkColumn(client, 'blocked_day_requests', column)),
          }))
        );
        blockedColumns.forEach((result) => {
          if (!result.ok) addMissing('blocked_day_requests', result.column);
        });
        checksList.push({
          id: 'blocked_days_required',
          label: 'blocked_day_requests has required columns',
          ok: blockedColumns.every((c) => c.ok),
          details: blockedColumns.some((c) => !c.ok)
            ? `Missing: ${blockedColumns.filter((c) => !c.ok).map((c) => c.column).join(', ')}`
            : undefined,
        });
      }

      if (businessHoursTable.ok) {
        const hoursColumns = await Promise.all(
          BUSINESS_HOURS_REQUIRED_COLUMNS.map(async (column) => ({
            column,
            ...(await checkColumn(client, 'business_hours', column)),
          }))
        );
        hoursColumns.forEach((result) => {
          if (!result.ok) addMissing('business_hours', result.column);
        });
        checksList.push({
          id: 'business_hours_required',
          label: 'business_hours has required columns',
          ok: hoursColumns.every((c) => c.ok),
          details: hoursColumns.some((c) => !c.ok)
            ? `Missing: ${hoursColumns.filter((c) => !c.ok).map((c) => c.column).join(', ')}`
            : undefined,
        });
      }

      setChecks(checksList);
      setMissingColumns(columnStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to run DB checks.';
      setError(isDev ? message : 'Unable to run DB checks.');
      setChecks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runChecks();
  }, []);

  const sqlBlocks = useMemo(() => {
    const blocks: string[] = [];
    const missingUsers = missingColumns.users ?? [];
    const missingOrganizations = missingColumns.organizations ?? [];
    const missingTimeOff = missingColumns.time_off_requests ?? [];
    const missingShifts = missingColumns.shifts ?? [];
    const missingChatRooms = missingColumns.chat_rooms ?? [];
    const missingChatMessages = missingColumns.chat_messages ?? [];
    const missingBlockedDays = missingColumns.blocked_day_requests ?? [];
    const missingBusinessHours = missingColumns.business_hours ?? [];

    if (missingOrganizations.includes('restaurant_code')) {
      blocks.push(`-- Organizations: restaurant_code
alter table if exists public.organizations
  add column if not exists restaurant_code text;`);
    }

    if (missingUsers.length > 0) {
      const userAdds: string[] = [];
      if (missingUsers.includes('jobs')) {
        userAdds.push("add column if not exists jobs text[] default '{}'::text[]");
      }
      if (missingUsers.includes('pin_code')) {
        userAdds.push('add column if not exists pin_code text');
      }
      if (missingUsers.includes('hourly_pay')) {
        userAdds.push('add column if not exists hourly_pay numeric not null default 0');
      }
      if (userAdds.length > 0) {
        blocks.push(`-- Users: jobs + pin_code + hourly_pay
alter table if exists public.users
  ${userAdds.join(',\n  ')};`);
      }
    }

    if (missingTimeOff.length > 0) {
      const timeOffAdds: string[] = [];
      if (missingTimeOff.includes('organization_id')) timeOffAdds.push('add column if not exists organization_id uuid');
      if (missingTimeOff.includes('user_id')) timeOffAdds.push('add column if not exists user_id uuid');
      if (missingTimeOff.includes('requester_auth_user_id')) {
        timeOffAdds.push('add column if not exists requester_auth_user_id uuid');
      }
      if (missingTimeOff.includes('auth_user_id')) timeOffAdds.push('add column if not exists auth_user_id uuid');
      if (missingTimeOff.includes('requester_user_id')) timeOffAdds.push('add column if not exists requester_user_id uuid');
      if (missingTimeOff.includes('start_date')) timeOffAdds.push('add column if not exists start_date date');
      if (missingTimeOff.includes('end_date')) timeOffAdds.push('add column if not exists end_date date');
      if (missingTimeOff.includes('reason')) timeOffAdds.push('add column if not exists reason text');
      if (missingTimeOff.includes('note')) timeOffAdds.push('add column if not exists note text');
      if (missingTimeOff.includes('status')) timeOffAdds.push("add column if not exists status text default 'PENDING'");
      if (missingTimeOff.includes('created_at')) {
        timeOffAdds.push('add column if not exists created_at timestamptz default now()');
      }
      if (missingTimeOff.includes('updated_at')) {
        timeOffAdds.push('add column if not exists updated_at timestamptz default now()');
      }
      if (missingTimeOff.includes('reviewed_by')) timeOffAdds.push('add column if not exists reviewed_by uuid');
      if (missingTimeOff.includes('reviewed_at')) timeOffAdds.push('add column if not exists reviewed_at timestamptz');
      if (missingTimeOff.includes('manager_note')) timeOffAdds.push('add column if not exists manager_note text');
      const alterTimeOff = timeOffAdds.length
        ? `\nalter table if exists public.time_off_requests\n  ${timeOffAdds.join(',\n  ')};`
        : '';
      blocks.push(`-- Time off requests table + RLS
create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  requester_auth_user_id uuid,
  auth_user_id uuid,
  requester_user_id uuid,
  start_date date not null,
  end_date date not null,
  reason text,
  note text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  manager_note text
);
${alterTimeOff}
alter table public.time_off_requests enable row level security;
alter table if exists public.time_off_requests
  alter column status set default 'PENDING',
  alter column created_at set default now(),
  alter column updated_at set default now();
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'time_off_requests_status_check'
  ) then
    alter table public.time_off_requests
      add constraint time_off_requests_status_check
      check (status in ('PENDING','APPROVED','DENIED','CANCELLED'));
  end if;
end $$;
drop policy if exists "Time off readable by requester or managers" on public.time_off_requests;
create policy "Time off readable by requester or managers"
  on public.time_off_requests
  for select
  using (
    auth.uid() = requester_auth_user_id
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = time_off_requests.organization_id
        and upper(coalesce(u.account_type, u.role, '')) in ('ADMIN', 'MANAGER')
    )
  );
drop policy if exists "Time off insertable by requester" on public.time_off_requests;
create policy "Time off insertable by requester"
  on public.time_off_requests
  for insert
  with check (
    auth.uid() = requester_auth_user_id
    and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = time_off_requests.organization_id
    )
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
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.organization_id = time_off_requests.organization_id
        and upper(coalesce(u.account_type, u.role, '')) in ('ADMIN', 'MANAGER')
    )
  );`);
    }

    if (missingShifts.length > 0) {
      const shiftAdds: string[] = [];
      if (missingShifts.includes('is_blocked')) {
        shiftAdds.push('add column if not exists is_blocked boolean not null default false');
      }
      if (missingShifts.includes('job')) {
        shiftAdds.push('add column if not exists job text');
      }
      if (shiftAdds.length > 0) {
        blocks.push(`-- Shifts: is_blocked + job
alter table if exists public.shifts
  ${shiftAdds.join(',\n  ')};`);
      }
    }

    if (missingChatRooms.length > 0) {
      const roomAdds: string[] = [];
      if (missingChatRooms.includes('organization_id')) roomAdds.push('add column if not exists organization_id uuid');
      if (missingChatRooms.includes('name')) roomAdds.push('add column if not exists name text');
      if (missingChatRooms.includes('created_by_auth_user_id')) {
        roomAdds.push('add column if not exists created_by_auth_user_id uuid');
      }
      if (missingChatRooms.includes('created_at')) {
        roomAdds.push('add column if not exists created_at timestamptz default now()');
      }
      const alterRooms = roomAdds.length
        ? `\nalter table if exists public.chat_rooms\n  ${roomAdds.join(',\n  ')};`
        : '';
      blocks.push(`-- Chat rooms table + RLS
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_rooms_org_idx on public.chat_rooms (organization_id);
${alterRooms}
alter table public.chat_rooms enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_rooms' and policyname = 'chat_rooms_select') then
    create policy chat_rooms_select on public.chat_rooms for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = chat_rooms.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_rooms' and policyname = 'chat_rooms_insert') then
    create policy chat_rooms_insert on public.chat_rooms for insert
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = chat_rooms.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;`);
    }

    if (missingChatMessages.length > 0) {
      const messageAdds: string[] = [];
      if (missingChatMessages.includes('room_id')) {
        messageAdds.push('add column if not exists room_id uuid');
      }
      if (missingChatMessages.includes('organization_id')) {
        messageAdds.push('add column if not exists organization_id uuid');
      }
      if (missingChatMessages.includes('author_auth_user_id')) {
        messageAdds.push('add column if not exists author_auth_user_id uuid');
      }
      if (missingChatMessages.includes('body')) {
        messageAdds.push('add column if not exists body text');
      }
      if (missingChatMessages.includes('created_at')) {
        messageAdds.push('add column if not exists created_at timestamptz default now()');
      }
      const alterMessages = messageAdds.length
        ? `\nalter table if exists public.chat_messages\n  ${messageAdds.join(',\n  ')};`
        : '';
      blocks.push(`-- Chat messages table + RLS
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  organization_id uuid not null,
  author_auth_user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id);
create index if not exists chat_messages_org_idx on public.chat_messages (organization_id);
${alterMessages}
alter table public.chat_messages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_select') then
    create policy chat_messages_select on public.chat_messages for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = chat_messages.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_insert') then
    create policy chat_messages_insert on public.chat_messages for insert
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = chat_messages.organization_id
        )
        and exists (
          select 1 from public.chat_rooms r
          where r.id = chat_messages.room_id
            and r.organization_id = chat_messages.organization_id
        )
      );
  end if;
end $$;`);
    }

    if (missingBlockedDays.length > 0) {
      const blockedAdds: string[] = [];
      if (missingBlockedDays.includes('organization_id')) blockedAdds.push('add column if not exists organization_id uuid');
      if (missingBlockedDays.includes('user_id')) blockedAdds.push('add column if not exists user_id uuid');
      if (missingBlockedDays.includes('scope')) blockedAdds.push("add column if not exists scope text default 'EMPLOYEE'");
      if (missingBlockedDays.includes('start_date')) blockedAdds.push('add column if not exists start_date date');
      if (missingBlockedDays.includes('end_date')) blockedAdds.push('add column if not exists end_date date');
      if (missingBlockedDays.includes('reason')) blockedAdds.push('add column if not exists reason text');
      if (missingBlockedDays.includes('status')) blockedAdds.push("add column if not exists status text default 'PENDING'");
      if (missingBlockedDays.includes('manager_note')) blockedAdds.push('add column if not exists manager_note text');
      if (missingBlockedDays.includes('requested_by_auth_user_id')) {
        blockedAdds.push('add column if not exists requested_by_auth_user_id uuid');
      }
      if (missingBlockedDays.includes('reviewed_by_auth_user_id')) {
        blockedAdds.push('add column if not exists reviewed_by_auth_user_id uuid');
      }
      if (missingBlockedDays.includes('reviewed_at')) blockedAdds.push('add column if not exists reviewed_at timestamptz');
      if (missingBlockedDays.includes('created_at')) blockedAdds.push('add column if not exists created_at timestamptz default now()');
      if (missingBlockedDays.includes('updated_at')) blockedAdds.push('add column if not exists updated_at timestamptz default now()');
      const alterBlocked = blockedAdds.length
        ? `\nalter table if exists public.blocked_day_requests\n  ${blockedAdds.join(',\n  ')};`
        : '';
      blocks.push(`-- Blocked day requests table + RLS
create table if not exists public.blocked_day_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid,
  scope text not null default 'EMPLOYEE',
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'PENDING',
  manager_note text,
  requested_by_auth_user_id uuid not null,
  reviewed_by_auth_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blocked_day_org_idx on public.blocked_day_requests (organization_id);
create index if not exists blocked_day_user_idx on public.blocked_day_requests (user_id);
${alterBlocked}
alter table public.blocked_day_requests enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blocked_day_requests' and policyname = 'blocked_day_select') then
    create policy blocked_day_select on public.blocked_day_requests for select
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = blocked_day_requests.organization_id
            and (
              lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
              or blocked_day_requests.requested_by_auth_user_id = auth.uid()
            )
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blocked_day_requests' and policyname = 'blocked_day_insert') then
    create policy blocked_day_insert on public.blocked_day_requests for insert
      with check (
        blocked_day_requests.requested_by_auth_user_id = auth.uid()
        and exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = blocked_day_requests.organization_id
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blocked_day_requests' and policyname = 'blocked_day_update') then
    create policy blocked_day_update on public.blocked_day_requests for update
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = blocked_day_requests.organization_id
            and (
              lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
              or blocked_day_requests.requested_by_auth_user_id = auth.uid()
            )
        )
      );
  end if;
end $$;`);
    }

    if (missingBusinessHours.length > 0) {
      const hoursAdds: string[] = [];
      if (missingBusinessHours.includes('organization_id')) hoursAdds.push('add column if not exists organization_id uuid');
      if (missingBusinessHours.includes('day_of_week')) hoursAdds.push('add column if not exists day_of_week int');
      if (missingBusinessHours.includes('open_time')) hoursAdds.push('add column if not exists open_time time');
      if (missingBusinessHours.includes('close_time')) hoursAdds.push('add column if not exists close_time time');
      if (missingBusinessHours.includes('enabled')) hoursAdds.push('add column if not exists enabled boolean default true');
      const alterHours = hoursAdds.length
        ? `\nalter table if exists public.business_hours\n  ${hoursAdds.join(',\n  ')};`
        : '';
      blocks.push(`-- Business hours table + RLS
create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  day_of_week int not null,
  open_time time,
  close_time time,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists business_hours_org_idx on public.business_hours (organization_id);
${alterHours}
alter table public.business_hours enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_hours' and policyname = 'business_hours_select') then
    create policy business_hours_select on public.business_hours for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = business_hours.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_hours' and policyname = 'business_hours_write') then
    create policy business_hours_write on public.business_hours for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = business_hours.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = business_hours.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;`);
    }

    return blocks;
  }, [missingColumns]);

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">DB Setup & Diagnostics</h1>
          <p className="text-theme-tertiary mt-1">
            Checks required tables/columns for ShiftFlow.
          </p>
        </header>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runChecks}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Run checks'}
            </button>
            <span className="text-xs text-theme-muted">
              Supabase URL: {supabaseUrl || '(missing)'}
            </span>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="space-y-2">
            {checks.map((check) => (
              <div
                key={check.id}
                className="flex items-start justify-between gap-3 bg-theme-tertiary border border-theme-primary rounded-lg p-3"
              >
                <div>
                  <p className="text-sm text-theme-primary font-medium">{check.label}</p>
                  {check.details && (
                    <p className="text-xs text-theme-muted mt-1">
                      {isDev ? check.details : 'Missing or inaccessible.'}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold ${
                    check.ok ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {check.ok ? 'PASS' : 'FAIL'}
                </span>
              </div>
            ))}
            {checks.length === 0 && !error && (
              <p className="text-sm text-theme-muted">No checks yet.</p>
            )}
          </div>

          <div className="pt-4 border-t border-theme-primary space-y-2">
            <h2 className="text-sm font-semibold text-theme-primary">SQL fixes (copy/paste)</h2>
            <p className="text-xs text-theme-muted">
              Use Supabase Dashboard -&gt; SQL Editor to run only the blocks you need.
            </p>
            {sqlBlocks.length === 0 ? (
              <p className="text-xs text-emerald-400">No SQL changes needed.</p>
            ) : (
              sqlBlocks.map((block, index) => (
                <pre
                  key={index}
                  className="text-xs text-theme-secondary bg-theme-primary border border-theme-primary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap"
                >
                  {block}
                </pre>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
