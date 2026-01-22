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

const USERS_REQUIRED_COLUMNS = ['auth_user_id', 'organization_id', 'email', 'jobs', 'pin_code'];
const USERS_NAME_COLUMNS = ['full_name', 'first_name', 'last_name'];
const USERS_ROLE_COLUMNS = ['account_type', 'role'];

const TIME_OFF_REQUIRED_COLUMNS = [
  'organization_id',
  'start_date',
  'end_date',
  'status',
  'reason',
  'manager_note',
  'created_at',
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
      if (userAdds.length > 0) {
        blocks.push(`-- Users: jobs + pin_code
alter table if exists public.users
  ${userAdds.join(',\n  ')};`);
      }
    }

    if (missingTimeOff.length > 0) {
      const timeOffAdds: string[] = [];
      if (missingTimeOff.includes('manager_note')) {
        timeOffAdds.push('add column if not exists manager_note text');
      }
      if (missingTimeOff.includes('created_at')) {
        timeOffAdds.push('add column if not exists created_at timestamptz default now()');
      }
      if (missingTimeOff.includes('requester_auth_user_id')) {
        timeOffAdds.push('add column if not exists requester_auth_user_id uuid');
      }
      if (timeOffAdds.length > 0) {
        blocks.push(`-- Time off: manager_note + created_at + requester_auth_user_id
alter table if exists public.time_off_requests
  ${timeOffAdds.join(',\n  ')};
alter table if exists public.time_off_requests
  alter column created_at set default now();`);
      }
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
