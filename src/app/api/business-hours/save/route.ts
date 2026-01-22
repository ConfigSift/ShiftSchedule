import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HourPayload = {
  dayOfWeek: number;
  openTime?: string | null;
  closeTime?: string | null;
  enabled: boolean;
};

type SavePayload = {
  organizationId: string;
  hours: HourPayload[];
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SavePayload;
  if (!payload.organizationId || !payload.hours) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
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
  if (!['ADMIN', 'MANAGER'].includes(requester.role)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  await supabaseAdmin.from('business_hours').delete().eq('organization_id', payload.organizationId);

  const rows = payload.hours.map((hour) => ({
    organization_id: payload.organizationId,
    day_of_week: hour.dayOfWeek,
    open_time: hour.openTime ?? null,
    close_time: hour.closeTime ?? null,
    enabled: Boolean(hour.enabled),
  }));

  const { data, error } = await supabaseAdmin
    .from('business_hours')
    .insert(rows)
    .select('*');

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: error.message }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ hours: data ?? [] }), response);
}
