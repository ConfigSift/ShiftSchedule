import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const badRequest = (message: string) =>
  NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });

type HourPayload = {
  id?: string;
  dayOfWeek: number;
  openTime?: string | null;
  closeTime?: string | null;
  enabled: boolean;
  sortOrder?: number;
};

type SavePayload = {
  organizationId: string;
  hours: HourPayload[];
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SavePayload;
  if (!payload.organizationId) {
    return badRequest('organizationId is required.');
  }
  if (!payload.hours) {
    return badRequest('Missing required fields.');
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[core-hours] auth failed', {
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
      console.error('[core-hours] membership failed', {
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
      console.error('[core-hours] role forbidden', {
        authUserId,
        organizationId: payload.organizationId,
        hasMembership,
        role,
      });
    }
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  await supabaseAdmin.from('core_hour_ranges').delete().eq('organization_id', payload.organizationId);

  const rows = payload.hours
    .filter((hour) => hour.openTime && hour.closeTime)
    .map((hour, index) => ({
      organization_id: payload.organizationId,
      day_of_week: hour.dayOfWeek,
      open_time: hour.openTime ?? null,
      close_time: hour.closeTime ?? null,
      enabled: Boolean(hour.enabled),
      sort_order: Number.isFinite(Number(hour.sortOrder)) ? Number(hour.sortOrder) : index,
    }));

  const { data, error } = await supabaseAdmin
    .from('core_hour_ranges')
    .insert(rows)
    .select('*');

  if (error) {
    return applySupabaseCookies(
      badRequest(error.message),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ ok: true, hours: data ?? [] }), response);
}
