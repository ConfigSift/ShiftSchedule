import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReviewPayload = {
  id: string;
  organizationId: string;
  status: 'APPROVED' | 'DENIED';
  managerNote?: string;
};

export async function POST(request: NextRequest) {
  let payload: ReviewPayload;
  try {
    payload = (await request.json()) as ReviewPayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.', details: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  const missingFields = [
    !payload?.id ? 'id' : null,
    !payload?.organizationId ? 'organizationId' : null,
    !payload?.status ? 'status' : null,
  ].filter(Boolean);

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: 'Missing required fields.', missingFields },
      { status: 400 }
    );
  }

  const normalizedStatus = String(payload.status || '').toUpperCase();
  if (normalizedStatus !== 'APPROVED' && normalizedStatus !== 'DENIED') {
    return NextResponse.json(
      {
        error: 'Invalid status value.',
        details: { expected: ['APPROVED', 'DENIED'], received: payload.status },
      },
      { status: 400 }
    );
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

  const { data: membershipRow, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (membershipError || !membershipRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const membershipRole = String(membershipRow.role ?? '').trim().toUpperCase();
  if (!['ADMIN', 'MANAGER'].includes(membershipRole)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
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

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[time-off:review]', {
      authUserId,
      organizationId: payload.organizationId,
      membershipRole,
      requestId: payload.id,
    });
  }

  const { data, error } = await supabaseAdmin
    .from('time_off_requests')
    .update({
      status: normalizedStatus,
      reviewed_by: requesterRow.id,
      reviewed_at: new Date().toISOString(),
      manager_note: payload.managerNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.id)
    .eq('organization_id', payload.organizationId)
    .select('*')
    .single();

  if (error || !data) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[time-off:review] update error', error);
    }
    return applySupabaseCookies(
      NextResponse.json(
        {
          error: error?.message ?? 'Unable to update request.',
          details: error ? { code: error.code, hint: error.hint } : undefined,
        },
        { status: 400 }
      ),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ request: data }), response);
}
