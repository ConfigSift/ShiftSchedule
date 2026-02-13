import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { syncStripeQuantityToOwnedOrgCount } from '@/lib/billing/lifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
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

  try {
    const result = await syncStripeQuantityToOwnedOrgCount(authUserId);
    if (!result.ok) {
      return applySupabaseCookies(
        NextResponse.json(
          {
            ok: false,
            error: 'RECONCILE_FAILED',
            message: result.syncError ?? 'Unable to reconcile subscription quantity.',
          },
          { status: 500 },
        ),
        response,
      );
    }

    return applySupabaseCookies(NextResponse.json(result), response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[billing:quantity] reconcile failed', {
      authUserId,
      error: message,
    });
    return applySupabaseCookies(
      NextResponse.json(
        {
          ok: false,
          error: 'RECONCILE_FAILED',
          message,
        },
        { status: 500 },
      ),
      response,
    );
  }
}
