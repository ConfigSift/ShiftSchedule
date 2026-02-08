import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SaveShiftPayload = {
  id?: string;
  organizationId: string;
  employeeId: string;
  date: string;
  startHour: number;
  endHour: number;
  notes?: string | null;
  job?: string | null;
  locationId?: string | null;
  scheduleState?: 'draft' | 'published';
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (value?: string) => Boolean(value && DATE_RE.test(value));

const formatTimeFromDecimal = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  const hours = Math.floor(safe);
  const minutes = Math.round((safe - hours) * 60);
  const paddedHours = String(Math.max(0, Math.min(23, hours))).padStart(2, '0');
  const paddedMinutes = String(Math.max(0, Math.min(59, minutes))).padStart(2, '0');
  return `${paddedHours}:${paddedMinutes}:00`;
};

const parseTimeToDecimal = (value?: string | null) => {
  if (!value) return 0;
  const [hours, minutes = '0'] = String(value).split(':');
  const hour = Number(hours);
  const minute = Number(minutes);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour + minute / 60;
};

const timeRangesOverlap = (start1: number, end1: number, start2: number, end2: number) => {
  const toRanges = (start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    if (start === end) return [];
    if (end > start) return [{ start, end }];
    return [
      { start, end: 24 },
      { start: 0, end },
    ];
  };
  const ranges1 = toRanges(start1, end1);
  const ranges2 = toRanges(start2, end2);
  return ranges1.some((a) => ranges2.some((b) => a.start < b.end && a.end > b.start));
};

const isOverlapError = (message?: string | null, code?: string | null) => {
  const text = String(message ?? '').toLowerCase();
  return code === '23P01' || text.includes('exclusion') || text.includes('shifts_no_overlap');
};

export async function POST(request: NextRequest) {
  let payload: SaveShiftPayload;
  try {
    payload = (await request.json()) as SaveShiftPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload.organizationId) {
    return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
  }
  if (!payload.employeeId) {
    return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
  }
  if (!isValidDate(payload.date)) {
    return NextResponse.json({ error: 'date is required (YYYY-MM-DD).' }, { status: 400 });
  }
  if (!Number.isFinite(payload.startHour) || !Number.isFinite(payload.endHour)) {
    return NextResponse.json({ error: 'startHour and endHour are required.' }, { status: 400 });
  }
  if (payload.startHour >= payload.endHour) {
    return NextResponse.json({ error: 'startHour must be before endHour.' }, { status: 400 });
  }
  if (!payload.job) {
    return NextResponse.json({ error: 'job is required.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    return applySupabaseCookies(jsonError('Not signed in.', 401), response);
  }

  const { data: membershipRow, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (membershipError || !membershipRow) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }
  const role = String(membershipRow.role ?? '').toLowerCase();
  if (!['admin', 'manager'].includes(role)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  let existingRow: Record<string, any> | null = null;
  if (payload.id) {
    const { data, error } = await supabaseAdmin
      .from('shifts')
      .select('id,organization_id,user_id,shift_date,start_time,end_time,schedule_state,is_blocked')
      .eq('id', payload.id)
      .maybeSingle();

    if (error) {
      return applySupabaseCookies(
        NextResponse.json({ error: error.message }, { status: 400 }),
        response
      );
    }
    if (!data) {
      return applySupabaseCookies(NextResponse.json({ error: 'Shift not found.' }, { status: 404 }), response);
    }
    existingRow = data;
    if (existingRow.organization_id !== payload.organizationId) {
      return applySupabaseCookies(NextResponse.json({ error: 'Shift not found.' }, { status: 404 }), response);
    }
  }

  const { data: existingShifts, error: existingError } = await supabaseAdmin
    .from('shifts')
    .select('id,start_time,end_time')
    .eq('organization_id', payload.organizationId)
    .eq('user_id', payload.employeeId)
    .eq('shift_date', payload.date)
    .eq('is_blocked', false);

  if (existingError) {
    return applySupabaseCookies(NextResponse.json({ error: existingError.message }, { status: 400 }), response);
  }

  const excludeId = payload.id != null ? String(payload.id) : null;
  const conflicts = (existingShifts ?? []).filter((row: Record<string, any>) =>
    excludeId ? String(row.id) !== excludeId : true
  );
  const hasOverlap = conflicts.some((row: Record<string, any>) =>
    timeRangesOverlap(
      payload.startHour,
      payload.endHour,
      parseTimeToDecimal(row.start_time),
      parseTimeToDecimal(row.end_time)
    )
  );

  if (hasOverlap) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Shift overlaps with existing shift.' }, { status: 409 }),
      response
    );
  }

  const scheduleState =
    existingRow && existingRow.schedule_state === 'published'
      ? 'draft'
      : payload.scheduleState ?? existingRow?.schedule_state ?? 'draft';

  const basePayload = {
    organization_id: payload.organizationId,
    user_id: payload.employeeId,
    shift_date: payload.date,
    start_time: formatTimeFromDecimal(payload.startHour),
    end_time: formatTimeFromDecimal(payload.endHour),
    notes: payload.notes ?? null,
    is_blocked: false,
    schedule_state: scheduleState,
    job: payload.job ?? null,
    location_id: payload.locationId ?? null,
  };

  if (payload.id) {
    const { data, error } = await supabaseAdmin
      .from('shifts')
      .update(basePayload)
      .eq('id', payload.id)
      .select('*')
      .single();

    if (error) {
      const status = isOverlapError(error.message, (error as any)?.code) ? 409 : 400;
      const message = isOverlapError(error.message, (error as any)?.code)
        ? 'Shift overlaps with existing shift.'
        : error.message;
      return applySupabaseCookies(NextResponse.json({ error: message }, { status }), response);
    }
    return applySupabaseCookies(NextResponse.json({ shift: data }), response);
  }

  const { data, error } = await supabaseAdmin
    .from('shifts')
    .insert(basePayload)
    .select('*')
    .single();

  if (error) {
    const status = isOverlapError(error.message, (error as any)?.code) ? 409 : 400;
    const message = isOverlapError(error.message, (error as any)?.code)
      ? 'Shift overlaps with existing shift.'
      : error.message;
    return applySupabaseCookies(NextResponse.json({ error: message }, { status }), response);
  }

  return applySupabaseCookies(NextResponse.json({ shift: data }), response);
}
