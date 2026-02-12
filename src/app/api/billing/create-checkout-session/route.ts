import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { stripe } from '@/lib/stripe/server';
import {
  STRIPE_MONTHLY_PRICE_ID,
  STRIPE_ANNUAL_PRICE_ID,
  STRIPE_INTRO_COUPON_ID,
} from '@/lib/stripe/config';
import { getOrCreateStripeCustomer, getLocationCount } from '@/lib/stripe/helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CheckoutPayload = {
  organizationId: string;
  priceType: 'monthly' | 'annual';
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as CheckoutPayload;
  const { organizationId, priceType } = payload;

  if (!organizationId) {
    return NextResponse.json(
      { error: 'organizationId is required.' },
      { status: 400 },
    );
  }

  if (!priceType || !['monthly', 'annual'].includes(priceType)) {
    return NextResponse.json(
      { error: 'priceType (monthly|annual) is required.' },
      { status: 400 },
    );
  }

  const priceId = priceType === 'monthly' ? STRIPE_MONTHLY_PRICE_ID : STRIPE_ANNUAL_PRICE_ID;
  if (!priceId) {
    console.error('[billing:checkout] Missing price ID for', priceType);
    return NextResponse.json({ error: 'Billing not configured.' }, { status: 500 });
  }

  // Authenticate
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

  // Verify user is admin of this org
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!membership || membership.role !== 'admin') {
    return applySupabaseCookies(
      jsonError('Only admins can manage billing.', 403),
      response,
    );
  }

  // Check for existing active subscription
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('status')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (existingSub && ['active', 'trialing'].includes(existingSub.status)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Organization already has an active subscription.' }, { status: 409 }),
      response,
    );
  }

  // Get or create Stripe customer
  const email = authData.user.email ?? '';
  const stripeCustomerId = await getOrCreateStripeCustomer(authUserId, email);

  // Count locations for quantity
  const quantity = await getLocationCount(organizationId);

  // Build Checkout Session params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const params: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    customer: stripeCustomerId,
    client_reference_id: organizationId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity }],
    success_url: `${appUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/subscribe?canceled=true`,
    subscription_data: {
      metadata: { organization_id: organizationId },
    },
    metadata: { organization_id: organizationId },
  };

  // Stripe Checkout accepts either automatic discounts OR manual promo codes, not both.
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

    const mergedCustomerMetadata = {
      ...(stripeCustomer.metadata ?? {}),
      organization_id: organizationId,
    };
    await stripe.customers.update(stripeCustomerId, {
      metadata: mergedCustomerMetadata,
    });

    const session = await stripe.checkout.sessions.create(params);
    console.log('[billing:create-checkout]', {
      organizationId,
      selectedPriceId: priceId,
      customerId: stripeCustomerId,
      sessionId: session.id,
    });
    return applySupabaseCookies(
      NextResponse.json({ url: session.url }),
      response,
    );
  } catch (err) {
    const unknownError = err as Record<string, unknown> | null;
    const stripeDiagnostics = {
      type: typeof unknownError?.type === 'string' ? unknownError.type : null,
      code: typeof unknownError?.code === 'string' ? unknownError.code : null,
      param: typeof unknownError?.param === 'string' ? unknownError.param : null,
    };
    const supabaseDiagnostics = {
      message: typeof unknownError?.message === 'string' ? unknownError.message : null,
      details: typeof unknownError?.details === 'string' ? unknownError.details : null,
      hint: typeof unknownError?.hint === 'string' ? unknownError.hint : null,
      code: typeof unknownError?.code === 'string' ? unknownError.code : null,
    };

    console.error('[billing/create-checkout-session] failed', {
      error: err,
      message: err instanceof Error ? err.message : null,
      stack: err instanceof Error ? err.stack : null,
      stripe: stripeDiagnostics,
      supabase: supabaseDiagnostics,
      envPresent: {
        STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
        STRIPE_PRICE_PRO_MONTHLY: Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY),
        STRIPE_PRICE_PRO_YEARLY: Boolean(process.env.STRIPE_PRICE_PRO_YEARLY),
        STRIPE_COUPON_INTRO: Boolean(process.env.STRIPE_COUPON_INTRO),
        NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
        NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      },
    });
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to create checkout session.' }, { status: 500 }),
      response,
    );
  }
}
