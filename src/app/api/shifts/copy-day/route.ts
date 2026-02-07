import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CopyDayPayload = {
  organizationId: string;
  sourceDate: string;
  targetDate: string;
  sourceScheduleState?: 'draft' | 'published';
  targetScheduleState?: 'draft' | 'published';
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value?: string) {
  return Boolean(value && DATE_RE.test(value));
}

export async function POST(request: NextRequest) {
  let payload: CopyDayPayload;
  try {
    payload = (await request.json()) as CopyDayPayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.', details: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (!payload.organizationId) {
    return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
  }
  if (!isValidDate(payload.sourceDate) || !isValidDate(payload.targetDate)) {
    return NextResponse.json({ error: 'sourceDate and targetDate are required.' }, { status: 400 });
  }

  const sourceScheduleState = payload.sourceScheduleState ?? 'published';
  const targetScheduleState = payload.targetScheduleState ?? 'draft';
  if (!['draft', 'published'].includes(sourceScheduleState)) {
    return NextResponse.json({ error: 'sourceScheduleState must be draft or published.' }, { status: 400 });
  }
  if (!['draft', 'published'].includes(targetScheduleState)) {
    return NextResponse.json({ error: 'targetScheduleState must be draft or published.' }, { status: 400 });
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

  const selectColumns = 'user_id,start_time,end_time,notes,is_blocked,job,location_id';
  const { data: sourceShifts, error: sourceError } = await supabaseAdmin
    .from('shifts')
    .select(selectColumns)
    .eq('organization_id', payload.organizationId)
    .eq('schedule_state', sourceScheduleState)
    .eq('shift_date', payload.sourceDate);

  if (sourceError) {
    return applySupabaseCookies(
      NextResponse.json({ error: sourceError.message }, { status: 400 }),
      response
    );
  }

  if (!sourceShifts.length) {
    return applySupabaseCookies(
      NextResponse.json({ insertedCount: 0, skippedCount: 0, sourceCount: 0 }),
      response
    );
  }

  const { data: existingDrafts, error: existingError } = await supabaseAdmin
    .from('shifts')
    .select('user_id,start_time,end_time,location_id')
    .eq('organization_id', payload.organizationId)
    .eq('schedule_state', targetScheduleState)
    .eq('shift_date', payload.targetDate);

  if (existingError) {
    return applySupabaseCookies(NextResponse.json({ error: existingError.message }, { status: 400 }), response);
  }

  const existingKeys = new Set(
    (existingDrafts ?? []).map(
      (shift) =>
        `${shift.user_id}|${shift.start_time}|${shift.end_time}|${shift.location_id ?? ''}`
    )
  );

  const inserts: Array<Record<string, any>> = [];
  let skippedCount = 0;

  sourceShifts.forEach((shift) => {
    const key = `${shift.user_id}|${shift.start_time}|${shift.end_time}|${shift.location_id ?? ''}`;
    if (existingKeys.has(key)) {
      skippedCount += 1;
      return;
    }
    inserts.push({
      organization_id: payload.organizationId,
      user_id: shift.user_id,
      shift_date: payload.targetDate,
      start_time: shift.start_time,
      end_time: shift.end_time,
      notes: shift.notes ?? null,
      is_blocked: shift.is_blocked ?? false,
      schedule_state: targetScheduleState,
      job: shift.job ?? null,
      location_id: shift.location_id ?? null,
    });
    existingKeys.add(key);
  });

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
      insertedCount: inserts.length,
      skippedCount,
      sourceCount: sourceShifts.length,
      sourceScheduleState,
    }),
    response
  );
}
