import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SavePayload = {
  organizationId: string;
  hourMode: 'business' | 'full24' | 'custom';
  customStartHour: number;
  customEndHour: number;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SavePayload;
  if (!payload.organizationId || !payload.hourMode) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  // Validate hour mode
  if (!['business', 'full24', 'custom'].includes(payload.hourMode)) {
    return NextResponse.json({ error: 'Invalid hour mode.' }, { status: 400 });
  }

  // Validate custom hours
  const customStart = Number(payload.customStartHour ?? 0);
  const customEnd = Number(payload.customEndHour ?? 24);
  if (customStart < 0 || customStart > 23) {
    return NextResponse.json({ error: 'Start hour must be between 0 and 23.' }, { status: 400 });
  }
  if (customEnd < 1 || customEnd > 24) {
    return NextResponse.json({ error: 'End hour must be between 1 and 24.' }, { status: 400 });
  }
  if (customEnd <= customStart) {
    return NextResponse.json({ error: 'End hour must be greater than start hour.' }, { status: 400 });
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

  // Upsert the settings (insert or update if exists)
  const { data, error } = await supabaseAdmin
    .from('schedule_view_settings')
    .upsert(
      {
        organization_id: payload.organizationId,
        hour_mode: payload.hourMode,
        custom_start_hour: customStart,
        custom_end_hour: customEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )
    .select('*')
    .single();

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: error.message }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ settings: data }), response);
}
