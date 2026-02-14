import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestRow = {
  id: string;
  organization_id: string;
  shift_id: string;
  requested_by_auth_user_id: string;
  status: string;
  claimed_by_auth_user_id: string | null;
  created_at: string;
  claimed_at: string | null;
  cancelled_at: string | null;
};

type ShiftRow = {
  id: string;
  user_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  job?: string | null;
  location_id?: string | null;
  is_marketplace?: boolean | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  auth_user_id: string | null;
};

function parseTimeToDecimal(value: string | null | undefined) {
  if (!value) return 0;
  const [hours, minutes = '0'] = value.split(':');
  const hour = Number(hours);
  const minute = Number(minutes);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour + minute / 60;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
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
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (membershipError || !membershipRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const membershipRole = String(membershipRow.role ?? '').trim().toUpperCase();
  const isManager = ['ADMIN', 'MANAGER'].includes(membershipRole);

  let query = supabaseAdmin
    .from('shift_exchange_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (!isManager) {
    query = query.or(`status.eq.OPEN,requested_by_auth_user_id.eq.${authUserId}`);
  }

  const { data: requests, error: requestError } = (await query) as {
    data: RequestRow[] | null;
    error: { message: string } | null;
  };

  if (requestError) {
    const message = String(requestError.message ?? '');
    const missingTable =
      message.toLowerCase().includes('relation') && message.toLowerCase().includes('shift_exchange_requests');
    if (missingTable) {
      return applySupabaseCookies(NextResponse.json({ requests: [] }), response);
    }
    return applySupabaseCookies(
      NextResponse.json({ error: requestError.message }, { status: 400 }),
      response
    );
  }

  const safeRequests = (requests ?? []).filter((row) => row.status === 'OPEN');
  if (safeRequests.length === 0) {
    return applySupabaseCookies(NextResponse.json({ requests: [] }), response);
  }

  const shiftIds = Array.from(new Set(safeRequests.map((row) => row.shift_id)));
  const authIds = Array.from(
    new Set(
      safeRequests
        .flatMap((row) => [row.requested_by_auth_user_id, row.claimed_by_auth_user_id].filter(Boolean))
    )
  ) as string[];

  let shiftRows: ShiftRow[] = [];
  let hasMarketplaceColumn = true;

  const shiftWithMarketplace = await supabaseAdmin
    .from('shifts')
    .select('id,user_id,shift_date,start_time,end_time,job,location_id,is_marketplace')
    .in('id', shiftIds);

  if (shiftWithMarketplace.error) {
    const message = String(shiftWithMarketplace.error.message ?? '');
    const missingMarketplace =
      message.toLowerCase().includes('is_marketplace') && message.toLowerCase().includes('does not exist');
    if (!missingMarketplace) {
      return applySupabaseCookies(
        NextResponse.json({ error: shiftWithMarketplace.error.message }, { status: 400 }),
        response
      );
    }
    hasMarketplaceColumn = false;
    const fallback = await supabaseAdmin
      .from('shifts')
      .select('id,user_id,shift_date,start_time,end_time,job,location_id')
      .in('id', shiftIds);
    if (fallback.error) {
      return applySupabaseCookies(
        NextResponse.json({ error: fallback.error.message }, { status: 400 }),
        response
      );
    }
    shiftRows = (fallback.data ?? []) as ShiftRow[];
  } else {
    shiftRows = (shiftWithMarketplace.data ?? []) as ShiftRow[];
  }

  const shiftUserIds = Array.from(new Set((shiftRows ?? []).map((row: ShiftRow) => row.user_id)));

  const { data: usersById } = await supabaseAdmin
    .from('users')
    .select('id,full_name,email,auth_user_id')
    .in('id', shiftUserIds);

  const { data: usersByAuth } = authIds.length
    ? await supabaseAdmin
        .from('users')
        .select('id,full_name,email,auth_user_id')
        .in('auth_user_id', authIds)
    : { data: [] };

  const shiftMap = new Map((shiftRows ?? []).map((row: ShiftRow) => [row.id, row]));
  const userIdRows = (usersById ?? []) as UserRow[];
  const userAuthRows = (usersByAuth ?? []) as UserRow[];
  const userIdMap = new Map(userIdRows.map((row) => [row.id, row]));
  const authMap = new Map(
    userAuthRows
      .filter((row) => Boolean(row.auth_user_id))
      .map((row) => [String(row.auth_user_id), row]),
  );

  const responseRows = safeRequests.reduce<Array<Record<string, unknown>>>((acc, row) => {
    const shift = shiftMap.get(row.shift_id);
    if (!shift) return acc;
    if (hasMarketplaceColumn && shift.is_marketplace !== true) {
      return acc;
    }
    const requesterUser = authMap.get(row.requested_by_auth_user_id);
    const claimedUser = row.claimed_by_auth_user_id ? authMap.get(row.claimed_by_auth_user_id) : null;
    const shiftOwner = userIdMap.get(shift.user_id);

    acc.push({
      id: row.id,
      organizationId: row.organization_id,
      shiftId: row.shift_id,
      requestedByAuthUserId: row.requested_by_auth_user_id,
      status: row.status,
      claimedByAuthUserId: row.claimed_by_auth_user_id,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      cancelledAt: row.cancelled_at,
      requesterName: requesterUser?.full_name || requesterUser?.email || 'Unknown',
      claimedByName: claimedUser?.full_name || claimedUser?.email || null,
      shift: {
        id: shift.id,
        userId: shift.user_id,
        date: shift.shift_date,
        startHour: parseTimeToDecimal(shift.start_time),
        endHour: parseTimeToDecimal(shift.end_time),
        job: shift.job ?? null,
        locationId: shift.location_id ?? null,
        employeeName: shiftOwner?.full_name || shiftOwner?.email || 'Unknown',
      },
    });
    return acc;
  }, []);

  return applySupabaseCookies(NextResponse.json({ requests: responseRows }), response);
}
