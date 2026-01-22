import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UpdatePayload = {
  id: string;
  organizationId: string;
  userId?: string | null;
  scope: 'ORG_BLACKOUT' | 'EMPLOYEE';
  startDate: string;
  endDate: string;
  reason: string;
  status?: string;
  managerNote?: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as UpdatePayload;
  if (!payload.id || !payload.organizationId || !payload.scope || !payload.startDate || !payload.endDate || !payload.reason) {
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

  const { data: requesterRow, error: requesterError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const requester = normalizeUserRow(requesterRow);
  const requesterRole = requester.role;
  if (!['ADMIN', 'MANAGER'].includes(requesterRole)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  if (payload.scope === 'EMPLOYEE' && !payload.userId) {
    return applySupabaseCookies(NextResponse.json({ error: 'Employee is required.' }, { status: 400 }), response);
  }

  if (payload.scope === 'EMPLOYEE' && payload.userId) {
    const { data: targetRow, error: targetError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', payload.userId)
      .maybeSingle();

    if (targetError || !targetRow) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
        response
      );
    }

    const target = normalizeUserRow(targetRow);
    if (target.organizationId !== payload.organizationId) {
      return applySupabaseCookies(jsonError('Target not in this organization.', 403), response);
    }
    if (requesterRole === 'MANAGER' && target.role === 'ADMIN') {
      return applySupabaseCookies(jsonError('Managers cannot block out admins.', 403), response);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('blocked_day_requests')
    .update({
      user_id: payload.userId ?? null,
      scope: payload.scope,
      start_date: payload.startDate,
      end_date: payload.endDate,
      reason: payload.reason,
      status: payload.status ?? undefined,
      manager_note: payload.managerNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.id)
    .eq('organization_id', payload.organizationId)
    .select('*')
    .single();

  if (error || !data) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message ?? 'Unable to update blocked day.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ request: data }), response);
}
