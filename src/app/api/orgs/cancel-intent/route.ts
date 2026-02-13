import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CancelIntentPayload = {
  intentId?: string;
};

export async function POST(request: NextRequest) {
  let payload: CancelIntentPayload;
  try {
    payload = (await request.json()) as CancelIntentPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const intentId = String(payload.intentId ?? '').trim();
  if (!intentId) {
    return NextResponse.json({ error: 'intentId is required.' }, { status: 400 });
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

  const { error } = await supabaseAdmin
    .from('organization_create_intents')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
      last_error: { reason: 'canceled_by_user' },
    })
    .eq('id', intentId)
    .eq('auth_user_id', authUserId)
    .eq('status', 'pending');

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to cancel intent.' }, { status: 500 }),
      response,
    );
  }

  return applySupabaseCookies(NextResponse.json({ ok: true }), response);
}
