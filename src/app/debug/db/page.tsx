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

const REQUIRED_TIME_OFF_COLUMNS = [
  'organization_id',
  'user_id',
  'requester_auth_user_id',
  'auth_user_id',
  'requester_user_id',
  'start_date',
  'end_date',
  'reason',
  'note',
  'status',
  'created_at',
  'updated_at',
  'reviewed_by',
  'reviewed_at',
  'manager_note',
];

export default function DebugDbPage() {
  const { supabaseUrl, isValid } = getSupabaseEnv();
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runChecks = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isValid) {
        throw new Error(formatSupabaseEnvError());
      }

      const client = getSupabaseClient();

      const schemaClient = (client as any).schema ? (client as any).schema('information_schema') : client;

      const { data: tables, error: tablesError } = await schemaClient
        .from('tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['time_off_requests', 'shifts']);

      if (tablesError) {
        throw new Error(tablesError.message);
      }

      const tableRows = (tables || []) as Array<{ table_name: string }>;
      const tableSet = new Set(tableRows.map((row) => row.table_name));
      const timeOffExists = tableSet.has('time_off_requests');
      const shiftsExists = tableSet.has('shifts');

      const { data: columns, error: columnsError } = await schemaClient
        .from('columns')
        .select('table_name,column_name')
        .eq('table_schema', 'public')
        .in('table_name', ['time_off_requests', 'shifts']);

      if (columnsError) {
        throw new Error(columnsError.message);
      }

      const columnMap = new Map<string, Set<string>>();
      const columnRows = (columns || []) as Array<{ table_name: string; column_name: string }>;
      columnRows.forEach((row) => {
        if (!columnMap.has(row.table_name)) {
          columnMap.set(row.table_name, new Set());
        }
        columnMap.get(row.table_name)?.add(row.column_name);
      });

      const timeOffColumns = columnMap.get('time_off_requests') ?? new Set<string>();
      const missingTimeOffColumns = REQUIRED_TIME_OFF_COLUMNS.filter((col) => !timeOffColumns.has(col));
      const shiftsColumns = columnMap.get('shifts') ?? new Set<string>();
      const missingShiftColumns = ['is_blocked', 'job'].filter((col) => !shiftsColumns.has(col));

      setChecks([
        {
          id: 'time_off_table',
          label: 'public.time_off_requests table exists',
          ok: timeOffExists,
        },
        {
          id: 'time_off_columns',
          label: 'time_off_requests has required columns',
          ok: timeOffExists && missingTimeOffColumns.length === 0,
          details: missingTimeOffColumns.length ? `Missing: ${missingTimeOffColumns.join(', ')}` : undefined,
        },
        {
          id: 'shifts_is_blocked',
          label: 'public.shifts has is_blocked column',
          ok: shiftsExists && !missingShiftColumns.includes('is_blocked'),
        },
        {
          id: 'shifts_job',
          label: 'public.shifts has job column',
          ok: shiftsExists && !missingShiftColumns.includes('job'),
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to run DB checks.';
      setError(message);
      setChecks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runChecks();
  }, []);

  const missingTimeOff = useMemo(
    () => checks.some((check) => check.id.startsWith('time_off') && !check.ok),
    [checks]
  );
  const missingShiftColumns = useMemo(
    () =>
      checks.some((check) => check.id === 'shifts_is_blocked' && !check.ok) ||
      checks.some((check) => check.id === 'shifts_job' && !check.ok),
    [checks]
  );

  const sqlBlocks = useMemo(() => {
    const blocks: string[] = [];

    if (missingTimeOff) {
      blocks.push(`-- Time off requests table + policies
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

alter table if exists public.time_off_requests enable row level security;

alter table if exists public.time_off_requests
  add column if not exists organization_id uuid,
  add column if not exists user_id uuid,
  add column if not exists requester_auth_user_id uuid,
  add column if not exists auth_user_id uuid,
  add column if not exists requester_user_id uuid,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists reason text,
  add column if not exists note text,
  add column if not exists status text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists manager_note text;

alter table if exists public.time_off_requests
  alter column status set default 'PENDING',
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
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

    if (missingShiftColumns) {
      blocks.push(`-- Shifts columns used by the app
alter table if exists public.shifts
  add column if not exists is_blocked boolean not null default false,
  add column if not exists job text;`);
    }

    return blocks;
  }, [missingTimeOff, missingShiftColumns]);

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
                  {check.details && <p className="text-xs text-theme-muted mt-1">{check.details}</p>}
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
              Use Supabase Dashboard → SQL Editor to run only the blocks you need.
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
