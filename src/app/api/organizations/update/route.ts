import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UpdatePayload = {
  organizationId: string;
  name: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as UpdatePayload;
  if (!payload.organizationId || !payload.name) {
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
  if (requester.role !== 'ADMIN') {
    return applySupabaseCookies(jsonError('Only admins can edit restaurants.', 403), response);
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .update({ name: payload.name })
    .eq('id', payload.organizationId)
    .select('id,name,restaurant_code,created_at')
    .single();

  if (error || !data) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message ?? 'Unable to update restaurant.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ organization: data }), response);
}
