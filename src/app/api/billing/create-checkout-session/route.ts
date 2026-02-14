import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { stripe } from '@/lib/stripe/server';
import {
  STRIPE_MONTHLY_PRICE_ID,
  STRIPE_ANNUAL_PRICE_ID,
  STRIPE_INTRO_COUPON_ID,
  BILLING_ENABLED,
} from '@/lib/stripe/config';
import { getOrCreateStripeCustomer } from '@/lib/stripe/helpers';
import {
  getBillingAccountByAuthUserId,
  getOwnedOrganizationCount,
  isActiveBillingStatus,
} from '@/lib/billing/customer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CheckoutPayload = {
  organizationId?: string;
  intentId?: string;
  priceType?: 'monthly' | 'annual';
  flow?: 'subscribe' | 'setup';
};

export async function POST(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  let payload: CheckoutPayload;
  try {
    payload = (await request.json()) as CheckoutPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!BILLING_ENABLED) {
    return NextResponse.json({ error: 'Billing is disabled.' }, { status: 400 });
  }

  const organizationId = String(payload.organizationId ?? '').trim() || null;
  const intentId = String(payload.intentId ?? '').trim() || null;
  const priceType = payload.priceType;
  const flow = payload.flow === 'setup' ? 'setup' : 'subscribe';

  if (!priceType || !['monthly', 'annual'].includes(priceType)) {
    return NextResponse.json({ error: 'priceType (monthly|annual) is required.' }, { status: 400 });
  }

  if (!organizationId && !intentId) {
    return NextResponse.json(
      { error: 'organizationId or intentId is required.' },
      { status: 400 },
    );
  }

  const priceId = priceType === 'monthly' ? STRIPE_MONTHLY_PRICE_ID : STRIPE_ANNUAL_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: 'Billing not configured.' }, { status: 500 });
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

  let desiredQuantity = 1;
  let effectiveIntentId: string | null = null;
  let effectiveOrganizationId: string | null = organizationId;

  if (intentId) {
    const { data: intent, error: intentError } = await supabaseAdmin
      .from('organization_create_intents')
      .select('id,status,desired_quantity,auth_user_id')
      .eq('id', intentId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (intentError) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unable to load creation intent.' }, { status: 500 }),
        response,
      );
    }
    if (!intent || intent.status !== 'pending') {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Intent is not pending.' }, { status: 409 }),
        response,
      );
    }

    desiredQuantity = Math.max(1, Number(intent.desired_quantity ?? 1));
    effectiveIntentId = intent.id;
    effectiveOrganizationId = null;
  } else if (organizationId) {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('role')
      .eq('auth_user_id', authUserId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    const role = String(membership?.role ?? '').trim().toLowerCase();
    if (!membership || role !== 'admin') {
      return applySupabaseCookies(jsonError('Only admins can manage billing.', 403), response);
    }

    const ownedResult = await getOwnedOrganizationCount(authUserId, supabaseAdmin);
    if (ownedResult.error) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unable to calculate required quantity.' }, { status: 500 }),
        response,
      );
    }
    desiredQuantity = Math.max(1, ownedResult.count);
  }

  const billingAccountResult = await getBillingAccountByAuthUserId(authUserId, supabaseAdmin);
  if (billingAccountResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to load billing account.' }, { status: 500 }),
      response,
    );
  }

  if (
    billingAccountResult.data &&
    isActiveBillingStatus(billingAccountResult.data.status) &&
    Number(billingAccountResult.data.quantity ?? 0) >= desiredQuantity
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
    billingAccountResult.data &&
    isActiveBillingStatus(billingAccountResult.data.status) &&
    Number(billingAccountResult.data.quantity ?? 0) < desiredQuantity
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

  const email = authData.user.email ?? '';
  const stripeCustomerId = await getOrCreateStripeCustomer(authUserId, email);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const successIntentSegment = effectiveIntentId
    ? `&intent_id=${encodeURIComponent(effectiveIntentId)}`
    : '';
  const cancelIntentSegment = effectiveIntentId
    ? `&intent=${encodeURIComponent(effectiveIntentId)}`
    : '';
  const successUrl = flow === 'setup'
    ? `${appUrl}/setup?step=3&checkout=success&session_id={CHECKOUT_SESSION_ID}${successIntentSegment}`
    : `${appUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}${successIntentSegment}`;
  const cancelUrl = flow === 'setup'
    ? `${appUrl}/setup?step=3&checkout=cancel${cancelIntentSegment}`
    : `${appUrl}/subscribe?canceled=true${cancelIntentSegment}`;

  if (isDev) {
    // eslint-disable-next-line no-console
    console.debug('[billing:create-checkout-session] request', {
      authUserId,
      flow,
      organizationId: effectiveOrganizationId,
      intentId: effectiveIntentId,
      desiredQuantity,
      priceType,
      successUrl,
      cancelUrl,
    });
  }

  const subscriptionMetadata: Record<string, string> = {
    auth_user_id: authUserId,
    desired_quantity: String(desiredQuantity),
  };
  const checkoutMetadata: Record<string, string> = {
    auth_user_id: authUserId,
    desired_quantity: String(desiredQuantity),
  };

  if (effectiveIntentId) {
    subscriptionMetadata.intent_id = effectiveIntentId;
    checkoutMetadata.intent_id = effectiveIntentId;
  }
  if (effectiveOrganizationId) {
    subscriptionMetadata.organization_id = effectiveOrganizationId;
    checkoutMetadata.organization_id = effectiveOrganizationId;
  }

  const params: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: desiredQuantity }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: subscriptionMetadata,
    },
    metadata: checkoutMetadata,
  };

  if (STRIPE_INTRO_COUPON_ID) {
    params.discounts = [{ coupon: STRIPE_INTRO_COUPON_ID }];
  } else {
    params.allow_promotion_codes = true;
  }

  try {
    const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);
    if ('deleted' in stripeCustomer && stripeCustomer.deleted) {
      throw new Error(`Stripe customer ${stripeCustomerId} is deleted.`);
    }

    await stripe.customers.update(stripeCustomerId, {
      metadata: {
        ...(stripeCustomer.metadata ?? {}),
        auth_user_id: authUserId,
        ...(effectiveIntentId ? { intent_id: effectiveIntentId } : {}),
      },
    });

    const session = await stripe.checkout.sessions.create(params);
    const checkoutUrl = String(session.url ?? '').trim();
    if (!checkoutUrl) {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.error('[billing:create-checkout-session] Stripe session missing URL', {
          sessionId: session.id,
          mode: session.mode,
          status: session.status,
        });
      }
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Stripe checkout URL was not returned.', details: { sessionId: session.id } },
          { status: 502 },
        ),
        response,
      );
    }

    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug('[billing:create-checkout-session] created', {
        sessionId: session.id,
        hasUrl: Boolean(checkoutUrl),
      });
    }

    return applySupabaseCookies(
      NextResponse.json({ checkoutUrl }),
      response,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDev) {
      // eslint-disable-next-line no-console
      console.error('[billing:create-checkout-session] failed', {
        message,
      });
    }
    return applySupabaseCookies(
      NextResponse.json(
        {
          error: message || 'Unable to create checkout session.',
          details: isDev ? { flow, organizationId: effectiveOrganizationId, intentId: effectiveIntentId } : undefined,
        },
        { status: 500 },
      ),
      response,
    );
  }
}
