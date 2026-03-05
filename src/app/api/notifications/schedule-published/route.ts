import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/apiResponses';
import { sendSmtpEmail } from '@/lib/email/smtp';
import { renderScheduleReadyEmail, type ScheduleReadyShift } from '@/lib/emails/scheduleReadyEmail';
import { hashShift } from '@/lib/schedule/shiftHash';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PublishScope = 'day' | 'week';
type PublishMode = 'all' | 'changed';

type SchedulePublishedPayload = {
  organizationId: string;
  scope: PublishScope;
  rangeStart: string;
  rangeEnd: string;
  mode: PublishMode;
};

type ShiftRow = {
  id: string;
  user_id: string | null;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  job: string | null;
  location_id: string | null;
  notes?: string | null;
  comment?: string | null;
  comments?: string | null;
};

type SnapshotRow = {
  id: string;
};

type SnapshotShiftRow = {
  shift_id: string;
  user_id: string;
  shift_hash: string;
};

type RecipientUserRow = {
  id: string;
  real_email: string | null;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_MANAGER_ROLES = new Set(['admin', 'manager', 'owner']);
const EMAIL_BATCH_SIZE = 10;
const EMAIL_RETRY_DELAYS_MS = [250, 750, 1500] as const;

function normalizeDate(value: unknown): string {
  return String(value ?? '').trim();
}

function isValidDate(value: string): boolean {
  return DATE_RE.test(value);
}

function normalizeRole(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getAppBaseUrl(request: NextRequest): string {
  const explicitSite = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  const fallback = String(request.nextUrl.origin ?? '').trim();
  return trimTrailingSlash(explicitSite || fallback || 'https://app.crewshyft.com');
}

function getLoginPathUrl(request: NextRequest): string {
  const explicitLogin =
    String(process.env.NEXT_PUBLIC_LOGIN_URL ?? '').trim()
    || String(process.env.NEXT_PUBLIC_LOGIN_URL_BASE ?? '').trim();
  const fallback = 'https://login.crewshyft.com/login';
  const seed = explicitLogin || fallback;

  try {
    const parsed = new URL(seed);
    const normalizedPath = parsed.pathname && parsed.pathname !== '/'
      ? parsed.pathname
      : '/login';
    parsed.pathname = normalizedPath;
    if (!parsed.searchParams.has('redirect')) {
      parsed.searchParams.set('redirect', `${getAppBaseUrl(request)}/schedule/builder`);
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function getManageNotificationsUrl(request: NextRequest): string {
  return `${getAppBaseUrl(request)}/profile`;
}

function parseDateUtc(ymd: string): Date | null {
  const match = DATE_RE.exec(String(ymd ?? '').trim());
  if (!match) return null;
  const year = Number(match[0].slice(0, 4));
  const month = Number(match[0].slice(5, 7));
  const day = Number(match[0].slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function formatRangeLabel(rangeStart: string, rangeEnd: string): string {
  const start = parseDateUtc(rangeStart);
  const end = parseDateUtc(rangeEnd);
  if (!start || !end) return `${rangeStart} - ${rangeEnd}`;

  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const monthDayYear = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (start.getTime() === end.getTime()) {
    return monthDayYear.format(start);
  }

  if (startYear === endYear) {
    const startMonth = start.getUTCMonth();
    const endMonth = end.getUTCMonth();
    if (startMonth === endMonth) {
      const startMonthLabel = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        timeZone: 'UTC',
      }).format(start);
      return `${startMonthLabel} ${start.getUTCDate()}\u2013${end.getUTCDate()}, ${startYear}`;
    }
    return `${monthDay.format(start)}\u2013${monthDay.format(end)}, ${startYear}`;
  }

  return `${monthDayYear.format(start)}\u2013${monthDayYear.format(end)}`;
}

function normalizeDbTime(value: string | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes >= 60) return null;
  if (hours === 24 && minutes > 0) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTimeToMinutes(value: string | null): number | null {
  const normalized = normalizeDbTime(value);
  if (!normalized) return null;
  const [hoursText, minutesText] = normalized.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function readShiftNote(shift: ShiftRow): string | null {
  const note = String(shift.notes ?? shift.comment ?? shift.comments ?? '').trim();
  return note || null;
}

function readNonEmptyString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function getEmployeeNameForEmail(row: RecipientUserRow): string | null {
  const firstName = readNonEmptyString(row.first_name);
  if (firstName) return firstName;
  const fullName = readNonEmptyString(row.full_name) ?? readNonEmptyString(row.name);
  if (fullName) return fullName;
  const combined = `${readNonEmptyString(row.first_name) ?? ''} ${readNonEmptyString(row.last_name) ?? ''}`.trim();
  return combined || null;
}

async function loadShiftRowsForRange(params: {
  organizationId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<{ rows: ShiftRow[]; error: { message: string } | null }> {
  const selectCandidates = [
    'id,user_id,shift_date,start_time,end_time,job,location_id,notes,comment,comments',
    'id,user_id,shift_date,start_time,end_time,job,location_id,notes,comment',
    'id,user_id,shift_date,start_time,end_time,job,location_id,notes,comments',
    'id,user_id,shift_date,start_time,end_time,job,location_id,notes',
    'id,user_id,shift_date,start_time,end_time,job,location_id,comment',
    'id,user_id,shift_date,start_time,end_time,job,location_id,comments',
  ] as const;

  let lastError: { message: string } | null = null;
  for (const selectColumns of selectCandidates) {
    const result = await supabaseAdmin
      .from('shifts')
      .select(selectColumns)
      .eq('organization_id', params.organizationId)
      .or('is_blocked.is.null,is_blocked.eq.false')
      .not('user_id', 'is', null)
      .gte('shift_date', params.rangeStart)
      .lte('shift_date', params.rangeEnd);

    if (!result.error) {
      return { rows: (result.data ?? []) as unknown as ShiftRow[], error: null };
    }

    lastError = { message: String(result.error.message ?? 'Failed to load shifts.') };
    const message = String(result.error.message ?? '').toLowerCase();
    const isMissingOptionalColumn =
      message.includes('column')
      && (message.includes('notes') || message.includes('comment'));
    if (!isMissingOptionalColumn) break;
  }

  return { rows: [], error: lastError };
}

async function loadRecipientUserRows(params: {
  organizationId: string;
  recipientUserIdList: string[];
}): Promise<{ rows: RecipientUserRow[]; error: { message: string } | null }> {
  const selectCandidates = [
    'id,real_email,email,first_name,last_name,full_name,name',
    'id,real_email,email,full_name,name',
    'id,real_email,email,full_name',
    'id,real_email,email',
  ] as const;

  let lastError: { message: string } | null = null;
  for (const selectColumns of selectCandidates) {
    const result = await supabaseAdmin
      .from('users')
      .select(selectColumns)
      .eq('organization_id', params.organizationId)
      .in('id', params.recipientUserIdList);

    if (!result.error) {
      return { rows: (result.data ?? []) as unknown as RecipientUserRow[], error: null };
    }

    lastError = { message: String(result.error.message ?? 'Failed to load users.') };
    const message = String(result.error.message ?? '').toLowerCase();
    const isMissingOptionalColumn =
      message.includes('column')
      && (
        message.includes('first_name')
        || message.includes('last_name')
        || message.includes('full_name')
        || message.includes('name')
      );
    if (!isMissingOptionalColumn) break;
  }

  return { rows: [], error: lastError };
}

function toScheduleReadyShift(shift: ShiftRow): ScheduleReadyShift | null {
  const dateISO = String(shift.shift_date ?? '').trim();
  if (!DATE_RE.test(dateISO)) return null;

  const startTime = normalizeDbTime(shift.start_time);
  const endTime = normalizeDbTime(shift.end_time);
  if (!startTime || !endTime) return null;

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes < startMinutes) return null;

  const jobLabel = String(shift.job ?? '').trim() || 'Shift';
  const hours = Math.max(0, (endMinutes - startMinutes) / 60);

  return {
    dateISO,
    startTime,
    endTime,
    jobLabel,
    hours,
    note: readShiftNote(shift),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || 'Unknown error';
  }
  return String(error ?? 'Unknown error');
}

function isTransientSmtpError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const details = error as {
    code?: unknown;
    responseCode?: unknown;
    statusCode?: unknown;
    message?: unknown;
  };

  const code = String(details.code ?? '').toUpperCase();
  const retryableCodes = new Set([
    'ETIMEDOUT',
    'ECONNECTION',
    'ECONNRESET',
    'ESOCKET',
    'EAI_AGAIN',
    'ENOTFOUND',
    'EPIPE',
  ]);
  if (retryableCodes.has(code)) return true;

  const responseCode = Number(details.responseCode ?? details.statusCode);
  if (Number.isFinite(responseCode) && responseCode >= 400 && responseCode <= 599) {
    return true;
  }

  const message = String(details.message ?? '').toLowerCase();
  if (!message) return false;

  return (
    message.includes('timeout') ||
    message.includes('temporar') ||
    message.includes('try again') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

type EmailJob = { to: string; subject: string; html: string; text: string };

type EmailSendAttemptResult = {
  to: string;
  ok: boolean;
  attempts: number;
  error?: string;
};

async function sendEmailWithRetry(task: EmailJob): Promise<EmailSendAttemptResult> {
  for (let attempt = 0; attempt <= EMAIL_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await sendSmtpEmail({
        to: task.to,
        subject: task.subject,
        html: task.html,
        text: task.text,
      });
      return {
        to: task.to,
        ok: true,
        attempts: attempt + 1,
      };
    } catch (error) {
      const canRetry =
        attempt < EMAIL_RETRY_DELAYS_MS.length && isTransientSmtpError(error);
      if (!canRetry) {
        return {
          to: task.to,
          ok: false,
          attempts: attempt + 1,
          error: getErrorMessage(error),
        };
      }
      await sleep(EMAIL_RETRY_DELAYS_MS[attempt]);
    }
  }

  return {
    to: task.to,
    ok: false,
    attempts: EMAIL_RETRY_DELAYS_MS.length + 1,
    error: 'Unknown SMTP send failure.',
  };
}

async function sendEmailsInBatches(
  tasks: EmailJob[],
): Promise<{
  sent: number;
  failed: number;
  failedEmails: string[];
  failedResults: Array<{ email: string; attempts: number; error: string }>;
}> {
  let sent = 0;
  let failed = 0;
  const failedEmails: string[] = [];
  const failedResults: Array<{ email: string; attempts: number; error: string }> = [];

  for (let i = 0; i < tasks.length; i += EMAIL_BATCH_SIZE) {
    const chunk = tasks.slice(i, i + EMAIL_BATCH_SIZE);
    const results = await Promise.all(chunk.map((task) => sendEmailWithRetry(task)));

    for (const result of results) {
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        failedEmails.push(result.to);
        failedResults.push({
          email: result.to,
          attempts: result.attempts,
          error: result.error ?? 'Unknown SMTP send failure.',
        });
      }
    }
  }

  return { sent, failed, failedEmails, failedResults };
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  let payload: SchedulePublishedPayload;
  try {
    payload = (await request.json()) as SchedulePublishedPayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.', requestId },
      { status: 400 },
    );
  }

  const organizationId = String(payload.organizationId ?? '').trim();
  const scope = String(payload.scope ?? '').trim() as PublishScope;
  const rangeStart = normalizeDate(payload.rangeStart);
  const rangeEnd = normalizeDate(payload.rangeEnd);
  const mode = String(payload.mode ?? '').trim() as PublishMode;

  if (!organizationId) {
    return NextResponse.json(
      { error: 'organizationId is required.', requestId },
      { status: 400 },
    );
  }
  if (!(scope === 'day' || scope === 'week')) {
    return NextResponse.json(
      { error: 'scope must be "day" or "week".', requestId },
      { status: 400 },
    );
  }
  if (!isValidDate(rangeStart) || !isValidDate(rangeEnd)) {
    return NextResponse.json(
      { error: 'rangeStart and rangeEnd must be YYYY-MM-DD.', requestId },
      { status: 400 },
    );
  }
  if (rangeStart > rangeEnd) {
    return NextResponse.json(
      { error: 'rangeStart must be <= rangeEnd.', requestId },
      { status: 400 },
    );
  }
  if (!(mode === 'all' || mode === 'changed')) {
    return NextResponse.json(
      { error: 'mode must be "all" or "changed".', requestId },
      { status: 400 },
    );
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = String(authData.user?.id ?? '').trim();
  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in.'
        : authError?.message || 'Not signed in.';
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: membershipRow, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const requesterRole = normalizeRole(membershipRow?.role);
  if (membershipError || !membershipRow || !ALLOWED_MANAGER_ROLES.has(requesterRole)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  const { data: orgRow, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('name,timezone')
    .eq('id', organizationId)
    .maybeSingle();

  if (orgError) {
    return applySupabaseCookies(
      NextResponse.json({ error: orgError.message, requestId }, { status: 400 }),
      response,
    );
  }

  const organization = orgRow as { name?: unknown; timezone?: unknown } | null;
  const restaurantName = String(organization?.name ?? 'CrewShyft').trim() || 'CrewShyft';
  const organizationTimezone = String(organization?.timezone ?? '').trim() || 'UTC';
  const weekLabel = `Week of ${formatRangeLabel(rangeStart, rangeEnd)}`;
  const viewScheduleUrl = getLoginPathUrl(request);
  const manageNotificationsUrl = getManageNotificationsUrl(request);

  // Use DB-side inclusive date filtering on schedule-local shift_date to avoid JS timezone drift.
  const { rows: shifts, error: shiftsError } = await loadShiftRowsForRange({
    organizationId,
    rangeStart,
    rangeEnd,
  });
  if (shiftsError) {
    return applySupabaseCookies(
      NextResponse.json({ error: shiftsError.message, requestId }, { status: 400 }),
      response,
    );
  }
  const scheduledUserIdsInRange = new Set<string>();
  const shiftsByUserId = new Map<string, ScheduleReadyShift[]>();
  for (const shift of shifts) {
    const userId = String(shift.user_id ?? '').trim();
    if (userId) {
      scheduledUserIdsInRange.add(userId);
      const scheduleShift = toScheduleReadyShift(shift);
      if (scheduleShift) {
        const existing = shiftsByUserId.get(userId) ?? [];
        existing.push(scheduleShift);
        shiftsByUserId.set(userId, existing);
      }
    }
  }
  for (const [userId, userShifts] of shiftsByUserId.entries()) {
    userShifts.sort((a, b) => {
      if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
      const aStart = parseTimeToMinutes(a.startTime);
      const bStart = parseTimeToMinutes(b.startTime);
      if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart;
      const aEnd = parseTimeToMinutes(a.endTime);
      const bEnd = parseTimeToMinutes(b.endTime);
      if (aEnd !== null && bEnd !== null && aEnd !== bEnd) return aEnd - bEnd;
      return a.jobLabel.localeCompare(b.jobLabel);
    });
    shiftsByUserId.set(userId, userShifts);
  }

  const currentSnapshotRows: SnapshotShiftRow[] = shifts
    .filter((shift) => Boolean(shift.id) && Boolean(String(shift.user_id ?? '').trim()))
    .map((shift) => ({
      shift_id: String(shift.id),
      user_id: String(shift.user_id),
      shift_hash: hashShift({
        user_id: shift.user_id,
        start_time: shift.start_time,
        end_time: shift.end_time,
        job: shift.job,
        location_id: shift.location_id,
        notes: readShiftNote(shift),
      }),
    }));

  const recipientUserIds = new Set<string>();
  if (mode === 'all') {
    for (const userId of scheduledUserIdsInRange) {
      recipientUserIds.add(userId);
    }
  } else {
    const { data: latestSnapshotRaw, error: latestSnapshotError } = await supabaseAdmin
      .from('schedule_publish_snapshots')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('scope', scope)
      .eq('range_start', rangeStart)
      .eq('range_end', rangeEnd)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSnapshotError) {
      return applySupabaseCookies(
        NextResponse.json({ error: latestSnapshotError.message, requestId }, { status: 400 }),
        response,
      );
    }

    const latestSnapshot = latestSnapshotRaw as SnapshotRow | null;
    if (!latestSnapshot?.id) {
      for (const row of currentSnapshotRows) {
        recipientUserIds.add(row.user_id);
      }
    } else {
      const { data: priorSnapshotRowsRaw, error: priorSnapshotRowsError } = await supabaseAdmin
        .from('schedule_publish_snapshot_shifts')
        .select('shift_id,user_id,shift_hash')
        .eq('snapshot_id', latestSnapshot.id);

      if (priorSnapshotRowsError) {
        return applySupabaseCookies(
          NextResponse.json({ error: priorSnapshotRowsError.message, requestId }, { status: 400 }),
          response,
        );
      }

      const priorByShiftId = new Map<string, string>();
      for (const row of (priorSnapshotRowsRaw ?? []) as SnapshotShiftRow[]) {
        priorByShiftId.set(String(row.shift_id), String(row.shift_hash));
      }

      for (const row of currentSnapshotRows) {
        const priorHash = priorByShiftId.get(row.shift_id);
        if (!priorHash || priorHash !== row.shift_hash) {
          recipientUserIds.add(row.user_id);
        }
      }
    }
  }

  const recipientUserIdList = Array.from(recipientUserIds);
  const recipientsTotal = recipientUserIdList.length;
  const adminDebug = String(process.env.ADMIN_DEBUG ?? '').trim() === '1';
  let skippedNoEmail = 0;
  let resolvedEmails = 0;
  let sent = 0;
  let failed = 0;
  let failedEmails: string[] = [];
  let failedResults: Array<{ email: string; attempts: number; error: string }> = [];

  const emailJobs: EmailJob[] = [];

  if (recipientUserIdList.length > 0) {
    const { rows: userRows, error: userRowsError } = await loadRecipientUserRows({
      organizationId,
      recipientUserIdList,
    });
    if (userRowsError) {
      return applySupabaseCookies(
        NextResponse.json({ error: userRowsError.message, requestId }, { status: 400 }),
        response,
      );
    }

    const emailByUserId = new Map<string, string>();
    const employeeNameByUserId = new Map<string, string | null>();
    for (const row of userRows) {
      const email = String(row.real_email ?? row.email ?? '').trim().toLowerCase();
      if (email) {
        emailByUserId.set(String(row.id), email);
      }
      employeeNameByUserId.set(String(row.id), getEmployeeNameForEmail(row));
    }

    for (const userId of recipientUserIdList) {
      const email = emailByUserId.get(userId);
      if (!email) {
        skippedNoEmail += 1;
        continue;
      }
      resolvedEmails += 1;

      const userShifts = shiftsByUserId.get(userId) ?? [];
      const totalHours = userShifts.reduce((sum, shift) => sum + shift.hours, 0);
      const rendered = renderScheduleReadyEmail({
        restaurantName,
        weekLabel,
        shifts: userShifts,
        totalHours,
        viewScheduleUrl,
        manageNotificationsUrl,
        employeeName: employeeNameByUserId.get(userId) ?? null,
      });

      emailJobs.push({
        to: email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    }
  }

  if (emailJobs.length > 0) {
    const sendResults = await sendEmailsInBatches(emailJobs);
    sent = sendResults.sent;
    failed = sendResults.failed;
    failedEmails = sendResults.failedEmails;
    failedResults = sendResults.failedResults;
  }

  if (failed > 0) {
    console.error('[schedule-published] Partial email delivery failure', {
      requestId,
      organizationId,
      organizationTimezone,
      scope,
      mode,
      rangeStart,
      rangeEnd,
      recipientsTotal,
      resolvedEmails,
      skippedNoEmail,
      sent,
      failed,
      failedResults,
    });
  }

  const { data: snapshotInsertRaw, error: snapshotInsertError } = await supabaseAdmin
    .from('schedule_publish_snapshots')
    .insert({
      organization_id: organizationId,
      scope,
      range_start: rangeStart,
      range_end: rangeEnd,
      created_by_auth_user_id: authUserId,
    })
    .select('id')
    .single();

  if (snapshotInsertError) {
    return applySupabaseCookies(
      NextResponse.json({ error: snapshotInsertError.message, requestId }, { status: 400 }),
      response,
    );
  }

  const snapshotId = String((snapshotInsertRaw as SnapshotRow).id ?? '').trim();
  if (snapshotId && currentSnapshotRows.length > 0) {
    const shiftSnapshotPayload = currentSnapshotRows.map((row) => ({
      snapshot_id: snapshotId,
      shift_id: row.shift_id,
      user_id: row.user_id,
      shift_hash: row.shift_hash,
    }));

    const { error: snapshotShiftsInsertError } = await supabaseAdmin
      .from('schedule_publish_snapshot_shifts')
      .insert(shiftSnapshotPayload);

    if (snapshotShiftsInsertError) {
      return applySupabaseCookies(
        NextResponse.json({ error: snapshotShiftsInsertError.message, requestId }, { status: 400 }),
        response,
      );
    }
  }

  return applySupabaseCookies(
    NextResponse.json({
      ok: true,
      requestId,
      mode,
      scope,
      recipientsTotal,
      resolvedEmails,
      skippedNoEmail,
      sent,
      failed,
      ...(adminDebug && failedEmails.length > 0
        ? { failedEmails: Array.from(new Set(failedEmails)) }
        : {}),
    }),
    response,
  );
}
