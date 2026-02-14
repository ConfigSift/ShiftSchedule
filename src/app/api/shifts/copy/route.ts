import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';
import { shiftsOverlap } from '@/utils/timeUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CopyMode = 'nextDay' | 'nextWeek' | 'weeksAhead' | 'dateRange';

type CopyPayload = {
  sourceWeekStart: string;
  sourceWeekEnd: string;
  sourceDay?: string;
  mode: CopyMode;
  weeksAhead?: number;
  targetStartWeek?: string;
  targetEndWeek?: string;
  allowOverrideBlocked?: boolean;
  sourceScheduleState?: 'draft' | 'published';
  targetScheduleState?: 'draft' | 'published';
};

type ExistingShift = {
  user_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  job?: string | null;
};

type SkipEntry = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  job?: string | null;
  reason: 'blocked' | 'duplicate' | 'overlap';
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value?: string) {
  return Boolean(value && DATE_RE.test(value));
}

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function weekStart(dateStr: string, weekStartDay: 'sunday' | 'monday') {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay();
  const weekStartsOn = weekStartDay === 'monday' ? 1 : 0;
  const diff = (day - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}

function dayDiff(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function parseTimeToDecimal(value: string | null | undefined) {
  if (!value) return 0;
  const [hours, minutes = '0'] = value.split(':');
  const hour = Number(hours);
  const minute = Number(minutes);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour + minute / 60;
}

export async function POST(request: NextRequest) {
  let payload: CopyPayload;
  try {
    payload = (await request.json()) as CopyPayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.', details: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (!payload.mode) {
    return NextResponse.json({ error: 'Missing or invalid fields.' }, { status: 400 });
  }
  if (payload.mode === 'nextDay' && !isValidDate(payload.sourceDay)) {
    return NextResponse.json({ error: 'sourceDay is required.' }, { status: 400 });
  }
  if (payload.mode !== 'nextDay' && (!isValidDate(payload.sourceWeekStart) || !isValidDate(payload.sourceWeekEnd))) {
    return NextResponse.json({ error: 'Missing or invalid fields.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: requesterRow, error: requesterError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const requester = normalizeUserRow(requesterRow);
  const requesterRole = requester.role;
  if (!['ADMIN', 'MANAGER'].includes(requesterRole)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  const organizationId = requester.organizationId;
  if (!organizationId) {
    return applySupabaseCookies(jsonError('Organization missing.', 400), response);
  }

  const { data: settingsRow } = await supabaseAdmin
    .from('schedule_view_settings')
    .select('week_start_day')
    .eq('organization_id', organizationId)
    .maybeSingle();
  const weekStartDay = settingsRow?.week_start_day === 'monday' ? 'monday' : 'sunday';

  let targetWeekStarts: string[] = [];
  const isDayMode = payload.mode === 'nextDay';
  if (payload.mode === 'nextDay') {
    targetWeekStarts = [addDays(payload.sourceDay!, 1)];
  } else if (payload.mode === 'nextWeek') {
    targetWeekStarts = [addDays(payload.sourceWeekStart, 7)];
  } else if (payload.mode === 'weeksAhead') {
    const weeksAhead = Number(payload.weeksAhead);
    if (!Number.isFinite(weeksAhead) || weeksAhead < 1 || weeksAhead > 8) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'weeksAhead must be between 1 and 8.' }, { status: 400 }),
        response
      );
    }
    targetWeekStarts = [addDays(payload.sourceWeekStart, 7 * weeksAhead)];
  } else if (payload.mode === 'dateRange') {
    if (!isValidDate(payload.targetStartWeek) || !isValidDate(payload.targetEndWeek)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'targetStartWeek and targetEndWeek are required.' }, { status: 400 }),
        response
      );
    }
    const start = weekStart(payload.targetStartWeek!, weekStartDay);
    const end = weekStart(payload.targetEndWeek!, weekStartDay);
    if (start > end) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'targetEndWeek must be after targetStartWeek.' }, { status: 400 }),
        response
      );
    }
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
      targetWeekStarts.push(cursor);
    }
  } else {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid mode.' }, { status: 400 }),
      response
    );
  }

  const allowOverrideBlocked = Boolean(payload.allowOverrideBlocked);
  const sourceScheduleState = payload.sourceScheduleState ?? 'published';
  const targetScheduleState = payload.targetScheduleState ?? 'draft';
  if (!['draft', 'published'].includes(sourceScheduleState)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'sourceScheduleState must be draft or published.' }, { status: 400 }),
      response
    );
  }
  if (!['draft', 'published'].includes(targetScheduleState)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'targetScheduleState must be draft or published.' }, { status: 400 }),
      response
    );
  }
  const sourceWeekStart = isDayMode ? payload.sourceDay! : payload.sourceWeekStart;
  const sourceWeekEnd = isDayMode ? payload.sourceDay! : payload.sourceWeekEnd;

  const { data: sourceShifts, error: sourceError } = await supabaseAdmin
    .from('shifts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('schedule_state', sourceScheduleState)
    .gte('shift_date', sourceWeekStart)
    .lte('shift_date', sourceWeekEnd);

  if (sourceError) {
    return applySupabaseCookies(
      NextResponse.json({ error: sourceError.message }, { status: 400 }),
      response
    );
  }

  if (!sourceShifts || sourceShifts.length === 0) {
    return applySupabaseCookies(
      NextResponse.json({
        created_count: 0,
        skipped_overlap_count: 0,
        skipped_blocked_count: 0,
        skipped_duplicate_count: 0,
      }),
      response
    );
  }

  const targetRangeStart = targetWeekStarts.reduce((min, cur) => (cur < min ? cur : min), targetWeekStarts[0]);
  const targetRangeEnd = addDays(
    targetWeekStarts.reduce((max, cur) => (cur > max ? cur : max), targetWeekStarts[0]),
    isDayMode ? 0 : 6
  );

  if (targetScheduleState === 'draft') {
    const { error: deleteError } = await supabaseAdmin
      .from('shifts')
      .delete()
      .eq('organization_id', organizationId)
      .eq('schedule_state', 'draft')
      .gte('shift_date', targetRangeStart)
      .lte('shift_date', targetRangeEnd);

    if (deleteError) {
      return applySupabaseCookies(
        NextResponse.json({ error: deleteError.message }, { status: 400 }),
        response
      );
    }
  }

  const { data: existingShifts, error: existingError } = await supabaseAdmin
    .from('shifts')
    .select('user_id,shift_date,start_time,end_time,job')
    .eq('organization_id', organizationId)
    .eq('schedule_state', targetScheduleState)
    .gte('shift_date', targetRangeStart)
    .lte('shift_date', targetRangeEnd);

  if (existingError) {
    return applySupabaseCookies(
      NextResponse.json({ error: existingError.message }, { status: 400 }),
      response
    );
  }

  const { data: blockedDays, error: blockedError } = await supabaseAdmin
    .from('blocked_day_requests')
    .select('user_id,scope,start_date,end_date,status')
    .eq('organization_id', organizationId)
    .eq('status', 'APPROVED')
    .lte('start_date', targetRangeEnd)
    .gte('end_date', targetRangeStart);

  if (blockedError) {
    return applySupabaseCookies(
      NextResponse.json({ error: blockedError.message }, { status: 400 }),
      response
    );
  }

  const existingByKey = new Map<string, Array<{
    start: number;
    end: number;
    startTime: string;
    endTime: string;
    job: string | null;
  }>>();

  (existingShifts as ExistingShift[] | null)?.forEach((shift) => {
    const key = `${shift.user_id}|${shift.shift_date}`;
    const list = existingByKey.get(key) ?? [];
    list.push({
      start: parseTimeToDecimal(shift.start_time),
      end: parseTimeToDecimal(shift.end_time),
      startTime: String(shift.start_time ?? ''),
      endTime: String(shift.end_time ?? ''),
      job: shift.job ?? null,
    });
    existingByKey.set(key, list);
  });

  const skipped: SkipEntry[] = [];
  let createdCount = 0;
  let skippedOverlap = 0;
  let skippedBlocked = 0;
  let skippedDuplicate = 0;
  const inserts: Array<Record<string, unknown>> = [];

  for (const sourceShift of sourceShifts) {
    const sourceDate = String(sourceShift.shift_date);
    const dayOffset = dayDiff(sourceWeekStart, sourceDate);
    const sourceStartTime = String(sourceShift.start_time ?? '');
    const sourceEndTime = String(sourceShift.end_time ?? '');
    const sourceStart = parseTimeToDecimal(sourceStartTime);
    const sourceEnd = parseTimeToDecimal(sourceEndTime);
    const sourceJob = sourceShift.job ?? null;

    for (const targetWeekStart of targetWeekStarts) {
      const targetDate = addDays(targetWeekStart, dayOffset);
      const key = `${sourceShift.user_id}|${targetDate}`;
      const existing = existingByKey.get(key) ?? [];

      const isBlocked = !allowOverrideBlocked && (blockedDays ?? []).some((block) => {
        const scope = String(block.scope || '').toUpperCase();
        if (scope === 'ORG_BLACKOUT' && targetDate >= block.start_date && targetDate <= block.end_date) {
          return true;
        }
        if (
          scope === 'EMPLOYEE' &&
          block.user_id === sourceShift.user_id &&
          targetDate >= block.start_date &&
          targetDate <= block.end_date
        ) {
          return true;
        }
        return false;
      });

      if (isBlocked) {
        skippedBlocked += 1;
        skipped?.push({
          employeeId: sourceShift.user_id,
          date: targetDate,
          startTime: sourceStartTime,
          endTime: sourceEndTime,
          job: sourceJob,
          reason: 'blocked',
        });
        continue;
      }

      const isDuplicate = existing.some(
        (item) =>
          item.startTime === sourceStartTime &&
          item.endTime === sourceEndTime &&
          String(item.job ?? '') === String(sourceJob ?? '')
      );
      if (isDuplicate) {
        skippedDuplicate += 1;
        skipped?.push({
          employeeId: sourceShift.user_id,
          date: targetDate,
          startTime: sourceStartTime,
          endTime: sourceEndTime,
          job: sourceJob,
          reason: 'duplicate',
        });
        continue;
      }

      const hasOverlap = existing.some((item) => shiftsOverlap(sourceStart, sourceEnd, item.start, item.end));
      if (hasOverlap) {
        skippedOverlap += 1;
        skipped?.push({
          employeeId: sourceShift.user_id,
          date: targetDate,
          startTime: sourceStartTime,
          endTime: sourceEndTime,
          job: sourceJob,
          reason: 'overlap',
        });
        continue;
      }

      inserts.push({
        organization_id: organizationId,
        user_id: sourceShift.user_id,
        shift_date: targetDate,
        start_time: sourceStartTime,
        end_time: sourceEndTime,
        notes: sourceShift.notes ?? null,
        is_blocked: sourceShift.is_blocked ?? false,
        schedule_state: targetScheduleState,
        job: sourceShift.job ?? null,
        location_id: sourceShift.location_id ?? null,
      });

      existing.push({
        start: sourceStart,
        end: sourceEnd,
        startTime: sourceStartTime,
        endTime: sourceEndTime,
        job: sourceJob,
      });
      existingByKey.set(key, existing);
      createdCount += 1;
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('shifts').insert(inserts);
    if (insertError) {
      return applySupabaseCookies(
        NextResponse.json({ error: insertError.message }, { status: 400 }),
        response
      );
    }
  }

  return applySupabaseCookies(
    NextResponse.json({
      created_count: createdCount,
      skipped_overlap_count: skippedOverlap,
      skipped_blocked_count: skippedBlocked,
      skipped_duplicate_count: skippedDuplicate,
      skipped,
    }),
    response
  );
}
