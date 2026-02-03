import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestPayload = {
  organizationId: string;
  startDate: string;
  endDate: string;
  reason: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as RequestPayload;
  if (!payload.organizationId || !payload.startDate || !payload.endDate || !payload.reason) {
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

  const { data: membershipRow, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('auth_user_id, organization_id')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (membershipError || !membershipRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const { data: requesterRow, error: requesterError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const requester = normalizeUserRow(requesterRow);
  // NOTE: auth_user_id (auth.users) != users.id (profile); we store requester_user_id as users.id.

  const blackout = await supabaseAdmin
    .from('blocked_day_requests')
    .select('id')
    .eq('organization_id', payload.organizationId)
    .eq('scope', 'ORG_BLACKOUT')
    .eq('status', 'APPROVED')
    .lte('start_date', payload.endDate)
    .gte('end_date', payload.startDate)
    .limit(1);

  if (blackout.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: blackout.error.message }, { status: 400 }),
      response
    );
  }

  if ((blackout.data || []).length > 0) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Time off is not allowed on blackout dates.' }, { status: 400 }),
      response
    );
  }

  const insertPayload = {
    organization_id: payload.organizationId,
    user_id: requester.id,
    requester_auth_user_id: authUserId,
    start_date: payload.startDate,
    end_date: payload.endDate,
    reason: payload.reason,
    status: 'PENDING',
  };

  let insertData: Record<string, any> | null = null;
  let insertError: { message: string } | null = null;

  const primaryResult = await supabaseAdmin
    .from('time_off_requests')
    .insert(insertPayload)
    .select('*')
    .single();

  if (!primaryResult.error) {
    insertData = primaryResult.data as Record<string, any>;
  } else if (primaryResult.error.message?.toLowerCase().includes('requester_auth_user_id')) {
    const { requester_auth_user_id, ...fallbackPayload } = insertPayload;
    const fallbackResult = await supabaseAdmin
      .from('time_off_requests')
      .insert({ ...fallbackPayload, auth_user_id: authUserId })
      .select('*')
      .single();
    if (!fallbackResult.error) {
      insertData = fallbackResult.data as Record<string, any>;
    } else if (fallbackResult.error.message?.toLowerCase().includes('auth_user_id')) {
      const secondFallback = await supabaseAdmin
        .from('time_off_requests')
        .insert({ ...fallbackPayload, requester_user_id: authUserId })
        .select('*')
        .single();
      insertData = secondFallback.data as Record<string, any>;
      insertError = secondFallback.error as { message: string } | null;
    } else {
      insertError = fallbackResult.error as { message: string } | null;
    }
  } else {
    insertError = primaryResult.error as { message: string } | null;
  }

  if (insertError || !insertData) {
    return applySupabaseCookies(
      NextResponse.json({ error: insertError?.message ?? 'Failed to submit request.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ request: insertData }), response);
}
