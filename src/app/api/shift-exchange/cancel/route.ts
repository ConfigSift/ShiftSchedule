import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CancelPayload = {
  requestId: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as CancelPayload;
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

  if (requestRow.requested_by_auth_user_id !== authUserId) {
    return applySupabaseCookies(jsonError('You can only cancel your own requests.', 403), response);
  }

  if (requestRow.status !== 'OPEN') {
    return applySupabaseCookies(jsonError('Only open requests can be cancelled.', 400), response);
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('shift_exchange_requests')
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
    .eq('id', payload.requestId)
    .eq('status', 'OPEN')
    .select('*')
    .single();

  if (updateError || !updated) {
    return applySupabaseCookies(
      NextResponse.json({ error: updateError?.message ?? 'Unable to cancel request.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ request: updated }), response);
}
