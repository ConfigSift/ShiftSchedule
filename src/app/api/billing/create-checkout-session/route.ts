import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
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
import { getBaseUrls } from '@/lib/routing/getBaseUrls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CheckoutPayload = {
  organizationId?: string;
  intentId?: string;
  priceType?: 'monthly' | 'annual';
  flow?: 'subscribe' | 'setup';
  uiMode?: 'redirect' | 'embedded';
};

function logCheckoutEvent(event: string, payload: Record<string, unknown>) {
  console.error(`[billing:create-checkout-session] ${event}`, payload);
}

type PublishablePrefix = 'pk_test' | 'pk_live' | 'missing';
type SecretPrefix = 'sk_test' | 'sk_live' | 'missing';
type StripeMode = 'test' | 'live' | 'unknown';

function getPublishableKeyPrefix(value: string): PublishablePrefix {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'missing';
  if (normalized.startsWith('pk_test_')) return 'pk_test';
  if (normalized.startsWith('pk_live_')) return 'pk_live';
  return 'missing';
}

function getSecretKeyPrefix(value: string): SecretPrefix {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'missing';
  if (normalized.startsWith('sk_test_')) return 'sk_test';
  if (normalized.startsWith('sk_live_')) return 'sk_live';
  return 'missing';
}

function deriveStripeMode(secretKeyPrefix: SecretPrefix, publishableKeyPrefix: PublishablePrefix): StripeMode {
  if (secretKeyPrefix === 'sk_test' && publishableKeyPrefix === 'pk_test') return 'test';
  if (secretKeyPrefix === 'sk_live' && publishableKeyPrefix === 'pk_live') return 'live';
  return 'unknown';
}

export async function POST(request: NextRequest) {
  const requestHost =
    String(request.headers.get('x-forwarded-host') ?? '').trim()
    || String(request.headers.get('host') ?? '').trim()
    || 'unknown';
  const requestProto =
    String(request.headers.get('x-forwarded-proto') ?? '').trim()
    || request.nextUrl.protocol.replace(':', '')
    || 'https';
  const requestOrigin = requestHost === 'unknown' ? request.nextUrl.origin : `${requestProto}://${requestHost}`;
  const { appBaseUrl, loginBaseUrl } = getBaseUrls(requestOrigin);
  const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY ?? '').trim();
  const stripePublishableKey = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').trim();
  const publishableKeyPrefix = getPublishableKeyPrefix(stripePublishableKey);
  const secretKeyPrefix = getSecretKeyPrefix(stripeSecretKey);
  const keyMode = deriveStripeMode(secretKeyPrefix, publishableKeyPrefix);
  const hasStripeSecretKey = Boolean(stripeSecretKey);
  const hasStripePublishableKey = Boolean(stripePublishableKey);
  const hasMonthlyPriceId = Boolean(String(STRIPE_MONTHLY_PRICE_ID ?? '').trim());
  const hasAnnualPriceId = Boolean(String(STRIPE_ANNUAL_PRICE_ID ?? '').trim());
  const hasIntroCoupon = Boolean(String(STRIPE_INTRO_COUPON_ID ?? '').trim());

  let payload: CheckoutPayload;
  try {
    payload = (await request.json()) as CheckoutPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', error_code: 'invalid_json_body' }, { status: 400 });
  }

  const flow = payload.flow === 'setup' ? 'setup' : 'subscribe';
  const uiMode = payload.uiMode === 'embedded' ? 'embedded' : 'redirect';
  const priceType = payload.priceType;
  const organizationId = String(payload.organizationId ?? '').trim() || null;
  const intentId = String(payload.intentId ?? '').trim() || null;

  logCheckoutEvent('request', {
    host: requestHost,
    pathname: request.nextUrl.pathname,
    flow,
    uiMode,
    priceType: priceType ?? null,
    hasOrganizationId: Boolean(organizationId),
    hasIntentId: Boolean(intentId),
    hasStripeSecretKey,
    hasStripePublishableKey,
    publishableKeyPrefix,
    secretKeyPrefix,
    keyMode,
    hasMonthlyPriceId,
    hasAnnualPriceId,
    hasIntroCoupon,
    origin: requestOrigin,
    appBaseUrl,
    loginBaseUrl,
  });

  if (!BILLING_ENABLED) {
    return NextResponse.json({ error: 'Billing is disabled.', error_code: 'billing_disabled' }, { status: 400 });
  }

  if (!hasStripeSecretKey) {
    return NextResponse.json(
      {
        error: 'Missing Stripe secret key configuration.',
        error_code: 'missing_stripe_secret_key',
        mode: keyMode,
        secretType: 'checkout_session',
        stripeAccountId: null,
      },
      { status: 500 },
    );
  }

  if (keyMode === 'unknown') {
    logCheckoutEvent('stripe_key_mode_mismatch', {
      host: requestHost,
      origin: requestOrigin,
      publishableKeyPrefix,
      secretKeyPrefix,
    });
    return NextResponse.json(
      {
        error: 'Stripe key mode mismatch.',
        error_code: 'stripe_key_mode_mismatch',
        publishableKeyPrefix,
        secretKeyPrefix,
        mode: keyMode,
        secretType: 'checkout_session',
        stripeAccountId: null,
      },
      { status: 500 },
    );
  }

  if (!priceType || !['monthly', 'annual'].includes(priceType)) {
    return NextResponse.json(
      { error: 'priceType (monthly|annual) is required.', error_code: 'missing_price_type' },
      { status: 400 },
    );
  }

  if (!organizationId && !intentId) {
    return NextResponse.json(
      { error: 'organizationId or intentId is required.', error_code: 'missing_target' },
      { status: 400 },
    );
  }

  const priceId = String(priceType === 'monthly' ? STRIPE_MONTHLY_PRICE_ID : STRIPE_ANNUAL_PRICE_ID).trim();
  if (!priceId) {
    return NextResponse.json(
      { error: 'Billing not configured.', error_code: 'missing_price_id' },
      { status: 500 },
    );
  }

  let stripeClient: Stripe;
  try {
    stripeClient = new Stripe(stripeSecretKey, { typescript: true });
  } catch {
    return NextResponse.json(
      { error: 'Unable to initialize Stripe client.', error_code: 'stripe_init_failed' },
      { status: 500 },
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

  const successIntentSegment = effectiveIntentId
    ? `&intent_id=${encodeURIComponent(effectiveIntentId)}`
    : '';
  const cancelIntentSegment = effectiveIntentId
    ? `&intent=${encodeURIComponent(effectiveIntentId)}`
    : '';
  const successUrl = flow === 'setup'
    ? `${appBaseUrl}/setup?step=3&checkout=success&session_id={CHECKOUT_SESSION_ID}${successIntentSegment}`
    : `${appBaseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}${successIntentSegment}`;
  const cancelUrl = flow === 'setup'
    ? `${appBaseUrl}/setup?step=3&checkout=cancel${cancelIntentSegment}`
    : `${appBaseUrl}/subscribe?canceled=true${cancelIntentSegment}`;
  const returnUrl = flow === 'setup'
    ? `${appBaseUrl}/setup?step=3&checkout=success&session_id={CHECKOUT_SESSION_ID}${successIntentSegment}`
    : `${appBaseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}${successIntentSegment}`;

  let normalizedSuccessUrl = '';
  let normalizedCancelUrl = '';
  let normalizedReturnUrl = '';
  try {
    normalizedSuccessUrl = new URL(successUrl).toString();
    normalizedCancelUrl = new URL(cancelUrl).toString();
    normalizedReturnUrl = new URL(returnUrl).toString();
  } catch {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Invalid checkout return URLs.', error_code: 'invalid_return_url' },
        { status: 500 },
      ),
      response,
    );
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

  const params: Stripe.Checkout.SessionCreateParams = uiMode === 'embedded'
    ? {
      customer: stripeCustomerId,
      mode: 'subscription',
      ui_mode: 'embedded',
      return_url: normalizedReturnUrl,
      line_items: [{ price: priceId, quantity: desiredQuantity }],
      subscription_data: {
        metadata: subscriptionMetadata,
      },
      metadata: checkoutMetadata,
    }
    : {
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: desiredQuantity }],
      success_url: normalizedSuccessUrl,
      cancel_url: normalizedCancelUrl,
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

  logCheckoutEvent('stripe_params', {
    host: requestHost,
    pathname: request.nextUrl.pathname,
    authUserId,
    flow,
    uiMode,
    origin: requestOrigin,
    appBaseUrl,
    publishableKeyPrefix,
    secretKeyPrefix,
    keyMode,
    priceType,
    desiredQuantity,
    mode: params.mode,
    lineItemsCount: params.line_items?.length ?? 0,
    hasDiscounts: Boolean(params.discounts && params.discounts.length > 0),
    allowPromotionCodes: Boolean(params.allow_promotion_codes),
    priceIdPrefix: priceId.slice(0, 8),
    successUrl: normalizedSuccessUrl,
    cancelUrl: normalizedCancelUrl,
    returnUrl: normalizedReturnUrl,
  });

  let stripeAccountId: string | null = null;
  let stripeAccountLivemode: boolean | null = null;
  try {
    const account = await stripeClient.accounts.retrieve();
    stripeAccountId = account.id;
    const rawLivemode = (account as unknown as Record<string, unknown>).livemode;
    stripeAccountLivemode = typeof rawLivemode === 'boolean' ? rawLivemode : null;
  } catch {
    stripeAccountId = null;
    stripeAccountLivemode = null;
  }

  try {
    const stripeCustomer = await stripeClient.customers.retrieve(stripeCustomerId);
    if ('deleted' in stripeCustomer && stripeCustomer.deleted) {
      throw new Error(`Stripe customer ${stripeCustomerId} is deleted.`);
    }

    await stripeClient.customers.update(stripeCustomerId, {
      metadata: {
        ...(stripeCustomer.metadata ?? {}),
        auth_user_id: authUserId,
        ...(effectiveIntentId ? { intent_id: effectiveIntentId } : {}),
      },
    });

    const session = await stripeClient.checkout.sessions.create(params);
    const stripeRequestId = session.lastResponse?.requestId ?? null;
    const checkoutUrl = String(session.url ?? '').trim();
    const clientSecret = String(session.client_secret ?? '').trim();
    const sessionMode: StripeMode = session.livemode ? 'live' : 'test';
    const modeMismatch =
      (sessionMode === 'live' && keyMode === 'test')
      || (sessionMode === 'test' && keyMode === 'live');

    if (modeMismatch) {
      logCheckoutEvent('stripe_session_mode_mismatch', {
        sessionId: session.id,
        stripeRequestId,
        sessionMode,
        keyMode,
        stripeAccountId,
        stripeAccountLivemode,
      });
      return applySupabaseCookies(
        NextResponse.json(
          {
            error: 'Stripe checkout session mode mismatch.',
            error_code: 'stripe_session_mode_mismatch',
            mode: sessionMode,
            secretType: 'checkout_session',
            stripeAccountId,
          },
          { status: 500 },
        ),
        response,
      );
    }

    if (uiMode === 'embedded') {
      if (!clientSecret) {
        logCheckoutEvent('missing_checkout_client_secret', {
          sessionId: session.id,
          stripeRequestId,
          mode: session.mode,
          status: session.status,
        });
        return applySupabaseCookies(
          NextResponse.json(
            {
              error: 'Stripe checkout client secret was not returned.',
              error_code: 'missing_checkout_client_secret',
              details: { sessionId: session.id },
              mode: sessionMode,
              secretType: 'checkout_session',
              stripeAccountId,
            },
            { status: 502 },
          ),
          response,
        );
      }

      if (!clientSecret.startsWith('cs_')) {
        const detectedSecretType = clientSecret.startsWith('pi_') ? 'payment_intent' : 'unknown';
        logCheckoutEvent('invalid_embedded_secret_type', {
          sessionId: session.id,
          stripeRequestId,
          detectedSecretType,
          mode: sessionMode,
          stripeAccountId,
        });
        return applySupabaseCookies(
          NextResponse.json(
            {
              error: 'Stripe returned an invalid secret type for embedded checkout.',
              error_code: 'invalid_embedded_secret_type',
              mode: sessionMode,
              secretType: detectedSecretType,
              stripeAccountId,
            },
            { status: 502 },
          ),
          response,
        );
      }

      logCheckoutEvent('created', {
        sessionId: session.id,
        stripeRequestId,
        uiMode,
        hasClientSecret: Boolean(clientSecret),
        mode: sessionMode,
        stripeAccountId,
        stripeAccountLivemode,
        hasStripeSecretKey,
        hasStripePublishableKey,
        appBaseUrl,
        loginBaseUrl,
        secretType: 'checkout_session',
      });

      return applySupabaseCookies(
        NextResponse.json({
          clientSecret,
          sessionId: session.id,
          uiMode: 'embedded',
          mode: sessionMode,
          stripeAccountId,
          secretType: 'checkout_session',
        }),
        response,
      );
    }

    if (!checkoutUrl) {
      logCheckoutEvent('missing_checkout_url', {
        sessionId: session.id,
        stripeRequestId,
        mode: session.mode,
        status: session.status,
      });
      return applySupabaseCookies(
        NextResponse.json(
          {
            error: 'Stripe checkout URL was not returned.',
            error_code: 'missing_checkout_url',
            details: { sessionId: session.id },
            mode: sessionMode,
            secretType: 'checkout_session',
            stripeAccountId,
          },
          { status: 502 },
        ),
        response,
      );
    }

    logCheckoutEvent('created', {
      sessionId: session.id,
      stripeRequestId,
      uiMode,
      hasUrl: Boolean(checkoutUrl),
      mode: sessionMode,
      stripeAccountId,
      stripeAccountLivemode,
      hasStripeSecretKey,
      hasStripePublishableKey,
      appBaseUrl,
      loginBaseUrl,
      secretType: 'checkout_session',
    });

    return applySupabaseCookies(
      NextResponse.json({
        checkoutUrl,
        sessionId: session.id,
        mode: sessionMode,
        stripeAccountId,
        secretType: 'checkout_session',
      }),
      response,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stripeLike = error as {
      type?: string;
      code?: string;
      requestId?: string;
      raw?: { requestId?: string; type?: string };
      statusCode?: number;
    };
    const stripeRequestId = stripeLike.requestId ?? stripeLike.raw?.requestId ?? null;
    logCheckoutEvent('failed', {
      host: requestHost,
      origin: requestOrigin,
      appBaseUrl,
      loginBaseUrl,
      hasStripeSecretKey,
      hasStripePublishableKey,
      keyMode,
      stripeAccountId,
      stripeAccountLivemode,
      message,
      stripeType: stripeLike.type ?? stripeLike.raw?.type ?? null,
      stripeCode: stripeLike.code ?? null,
      stripeStatusCode: stripeLike.statusCode ?? null,
      stripeRequestId,
    });

    return applySupabaseCookies(
      NextResponse.json(
        {
          error: message || 'Unable to create checkout session.',
          error_code: 'checkout_session_create_failed',
          mode: keyMode,
          secretType: 'checkout_session',
          stripeAccountId,
        },
        { status: 500 },
      ),
      response,
    );
  }
}
