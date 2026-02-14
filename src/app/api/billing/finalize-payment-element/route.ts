import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/server';
import {
  toIsoFromUnixTimestamp,
  upsertBillingAccountFromSubscription,
} from '@/lib/billing/customer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type FinalizePayload = {
  organizationId?: string;
  subscriptionId?: string;
};

function isStatusActiveForGating(
  subscription: Stripe.Subscription,
  latestInvoice: Stripe.Invoice | null,
) {
  const status = String(subscription.status ?? '').trim().toLowerCase();
  if (status === 'active' || status === 'trialing') {
    return true;
  }
  if (status !== 'incomplete') {
    return false;
  }

  const invoicePaid = latestInvoice?.paid === true || latestInvoice?.status === 'paid';
  const paymentIntentStatus = (() => {
    const paymentIntent = latestInvoice?.payment_intent;
    if (!paymentIntent) return '';
    if (typeof paymentIntent === 'string') return '';
    return String(paymentIntent.status ?? '').trim().toLowerCase();
  })();
  return invoicePaid || paymentIntentStatus === 'succeeded';
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest) {
  let payload: FinalizePayload;
  try {
    payload = (await request.json()) as FinalizePayload;
  } catch {
    return jsonNoStore({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const organizationId = String(payload.organizationId ?? '').trim();
  const subscriptionId = String(payload.subscriptionId ?? '').trim();
  if (!organizationId || !subscriptionId) {
    return jsonNoStore({ error: 'organizationId and subscriptionId are required.' }, { status: 400 });
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

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const membershipRole = String(membership?.role ?? '').trim().toLowerCase();
  if (!membership || (membershipRole !== 'admin' && membershipRole !== 'owner' && membershipRole !== 'manager')) {
    return applySupabaseCookies(
      jsonNoStore({ error: 'Only managers can finalize billing.' }, { status: 403 }),
      response,
    );
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent', 'items.data.price'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return applySupabaseCookies(
      jsonNoStore({ error: message || 'Unable to load subscription.' }, { status: 400 }),
      response,
    );
  }

  const metadataAuthUserId = String(subscription.metadata?.auth_user_id ?? '').trim() || null;
  if (metadataAuthUserId && metadataAuthUserId !== authUserId) {
    return applySupabaseCookies(
      jsonNoStore({ error: 'Subscription does not belong to this user.' }, { status: 403 }),
      response,
    );
  }

  const metadataOrganizationId = String(subscription.metadata?.organization_id ?? '').trim() || null;
  if (metadataOrganizationId && metadataOrganizationId !== organizationId) {
    return applySupabaseCookies(
      jsonNoStore({ error: 'Subscription does not match this organization.' }, { status: 409 }),
      response,
    );
  }

  const upsertResult = await upsertBillingAccountFromSubscription(
    authUserId,
    subscription,
    supabaseAdmin,
  );
  if (upsertResult.error) {
    return applySupabaseCookies(
      jsonNoStore({ error: 'Failed to persist billing account status.' }, { status: 500 }),
      response,
    );
  }

  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null;

  if (stripeCustomerId) {
    await supabaseAdmin
      .from('stripe_customers')
      .upsert(
        {
          auth_user_id: authUserId,
          stripe_customer_id: stripeCustomerId,
        },
        { onConflict: 'auth_user_id' },
      );
  }

  const latestInvoice =
    typeof subscription.latest_invoice === 'object' && subscription.latest_invoice
      ? (subscription.latest_invoice as Stripe.Invoice)
      : null;
  const active = isStatusActiveForGating(subscription, latestInvoice);

  if (!active) {
    return applySupabaseCookies(
      jsonNoStore(
        {
          ok: false,
          active: false,
          status: subscription.status,
          error: 'Subscription is not active yet.',
        },
        { status: 409 },
      ),
      response,
    );
  }

  if (String(subscription.status ?? '').trim().toLowerCase() === 'incomplete') {
    await supabaseAdmin
      .from('billing_accounts')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', authUserId);
  }

  const quantity = subscription.items.data[0]?.quantity ?? 1;
  const currentPeriodEnd = toIsoFromUnixTimestamp(subscription.current_period_end);

  if (stripeCustomerId) {
    await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          organization_id: organizationId,
          status: 'active',
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscription.id,
          current_period_start: toIsoFromUnixTimestamp(subscription.current_period_start),
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: subscription.cancel_at_period_end,
          stripe_price_id: subscription.items.data[0]?.price?.id ?? null,
          quantity,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      );
  }

  return applySupabaseCookies(
    jsonNoStore({
      ok: true,
      active: true,
      status: 'active',
      organizationId,
      subscriptionId: subscription.id,
      stripeCustomerId,
      quantity,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
    }),
    response,
  );
}
