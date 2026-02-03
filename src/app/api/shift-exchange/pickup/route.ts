import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PickupPayload = {
  shiftId: string;
  organizationId: string;
};

function parseTimeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hoursText, minutesText = '0'] = value.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as PickupPayload;
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
  const conflictMessage = 'This shift conflicts with an existing shift on your schedule.';

  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const respondConflict = (
    conflicts: Array<{ id: string; shift_date: string | null; start_time: string | null; end_time: string | null }>
  ) =>
    applySupabaseCookies(
      NextResponse.json({ error: conflictMessage, conflicts }, { status: 409 }),
      response
    );

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
    .select('id,organization_id,user_id,shift_date,start_time,end_time,is_marketplace')
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
      .select('id,organization_id,user_id,shift_date,start_time,end_time')
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

  if (hasMarketplaceColumn && shiftRow.is_marketplace !== true) {
    return applySupabaseCookies(jsonError('Shift is not currently available to pick up.', 400), response);
  }

  if (shiftRow.user_id && shiftRow.user_id === requesterRow.id) {
    return applySupabaseCookies(jsonError('You cannot pick up your own shift.', 403), response);
  }

  const ignoredStatuses = new Set(['CANCELLED', 'CANCELED', 'DENIED', 'DROPPED', 'MARKETPLACE', 'OPEN', 'AVAILABLE']);

  const targetStart = parseTimeToMinutes(shiftRow.start_time);
  const targetEnd = parseTimeToMinutes(shiftRow.end_time);
  if (targetStart == null || targetEnd == null || targetEnd <= targetStart) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[shift-exchange:pickup] conflict', {
        authUserId,
        shiftId: payload.shiftId,
        organizationId: payload.organizationId,
        reason: 'invalid_target_time',
      });
    }
    return respondConflict([]);
  }

  const buildConflicts = (rows: any[]) => {
    const conflicts: Array<{
      id: string;
      shift_date: string | null;
      start_time: string | null;
      end_time: string | null;
    }> = [];
    for (const row of rows ?? []) {
      if (row.is_blocked) continue;
      const statusValue = row.status ? String(row.status).toUpperCase() : '';
      if (statusValue && ignoredStatuses.has(statusValue)) continue;
      if (hasMarketplaceColumn && row.is_marketplace === true) continue;
      const existingStart = parseTimeToMinutes(row.start_time);
      const existingEnd = parseTimeToMinutes(row.end_time);
      if (existingStart == null || existingEnd == null || existingEnd <= existingStart) {
        conflicts.push({
          id: String(row.id),
          shift_date: row.shift_date ?? shiftRow.shift_date ?? null,
          start_time: row.start_time ?? null,
          end_time: row.end_time ?? null,
        });
      } else if (existingStart < targetEnd && existingEnd > targetStart) {
        conflicts.push({
          id: String(row.id),
          shift_date: row.shift_date ?? shiftRow.shift_date ?? null,
          start_time: row.start_time ?? null,
          end_time: row.end_time ?? null,
        });
      }
      if (conflicts.length >= 5) break;
    }
    return conflicts;
  };

  const existingSelect = [
    'id',
    'start_time',
    'end_time',
    'shift_date',
    hasMarketplaceColumn ? 'is_marketplace' : null,
    'is_blocked',
    'status',
  ]
    .filter(Boolean)
    .join(',');

  const existingResult = await supabaseAdmin
    .from('shifts')
    .select(existingSelect)
    .eq('organization_id', payload.organizationId)
    .eq('user_id', requesterRow.id)
    .eq('shift_date', shiftRow.shift_date)
    .neq('id', payload.shiftId);

  if (existingResult.error) {
    const message = String(existingResult.error.message ?? '');
    const missingBlocked = message.toLowerCase().includes('is_blocked') && message.toLowerCase().includes('does not exist');
    const missingStatus = message.toLowerCase().includes('status') && message.toLowerCase().includes('does not exist');
    if (missingBlocked || missingStatus) {
      const fallbackSelect = [
        'id',
        'start_time',
        'end_time',
        'shift_date',
        hasMarketplaceColumn ? 'is_marketplace' : null,
      ]
        .filter(Boolean)
        .join(',');
      const fallbackExisting = await supabaseAdmin
        .from('shifts')
        .select(fallbackSelect)
        .eq('organization_id', payload.organizationId)
        .eq('user_id', requesterRow.id)
        .eq('shift_date', shiftRow.shift_date)
        .neq('id', payload.shiftId);
      if (fallbackExisting.error) {
        return applySupabaseCookies(jsonError(fallbackExisting.error.message, 400), response);
      }
      const conflicts = buildConflicts(fallbackExisting.data ?? []);
      if (conflicts.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[shift-exchange:pickup] conflict', {
            authUserId,
            shiftId: payload.shiftId,
            organizationId: payload.organizationId,
            reason: 'overlap',
            conflicts: conflicts.slice(0, 3),
          });
        }
        return respondConflict(conflicts);
      }
    } else {
      return applySupabaseCookies(jsonError(existingResult.error.message, 400), response);
    }
  } else {
    const conflicts = buildConflicts(existingResult.data ?? []);
    if (conflicts.length > 0) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[shift-exchange:pickup] conflict', {
          authUserId,
          shiftId: payload.shiftId,
          organizationId: payload.organizationId,
          reason: 'overlap',
          conflicts: conflicts.slice(0, 3),
        });
      }
      return respondConflict(conflicts);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[shift-exchange:pickup]', {
      authUserId,
      shiftId: payload.shiftId,
      organizationId: payload.organizationId,
      hasMarketplaceColumn,
      isMarketplace: hasMarketplaceColumn ? shiftRow.is_marketplace === true : undefined,
      ownerUserId: shiftRow.user_id,
      requesterUserId: requesterRow.id,
    });
  }

  const updatePayload: Record<string, any> = { user_id: requesterRow.id };
  if (hasMarketplaceColumn) {
    updatePayload.is_marketplace = false;
  }

  let updateQuery = supabaseAdmin
    .from('shifts')
    .update(updatePayload)
    .eq('id', payload.shiftId)
    .eq('organization_id', payload.organizationId);

  if (hasMarketplaceColumn) {
    updateQuery = updateQuery.eq('is_marketplace', true);
  }

  const { error: updateError } = await updateQuery;
  if (updateError) {
    return applySupabaseCookies(jsonError(updateError.message, 400), response);
  }

  const claimResult = await supabaseAdmin
    .from('shift_exchange_requests')
    .update({
      status: 'CLAIMED',
      claimed_by_auth_user_id: authUserId,
      claimed_at: new Date().toISOString(),
    })
    .eq('shift_id', payload.shiftId)
    .eq('organization_id', payload.organizationId)
    .eq('status', 'OPEN');

  if (claimResult.error) {
    const message = String(claimResult.error.message ?? '');
    const missingTable =
      message.toLowerCase().includes('relation') && message.toLowerCase().includes('shift_exchange_requests');
    if (!missingTable) {
      return applySupabaseCookies(jsonError(claimResult.error.message, 400), response);
    }
  }

  return applySupabaseCookies(NextResponse.json({ ok: true, shiftId: payload.shiftId }), response);
}
