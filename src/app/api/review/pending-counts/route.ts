import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
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

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('auth_user_id', authUserId)
    .in('role', ['admin', 'manager', 'ADMIN', 'MANAGER']);

  if (membershipError) {
    return applySupabaseCookies(
      NextResponse.json({ error: membershipError.message }, { status: 400 }),
      response
    );
  }

  const orgIds = Array.from(
    new Set((memberships || []).map((row) => String(row.organization_id)).filter(Boolean))
  );

  const counts: Record<string, { timeOff: number; blockedDays: number; total: number }> = {};

  for (const orgId of orgIds) {
    const timeOffResult = await supabaseAdmin
      .from('time_off_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'PENDING');

    if (timeOffResult.error) {
      return applySupabaseCookies(
        NextResponse.json({ error: timeOffResult.error.message }, { status: 400 }),
        response
      );
    }

    const blockedResult = await supabaseAdmin
      .from('blocked_day_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'PENDING');

    if (blockedResult.error) {
      return applySupabaseCookies(
        NextResponse.json({ error: blockedResult.error.message }, { status: 400 }),
        response
      );
    }

    const timeOff = timeOffResult.count ?? 0;
    const blockedDays = blockedResult.count ?? 0;
    counts[orgId] = {
      timeOff,
      blockedDays,
      total: timeOff + blockedDays,
    };
  }

  return applySupabaseCookies(NextResponse.json({ counts }), response);
}
