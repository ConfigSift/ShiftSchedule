import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/server';
import {
  BILLING_ENABLED,
  getStripePriceId,
  normalizeStripeCurrency,
  StripePriceType,
} from '@/lib/stripe/config';
import { getOrCreateStripeCustomer } from '@/lib/stripe/helpers';
import {
  getBillingAccountByAuthUserId,
  getOwnedOrganizationCount,
  isActiveBillingStatus,
} from '@/lib/billing/customer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreatePaymentIntentPayload = {
  organizationId?: string;
  priceType?: StripePriceType;
  currency?: string;
  flow?: 'setup';
};

function parsePaymentIntentClientSecret(
  subscription: Stripe.Subscription,
) {
  const latestInvoice =
    typeof subscription.latest_invoice === 'object' && subscription.latest_invoice
      ? (subscription.latest_invoice as Stripe.Invoice)
      : null;
  const paymentIntent =
    latestInvoice && typeof latestInvoice.payment_intent === 'object' && latestInvoice.payment_intent
      ? (latestInvoice.payment_intent as Stripe.PaymentIntent)
      : null;

  return String(paymentIntent?.client_secret ?? '').trim();
}

export async function POST(request: NextRequest) {
  let payload: CreatePaymentIntentPayload;
  try {
    payload = (await request.json()) as CreatePaymentIntentPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!BILLING_ENABLED) {
    return NextResponse.json({ error: 'Billing is disabled.' }, { status: 400 });
  }

  const organizationId = String(payload.organizationId ?? '').trim();
  const priceType = payload.priceType;
  const currency = normalizeStripeCurrency(payload.currency);

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
  }
  if (!priceType || (priceType !== 'monthly' && priceType !== 'annual')) {
    return NextResponse.json({ error: 'priceType (monthly|annual) is required.' }, { status: 400 });
  }
  if (!currency) {
    return NextResponse.json({ error: 'Unsupported currency.' }, { status: 400 });
  }

  const priceId = getStripePriceId(priceType, currency);
  if (!priceId) {
    return NextResponse.json(
      { error: `No Stripe price configured for ${priceType} ${currency}.` },
      { status: 400 },
    );
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
    return applySupabaseCookies(jsonError('Only managers can start billing.', 403), response);
  }

  const ownedResult = await getOwnedOrganizationCount(authUserId, supabaseAdmin);
  if (ownedResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to calculate required quantity.' }, { status: 500 }),
      response,
    );
  }
  const desiredQuantity = Math.max(1, ownedResult.count);

  const billingAccountResult = await getBillingAccountByAuthUserId(authUserId, supabaseAdmin);
  if (billingAccountResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to load billing account.' }, { status: 500 }),
      response,
    );
  }

  if (
    billingAccountResult.data
    && isActiveBillingStatus(billingAccountResult.data.status)
    && Number(billingAccountResult.data.quantity ?? 0) >= desiredQuantity
  ) {
    return applySupabaseCookies(
      NextResponse.json(
        {
          error: 'ACTIVE_SUBSCRIPTION_SUFFICIENT',
          message: 'Your active subscription already covers this restaurant count.',
          redirect: '/billing',
        },
        { status: 409 },
      ),
      response,
    );
  }

  if (
    billingAccountResult.data
    && isActiveBillingStatus(billingAccountResult.data.status)
    && Number(billingAccountResult.data.quantity ?? 0) < desiredQuantity
  ) {
    return applySupabaseCookies(
      NextResponse.json(
        {
          error: 'USE_UPGRADE_FLOW',
          message: `Upgrade to ${desiredQuantity} locations from Billing before creating this restaurant.`,
          redirect: '/billing',
        },
        { status: 409 },
      ),
      response,
    );
  }

  const email = authData.user?.email ?? '';
  const stripeCustomerId = await getOrCreateStripeCustomer(authUserId, email);

  try {
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId, quantity: desiredQuantity }],
      collection_method: 'charge_automatically',
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        auth_user_id: authUserId,
        organization_id: organizationId,
        desired_quantity: String(desiredQuantity),
        flow: 'setup',
        currency,
      },
      expand: ['latest_invoice.payment_intent', 'items.data.price'],
    });

    const clientSecret = parsePaymentIntentClientSecret(subscription);
    if (!clientSecret) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Stripe did not return a payment client secret for this subscription.' },
          { status: 502 },
        ),
        response,
      );
    }

    return applySupabaseCookies(
      NextResponse.json({
        clientSecret,
        subscriptionId: subscription.id,
        customerId: stripeCustomerId,
        currency,
        priceType,
      }),
      response,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return applySupabaseCookies(
      NextResponse.json({ error: message || 'Unable to initialize payment.' }, { status: 500 }),
      response,
    );
  }
}
