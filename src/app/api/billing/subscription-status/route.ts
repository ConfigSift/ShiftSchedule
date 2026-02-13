import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import { stripe } from '@/lib/stripe/server';
import {
  getBillingAccountByAuthUserId,
  getOwnedOrganizationCount,
  getStripeCustomerIdForAuthUser,
  isActiveBillingStatus,
  refreshBillingAccountFromStripe,
  upsertBillingAccountFromSubscription,
} from '@/lib/billing/customer';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function responseForDisabledBilling() {
  return {
    billingEnabled: false,
    active: true,
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: null,
    subscription: null,
    owned_org_count: 0,
    required_quantity: 0,
    over_limit: false,
  };
}

async function trySelfHealFromStripe(authUserId: string) {
  const stripeCustomerId = await getStripeCustomerIdForAuthUser(authUserId, supabaseAdmin);
  if (!stripeCustomerId) {
    return null;
  }

  try {
    const list = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });

    const ranked = [...list.data].sort((a, b) => b.created - a.created);
    const preferred =
      ranked.find((subscription) => isActiveBillingStatus(subscription.status)) ??
      ranked.find((subscription) => subscription.status !== 'canceled') ??
      ranked[0] ??
      null;

    if (!preferred) {
      return null;
    }

    await upsertBillingAccountFromSubscription(authUserId, preferred, supabaseAdmin);
    return preferred;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!BILLING_ENABLED) {
    return NextResponse.json(responseForDisabledBilling());
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

  const ownedResult = await getOwnedOrganizationCount(authUserId, supabaseAdmin);
  if (ownedResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to verify organization access.' }, { status: 500 }),
      response,
    );
  }

  const { count: membershipCount } = await supabaseAdmin
    .from('organization_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId);

  const ownedOrgCount = ownedResult.count;
  const isNonOwnerMember = (membershipCount ?? 0) > 0 && ownedOrgCount === 0;
  if (isNonOwnerMember) {
    return applySupabaseCookies(
      NextResponse.json({
        billingEnabled: true,
        active: true,
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: null,
        subscription: null,
        owned_org_count: 0,
        required_quantity: 0,
        over_limit: false,
      }),
      response,
    );
  }

  let billingResult = await refreshBillingAccountFromStripe(authUserId, supabaseAdmin);
  if (billingResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to check billing account.' }, { status: 500 }),
      response,
    );
  }

  if (!billingResult.data) {
    await trySelfHealFromStripe(authUserId);
    billingResult = await getBillingAccountByAuthUserId(authUserId, supabaseAdmin);
    if (billingResult.error) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unable to check billing account.' }, { status: 500 }),
        response,
      );
    }
  }

  const account = billingResult.data;
  const status = String(account?.status ?? 'none').trim().toLowerCase();
  const quantity = Math.max(0, Number(account?.quantity ?? 0));
  const requiredQuantity = Math.max(1, ownedOrgCount);
  const baseActive = isActiveBillingStatus(status);
  const overLimit = baseActive && quantity < requiredQuantity;
  const active = baseActive && !overLimit;

  return applySupabaseCookies(
    NextResponse.json({
      billingEnabled: true,
      active,
      status,
      cancel_at_period_end: Boolean(account?.cancel_at_period_end),
      current_period_end: account?.current_period_end ?? null,
      subscription: account
        ? {
            status,
            stripe_subscription_id: account.stripe_subscription_id,
            stripe_price_id: account.stripe_price_id,
            quantity,
            current_period_end: account.current_period_end,
            cancel_at_period_end: Boolean(account.cancel_at_period_end),
          }
        : null,
      owned_org_count: ownedOrgCount,
      required_quantity: requiredQuantity,
      over_limit: overLimit,
    }),
    response,
  );
}
