import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CancelPayload = {
  id: string;
  organizationId: string;
};

export async function POST(request: NextRequest) {
  let payload: CancelPayload;
  try {
    payload = (await request.json()) as CancelPayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.', details: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  const missingFields = [!payload?.id ? 'id' : null, !payload?.organizationId ? 'organizationId' : null].filter(Boolean);
  if (missingFields.length > 0) {
    return NextResponse.json({ error: 'Missing required fields.', missingFields }, { status: 400 });
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
  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('blocked_day_requests')
    .select('*')
    .eq('id', payload.id)
    .maybeSingle();

  if (targetError || !target) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Request not found.' }, { status: 404 }),
      response
    );
  }

  if (target.requested_by_auth_user_id !== authUserId) {
    return applySupabaseCookies(jsonError('You cannot cancel this request.', 403), response);
  }

  const currentStatus = String(target.status ?? '').toUpperCase();
  if (currentStatus !== 'PENDING') {
    return applySupabaseCookies(
      NextResponse.json(
        {
          error: 'Only pending requests can be cancelled.',
          details: { status: target.status },
        },
        { status: 400 }
      ),
      response
    );
  }

  const { data, error } = await supabaseAdmin
    .from('blocked_day_requests')
    .update({
      status: 'CANCELLED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.id)
    .select('*')
    .single();

  if (error || !data) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message ?? 'Unable to cancel request.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ request: data }), response);
}
