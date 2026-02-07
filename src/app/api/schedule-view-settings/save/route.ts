import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const badRequest = (message: string) =>
  NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });

type SavePayload = {
  organizationId: string;
  hourMode?: 'business' | 'full24' | 'custom';
  customStartHour?: number;
  customEndHour?: number;
  weekStartDay?: 'sunday' | 'monday';
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SavePayload;
  if (!payload.organizationId) {
    return badRequest('organizationId is required.');
  }
  const hasHourMode = typeof payload.hourMode === 'string';
  const hasWeekStartDay = typeof payload.weekStartDay === 'string';
  if (!hasHourMode && !hasWeekStartDay) {
    return badRequest('Missing required fields.');
  }

  let customStart = 0;
  let customEnd = 24;
  if (hasHourMode) {
    // Validate hour mode
    if (!['business', 'full24', 'custom'].includes(payload.hourMode!)) {
      return badRequest('Invalid hour mode.');
    }

    // Validate custom hours
    customStart = Number(payload.customStartHour ?? 0);
    customEnd = Number(payload.customEndHour ?? 24);
    if (customStart < 0 || customStart > 23) {
      return badRequest('Start hour must be between 0 and 23.');
    }
    if (customEnd < 1 || customEnd > 24) {
      return badRequest('End hour must be between 1 and 24.');
    }
    if (customEnd <= customStart) {
      return badRequest('End hour must be greater than start hour.');
    }
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[schedule-view-settings] auth failed', {
        authUserId: null,
        organizationId: payload.organizationId,
        hasMembership: false,
        role: null,
      });
    }
    return applySupabaseCookies(jsonError('Not signed in.', 401), response);
  }

  const { data: membershipRow, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  const hasMembership = Boolean(membershipRow);
  if (membershipError || !membershipRow) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[schedule-view-settings] membership failed', {
        authUserId,
        organizationId: payload.organizationId,
        hasMembership,
        role: null,
      });
    }
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  const role = String(membershipRow.role ?? '').toLowerCase();
  if (!['admin', 'manager'].includes(role)) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[schedule-view-settings] role forbidden', {
        authUserId,
        organizationId: payload.organizationId,
        hasMembership,
        role,
      });
    }
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  const weekStartDay = payload.weekStartDay === 'monday' ? 'monday' : 'sunday';

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (hasHourMode) {
    updatePayload.hour_mode = payload.hourMode;
    updatePayload.custom_start_hour = customStart;
    updatePayload.custom_end_hour = customEnd;
  }
  if (hasWeekStartDay) {
    updatePayload.week_start_day = weekStartDay;
  }

  let data;
  let error;
  if (hasHourMode) {
    const result = await supabaseAdmin
      .from('schedule_view_settings')
      .upsert(
        {
          organization_id: payload.organizationId,
          ...updatePayload,
        },
        { onConflict: 'organization_id' }
      )
      .select('*')
      .single();
    data = result.data;
    error = result.error;
  } else {
    const updateResult = await supabaseAdmin
      .from('schedule_view_settings')
      .update(updatePayload)
      .eq('organization_id', payload.organizationId)
      .select('*')
      .maybeSingle();
    data = updateResult.data;
    error = updateResult.error;

    if (!error && !data) {
      const insertResult = await supabaseAdmin
        .from('schedule_view_settings')
        .insert({
          organization_id: payload.organizationId,
          hour_mode: 'full24',
          custom_start_hour: 0,
          custom_end_hour: 24,
          ...updatePayload,
        })
        .select('*')
        .single();
      data = insertResult.data;
      error = insertResult.error;
    }
  }

  if (error) {
    return applySupabaseCookies(
      badRequest(error.message),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ ok: true, settings: data }), response);
}
