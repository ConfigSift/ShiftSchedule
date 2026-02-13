import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  cancelStripeSubscriptionIfNeeded,
  countOwnedOrganizations,
  getBillingAccountForUser,
} from '@/lib/billing/lifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DeletePayload = {
  confirm?: string;
};

const CANCELLATION_REQUIRED_STATUSES = new Set(['active', 'trialing', 'past_due']);

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function isMissingDbObject(message: string | null | undefined) {
  const normalized = String(message ?? '').toLowerCase();
  return (
    (normalized.includes('relation') && normalized.includes('does not exist')) ||
    (normalized.includes('column') && normalized.includes('does not exist')) ||
    normalized.includes('could not find the table')
  );
}

export async function POST(request: NextRequest) {
  let payload: DeletePayload;
  try {
    payload = (await request.json()) as DeletePayload;
  } catch {
    return jsonNoStore({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (String(payload.confirm ?? '') !== 'DELETE') {
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

  console.log('[account:delete] request', { authUserId });

  let billingAccount: Awaited<ReturnType<typeof getBillingAccountForUser>>;
  try {
    billingAccount = await getBillingAccountForUser(authUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[account:delete] billing lookup failed', {
      authUserId,
      error: message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Unable to load billing account.' }, { status: 500 }),
      response,
    );
  }
  const { data: membershipRows, error: membershipLookupError } = await supabaseAdmin
    .from('organization_memberships')
    .select('organization_id,role')
    .eq('auth_user_id', authUserId);

  if (membershipLookupError) {
    console.error('[account:delete] membership lookup failed', {
      authUserId,
      error: membershipLookupError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Unable to verify memberships.' }, { status: 500 }),
      response,
    );
  }

  const hasAdminMembership = (membershipRows ?? []).some((row) => {
    const role = String(row.role ?? '').trim().toLowerCase();
    return role === 'admin' || role === 'owner';
  });

  if (BILLING_ENABLED && !billingAccount && (membershipRows?.length ?? 0) > 0) {
    return applySupabaseCookies(
      jsonNoStore({ error: 'Only the primary billing account owner can delete this account.' }, { status: 403 }),
      response,
    );
  }

  if (!billingAccount && (membershipRows?.length ?? 0) > 0 && !hasAdminMembership) {
    return applySupabaseCookies(
      jsonNoStore({ error: 'Only the primary account admin can delete this account.' }, { status: 403 }),
      response,
    );
  }

  let owned: Awaited<ReturnType<typeof countOwnedOrganizations>>;
  try {
    owned = await countOwnedOrganizations(authUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[account:delete] owned org count failed', {
      authUserId,
      error: message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Unable to verify restaurants.' }, { status: 500 }),
      response,
    );
  }
  console.log('[account:delete] owned organizations', {
    authUserId,
    ownedCount: owned.count,
  });

  if (owned.count > 0) {
    return applySupabaseCookies(
      jsonNoStore(
        {
          error: 'RESTAURANTS_REMAIN',
          count: owned.count,
          organizations: owned.organizations,
        },
        { status: 409 },
      ),
      response,
    );
  }

  const remainingMembershipCount = membershipRows?.length ?? 0;
  if (remainingMembershipCount > 0) {
    return applySupabaseCookies(
      jsonNoStore(
        {
          error: 'MEMBERSHIPS_REMAIN',
          count: remainingMembershipCount,
        },
        { status: 409 },
      ),
      response,
    );
  }

  const billingStatus = String(billingAccount?.status ?? '').trim().toLowerCase();
  if (BILLING_ENABLED && billingAccount) {
    const cancelResult = await cancelStripeSubscriptionIfNeeded(authUserId);
    const statusAfterCancelAttempt = String(cancelResult.status ?? '').trim().toLowerCase();
    console.log('[account:delete] subscription cancel check', {
      authUserId,
      statusBefore: billingStatus || 'none',
      statusAfter: statusAfterCancelAttempt || 'none',
      canceled: cancelResult.canceled,
      ok: cancelResult.ok,
    });

    const stillBlocking =
      CANCELLATION_REQUIRED_STATUSES.has(statusAfterCancelAttempt) && !cancelResult.canceled;

    if (!cancelResult.ok || stillBlocking) {
      return applySupabaseCookies(
        jsonNoStore(
          {
            error: 'SUBSCRIPTION_ACTIVE',
            message:
              'Your subscription is still active. Cancel it in Billing Portal, then delete your account.',
            manageBillingUrl: cancelResult.manageBillingUrl,
          },
          { status: 409 },
        ),
        response,
      );
    }
  }

  const stripeCustomerId = String(billingAccount?.stripe_customer_id ?? '').trim() || null;
  if (stripeCustomerId) {
    const { error: subscriptionDeleteError } = await supabaseAdmin
      .from('subscriptions')
      .delete()
      .eq('stripe_customer_id', stripeCustomerId);
    if (subscriptionDeleteError && !isMissingDbObject(subscriptionDeleteError.message)) {
      console.error('[account:delete] deleting subscriptions failed', {
        authUserId,
        error: subscriptionDeleteError.message,
      });
      return applySupabaseCookies(
        jsonNoStore({ error: 'Failed deleting subscription rows.' }, { status: 500 }),
        response,
      );
    }
  }

  const { error: intentDeleteError } = await supabaseAdmin
    .from('organization_create_intents')
    .delete()
    .eq('auth_user_id', authUserId);
  if (intentDeleteError && !isMissingDbObject(intentDeleteError.message)) {
    console.error('[account:delete] deleting intents failed', {
      authUserId,
      error: intentDeleteError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Failed deleting pending intents.' }, { status: 500 }),
      response,
    );
  }

  const { error: billingDeleteError } = await supabaseAdmin
    .from('billing_accounts')
    .delete()
    .eq('auth_user_id', authUserId);
  if (billingDeleteError && !isMissingDbObject(billingDeleteError.message)) {
    console.error('[account:delete] deleting billing account failed', {
      authUserId,
      error: billingDeleteError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Failed deleting billing account.' }, { status: 500 }),
      response,
    );
  }

  const { error: stripeCustomerDeleteError } = await supabaseAdmin
    .from('stripe_customers')
    .delete()
    .eq('auth_user_id', authUserId);
  if (stripeCustomerDeleteError && !isMissingDbObject(stripeCustomerDeleteError.message)) {
    console.error('[account:delete] deleting stripe customer mapping failed', {
      authUserId,
      error: stripeCustomerDeleteError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Failed deleting Stripe customer mapping.' }, { status: 500 }),
      response,
    );
  }

  const { error: usersDeleteError } = await supabaseAdmin
    .from('users')
    .delete()
    .eq('auth_user_id', authUserId);
  if (usersDeleteError && !isMissingDbObject(usersDeleteError.message)) {
    console.error('[account:delete] deleting user rows failed', {
      authUserId,
      error: usersDeleteError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Failed deleting user rows.' }, { status: 500 }),
      response,
    );
  }

  const { count: finalMembershipCount, error: finalMembershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId);

  if (finalMembershipError) {
    console.error('[account:delete] final membership check failed', {
      authUserId,
      error: finalMembershipError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Unable to verify remaining memberships.' }, { status: 500 }),
      response,
    );
  }

  if ((finalMembershipCount ?? 0) > 0) {
    return applySupabaseCookies(
      jsonNoStore(
        {
          ok: true,
          deletedAuthUser: false,
        },
      ),
      response,
    );
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
  if (authDeleteError) {
    console.error('[account:delete] auth delete failed', {
      authUserId,
      error: authDeleteError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Failed deleting auth user.' }, { status: 500 }),
      response,
    );
  }

  console.log('[account:delete] completed', {
    authUserId,
    deletedAuthUser: true,
  });

  return applySupabaseCookies(
    jsonNoStore({
      ok: true,
      deletedAuthUser: true,
    }),
    response,
  );
}
