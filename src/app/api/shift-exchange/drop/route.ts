import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DropPayload = {
  shiftId: string;
  organizationId: string;
};

function isPastDate(dateStr: string) {
  const today = new Date();
  const date = new Date(`${dateStr}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as DropPayload;
  const missingFields = [
    !payload.shiftId ? 'shiftId' : null,
    !payload.organizationId ? 'organizationId' : null,
  ].filter(Boolean);
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missingFields.join(', ')}.` },
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
    .select('organization_id')
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

  const { data: shiftRow, error: shiftError } = await supabaseAdmin
    .from('shifts')
    .select('id,organization_id,user_id,shift_date')
    .eq('id', payload.shiftId)
    .maybeSingle();

  if (shiftError || !shiftRow) {
    return applySupabaseCookies(jsonError('Shift not found.', 404), response);
  }

  if (shiftRow.organization_id !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  if (shiftRow.user_id !== requesterRow.id) {
    return applySupabaseCookies(jsonError('You can only drop your own shifts.', 403), response);
  }

  if (isPastDate(shiftRow.shift_date)) {
    return applySupabaseCookies(jsonError('Cannot drop past shifts.', 400), response);
  }

  const { data: existingRequest } = await supabaseAdmin
    .from('shift_exchange_requests')
    .select('id')
    .eq('shift_id', payload.shiftId)
    .eq('status', 'OPEN')
    .maybeSingle();

  if (existingRequest) {
    return applySupabaseCookies(jsonError('Shift already has an open drop request.', 400), response);
  }

  const { error: marketplaceError } = await supabaseAdmin
    .from('shifts')
    .update({ is_marketplace: true })
    .eq('id', payload.shiftId)
    .eq('organization_id', payload.organizationId);

  if (marketplaceError) {
    const message = String(marketplaceError.message ?? '');
    const missingColumn =
      message.toLowerCase().includes('is_marketplace') && message.toLowerCase().includes('does not exist');
    if (!missingColumn) {
      return applySupabaseCookies(jsonError(marketplaceError.message, 400), response);
    }
  }

  const { data: requestRow, error: insertError } = await supabaseAdmin
    .from('shift_exchange_requests')
    .insert({
      organization_id: payload.organizationId,
      shift_id: payload.shiftId,
      requested_by_auth_user_id: authUserId,
      status: 'OPEN',
    })
    .select('*')
    .single();

  if (insertError || !requestRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: insertError?.message ?? 'Unable to create request.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ ok: true, shiftId: payload.shiftId, request: requestRow }), response);
}
