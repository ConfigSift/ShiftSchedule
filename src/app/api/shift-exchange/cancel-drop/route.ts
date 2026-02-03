import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CancelDropPayload = {
  shiftId: string;
  organizationId: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as CancelDropPayload;
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
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  let shiftRow: Record<string, any> | null = null;
  let hasMarketplaceColumn = true;

  const shiftWithMarketplace = await supabaseAdmin
    .from('shifts')
    .select('id,organization_id,user_id,is_marketplace')
    .eq('id', payload.shiftId)
    .maybeSingle();

  if (shiftWithMarketplace.error) {
    const message = String(shiftWithMarketplace.error.message ?? '');
    const missingMarketplace =
      message.toLowerCase().includes('is_marketplace') && message.toLowerCase().includes('does not exist');
    if (!missingMarketplace) {
      return applySupabaseCookies(jsonError(shiftWithMarketplace.error.message, 400), response);
    }
    hasMarketplaceColumn = false;
  } else {
    shiftRow = shiftWithMarketplace.data as Record<string, any> | null;
  }

  if (!shiftRow) {
    const fallback = await supabaseAdmin
      .from('shifts')
      .select('id,organization_id,user_id')
      .eq('id', payload.shiftId)
      .maybeSingle();
    if (fallback.error) {
      return applySupabaseCookies(jsonError(fallback.error.message, 400), response);
    }
    shiftRow = fallback.data as Record<string, any> | null;
  }

  if (!shiftRow) {
    return applySupabaseCookies(jsonError('Shift not found.', 404), response);
  }

  if (shiftRow.organization_id !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  const { data: openRequest, error: openRequestError } = await supabaseAdmin
    .from('shift_exchange_requests')
    .select('id,requested_by_auth_user_id,status')
    .eq('shift_id', payload.shiftId)
    .eq('organization_id', payload.organizationId)
    .eq('status', 'OPEN')
    .maybeSingle();

  if (openRequestError) {
    const message = String(openRequestError.message ?? '');
    const missingTable =
      message.toLowerCase().includes('relation') && message.toLowerCase().includes('shift_exchange_requests');
    if (!missingTable) {
      return applySupabaseCookies(jsonError(openRequestError.message, 400), response);
    }
  }

  const ownsDrop =
    shiftRow.user_id === requesterRow.id || openRequest?.requested_by_auth_user_id === authUserId;

  if (!ownsDrop) {
    return applySupabaseCookies(jsonError('You can only cancel your own dropped shifts.', 403), response);
  }

  const wasMarketplace = hasMarketplaceColumn ? shiftRow.is_marketplace === true : false;
  const hasOpenRequest = Boolean(openRequest?.id);
  const isDropped = wasMarketplace || hasOpenRequest;

  if (!isDropped) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[shift-exchange:cancel-drop] not dropped', {
        authUserId,
        shiftId: payload.shiftId,
        organizationId: payload.organizationId,
        wasMarketplace,
        hasOpenRequest,
      });
    }
    return applySupabaseCookies(jsonError('Shift is not currently dropped.', 400), response);
  }

  const updatePayload: Record<string, any> = {};
  if (hasMarketplaceColumn) {
    updatePayload.is_marketplace = false;
  }
  if (!shiftRow.user_id) {
    updatePayload.user_id = requesterRow.id;
  }

  if (Object.keys(updatePayload).length > 0) {
    let updateQuery = supabaseAdmin
      .from('shifts')
      .update(updatePayload)
      .eq('id', payload.shiftId)
      .eq('organization_id', payload.organizationId);

    if (hasMarketplaceColumn && wasMarketplace) {
      updateQuery = updateQuery.eq('is_marketplace', true);
    }

    const { error: updateError } = await updateQuery;
    if (updateError) {
      return applySupabaseCookies(jsonError(updateError.message, 400), response);
    }
  }

  if (hasOpenRequest) {
    const cancelResult = await supabaseAdmin
      .from('shift_exchange_requests')
      .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
      .eq('shift_id', payload.shiftId)
      .eq('organization_id', payload.organizationId)
      .eq('requested_by_auth_user_id', openRequest?.requested_by_auth_user_id ?? authUserId)
      .eq('status', 'OPEN');

    if (cancelResult.error) {
      const message = String(cancelResult.error.message ?? '');
      const missingTable =
        message.toLowerCase().includes('relation') && message.toLowerCase().includes('shift_exchange_requests');
      if (!missingTable) {
        return applySupabaseCookies(jsonError(cancelResult.error.message, 400), response);
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[shift-exchange:cancel-drop]', {
      authUserId,
      shiftId: payload.shiftId,
      organizationId: payload.organizationId,
      wasMarketplace,
      hasOpenRequest,
      normalized: {
        is_marketplace: hasMarketplaceColumn ? false : undefined,
        user_id: updatePayload.user_id ?? shiftRow.user_id,
      },
    });
  }

  return applySupabaseCookies(NextResponse.json({ ok: true, shiftId: payload.shiftId }), response);
}
