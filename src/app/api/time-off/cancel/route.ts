import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CancelPayload = {
  id: string;
  organizationId: string;
};

function toLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeStatus(value: unknown): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'CANCELLED' ? 'CANCELED' : normalized;
}

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
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const requester = normalizeUserRow(requesterRow);
  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  const { data: target, error: targetError } = await supabase
    .from('time_off_requests')
    .select('*')
    .eq('id', payload.id)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (targetError || !target) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Request not found.' }, { status: 404 }),
      response
    );
  }

  const requesterMatches =
    target.requester_auth_user_id === authUserId ||
    target.auth_user_id === authUserId ||
    target.requester_user_id === authUserId ||
    target.user_id === requester.id;

  if (!requesterMatches) {
    return applySupabaseCookies(jsonError('You cannot cancel this request.', 403), response);
  }

  const currentStatus = normalizeStatus(target.status);
  if (currentStatus !== 'PENDING' && currentStatus !== 'APPROVED') {
    return applySupabaseCookies(
      NextResponse.json(
        {
          error: 'Only pending or approved requests can be canceled.',
          details: { status: target.status },
        },
        { status: 400 }
      ),
      response
    );
  }

  const startDate = String(target.start_date ?? '').trim();
  const today = toLocalYmd(new Date());
  if (!startDate || startDate <= today) {
    return applySupabaseCookies(
      NextResponse.json(
        {
          error: 'Only future requests can be canceled.',
          details: { startDate: target.start_date, today },
        },
        { status: 400 }
      ),
      response
    );
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('time_off_requests')
    .update({
      status: 'CANCELED',
      canceled_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', payload.id)
    .eq('organization_id', payload.organizationId)
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
