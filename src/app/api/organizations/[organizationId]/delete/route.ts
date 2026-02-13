import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import {
  deleteOrganizationData,
  syncStripeQuantityToOwnedOrgCount,
} from '@/lib/billing/lifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { organizationId: string };
type DeletePayload = { confirm?: string };

const AUTHORIZED_ROLES = new Set(['admin', 'owner']);

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest, ctx: { params: Promise<Params> }) {
  const { organizationId: rawOrganizationId } = await ctx.params;
  const organizationId = String(rawOrganizationId ?? '').trim();
  if (!organizationId) {
    return jsonNoStore({ error: 'organizationId is required.' }, { status: 400 });
  }

  let payload: DeletePayload | null = null;
  try {
    payload = (await request.json()) as DeletePayload;
  } catch {
    payload = null;
  }

  if (!payload || String(payload.confirm ?? '') !== 'DELETE') {
    return jsonNoStore({ error: 'confirm must equal DELETE.' }, { status: 400 });
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

  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (membershipError || !membership) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[org-delete] membership lookup failed', {
        organizationId,
        authUserId,
        error: membershipError?.message ?? null,
      });
    }
    return applySupabaseCookies(
      jsonError('Only owner/admin can delete restaurants.', 403),
      response,
    );
  }

  const role = String(membership.role ?? '').trim().toLowerCase();
  if (!AUTHORIZED_ROLES.has(role)) {
    return applySupabaseCookies(
      jsonError('Only owner/admin can delete restaurants.', 403),
      response,
    );
  }

  const deleteResult = await deleteOrganizationData(organizationId);
  if (!deleteResult.ok) {
    console.error('[org-delete] delete step failed', {
      organizationId,
      authUserId,
      table: deleteResult.failure.table,
      column: deleteResult.failure.column,
      error: deleteResult.failure.message,
      code: deleteResult.failure.code,
      details: deleteResult.failure.details,
      hint: deleteResult.failure.hint,
    });
    return applySupabaseCookies(
      jsonNoStore(
        {
          error: 'DELETE_STEP_FAILED',
          message: `Failed deleting ${deleteResult.failure.table}.`,
          table: deleteResult.failure.table,
          column: deleteResult.failure.column,
          code: deleteResult.failure.code,
          details: deleteResult.failure.details,
          hint: deleteResult.failure.hint,
        },
        { status: 500 },
      ),
      response,
    );
  }

  const fallbackResponse = {
    ok: true,
    deletedOrganizationId: organizationId,
    newQuantity: 0,
    subscriptionStatus: BILLING_ENABLED ? 'unknown' : 'active',
    quantitySynced: !BILLING_ENABLED,
  };

  try {
    const syncResult = await syncStripeQuantityToOwnedOrgCount(authUserId);
    if (!syncResult.ok) {
      console.error('[billing:quantity] failed to sync after organization delete', {
        organizationId,
        authUserId,
        error: syncResult.syncError ?? 'unknown',
      });
      return applySupabaseCookies(
        jsonNoStore({
          ...fallbackResponse,
          quantitySynced: false,
          syncError: syncResult.syncError ?? 'Failed to sync billing quantity.',
        }),
        response,
      );
    }

    return applySupabaseCookies(
      jsonNoStore({
        ok: true,
        deletedOrganizationId: organizationId,
        newQuantity: syncResult.newQuantity,
        subscriptionStatus: syncResult.subscriptionStatus,
        quantitySynced: true,
      }),
      response,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[billing:quantity] failed to sync after organization delete', {
      organizationId,
      authUserId,
      error: message,
    });
    return applySupabaseCookies(
      jsonNoStore({
        ...fallbackResponse,
        quantitySynced: false,
        syncError: message,
      }),
      response,
    );
  }
}
