import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';
import { shiftsOverlap } from '@/utils/timeUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PickupPayload = {
  requestId: string;
};

function isPastDate(dateStr: string) {
  const today = new Date();
  const date = new Date(`${dateStr}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return date < today;
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
  const payload = (await request.json()) as PickupPayload;
  if (!payload.requestId) {
    return NextResponse.json({ error: 'requestId is required.' }, { status: 400 });
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
  if (!requester.organizationId) {
    return applySupabaseCookies(jsonError('Organization missing.', 400), response);
  }

  const { data: requestRow, error: requestError } = await supabaseAdmin
    .from('shift_exchange_requests')
    .select('*')
    .eq('id', payload.requestId)
    .maybeSingle();

  if (requestError || !requestRow) {
    return applySupabaseCookies(jsonError('Request not found.', 404), response);
  }

  if (requestRow.organization_id !== requester.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  if (requestRow.status !== 'OPEN') {
    return applySupabaseCookies(jsonError('Request is no longer open.', 400), response);
  }

  const { data: shiftRow, error: shiftError } = await supabaseAdmin
    .from('shifts')
    .select('id,organization_id,user_id,shift_date,start_time,end_time')
    .eq('id', requestRow.shift_id)
    .maybeSingle();

  if (shiftError || !shiftRow) {
    return applySupabaseCookies(jsonError('Shift not found.', 404), response);
  }

  if (shiftRow.organization_id !== requester.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  if (isPastDate(shiftRow.shift_date)) {
    return applySupabaseCookies(jsonError('Cannot pick up past shifts.', 400), response);
  }

  const { data: blockedRows, error: blockedError } = await supabaseAdmin
    .from('blocked_day_requests')
    .select('user_id,scope,start_date,end_date,status')
    .eq('organization_id', requester.organizationId)
    .eq('status', 'APPROVED')
    .lte('start_date', shiftRow.shift_date)
    .gte('end_date', shiftRow.shift_date);

  if (blockedError) {
    return applySupabaseCookies(jsonError(blockedError.message, 400), response);
  }

  const blocked = (blockedRows ?? []).some((row) => {
    const scope = String(row.scope ?? '').toUpperCase();
    if (scope === 'ORG_BLACKOUT') return true;
    if (scope === 'EMPLOYEE' && row.user_id === requester.id) return true;
    return false;
  });

  if (blocked) {
    return applySupabaseCookies(jsonError('Shift falls on a blocked day.', 400), response);
  }

  const { data: existingShifts, error: existingError } = await supabaseAdmin
    .from('shifts')
    .select('id,start_time,end_time')
    .eq('organization_id', requester.organizationId)
    .eq('user_id', requester.id)
    .eq('shift_date', shiftRow.shift_date)
    .neq('id', shiftRow.id);

  if (existingError) {
    return applySupabaseCookies(jsonError(existingError.message, 400), response);
  }

  const targetStart = parseTimeToDecimal(shiftRow.start_time);
  const targetEnd = parseTimeToDecimal(shiftRow.end_time);
  const hasOverlap = (existingShifts ?? []).some((shift) => {
    const start = parseTimeToDecimal(shift.start_time);
    const end = parseTimeToDecimal(shift.end_time);
    return shiftsOverlap(targetStart, targetEnd, start, end);
  });

  if (hasOverlap) {
    return applySupabaseCookies(jsonError('Shift overlaps with your existing shifts.', 400), response);
  }

  const originalUserId = shiftRow.user_id;
  const { error: shiftUpdateError } = await supabaseAdmin
    .from('shifts')
    .update({ user_id: requester.id })
    .eq('id', shiftRow.id);

  if (shiftUpdateError) {
    return applySupabaseCookies(jsonError(shiftUpdateError.message, 400), response);
  }

  const { data: updatedRequest, error: updateError } = await supabaseAdmin
    .from('shift_exchange_requests')
    .update({
      status: 'CLAIMED',
      claimed_by_auth_user_id: authUserId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', payload.requestId)
    .eq('status', 'OPEN')
    .select('*')
    .single();

  if (updateError || !updatedRequest) {
    await supabaseAdmin.from('shifts').update({ user_id: originalUserId }).eq('id', shiftRow.id);
    return applySupabaseCookies(
      NextResponse.json({ error: updateError?.message ?? 'Unable to claim request.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ request: updatedRequest }), response);
}
