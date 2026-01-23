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
  name: string;
  sortOrder?: number;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as UpdatePayload;
  if (!payload.id || !payload.organizationId || !payload.name?.trim()) {
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
  if (!['ADMIN', 'MANAGER'].includes(requester.role)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  const { data, error } = await supabaseAdmin
    .from('locations')
    .update({
      name: payload.name.trim(),
      sort_order: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
    })
    .eq('id', payload.id)
    .eq('organization_id', payload.organizationId)
    .select('id,organization_id,name,sort_order,created_at')
    .single();

  if (error || !data) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message ?? 'Unable to update location.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ location: data }), response);
}
