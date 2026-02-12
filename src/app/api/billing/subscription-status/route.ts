import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import { stripe } from '@/lib/stripe/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toIsoFromStripeTimestamp(timestamp: number | null | undefined) {
  if (typeof timestamp !== 'number') return null;
  return new Date(timestamp * 1000).toISOString();
}

function buildStripeDerivedSubscription(
  organizationId: string,
  stripeSubscription: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>,
) {
  const stripeCustomerId =
    typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id ?? null;
  const stripePriceId = stripeSubscription.items.data[0]?.price?.id ?? null;
  const quantity = stripeSubscription.items.data[0]?.quantity ?? 1;
  const stripePeriodStart = toIsoFromStripeTimestamp(stripeSubscription.current_period_start);
  const stripePeriodEnd = toIsoFromStripeTimestamp(stripeSubscription.current_period_end);

  return {
    status: stripeSubscription.status,
    periodEnd: stripePeriodEnd,
    row: {
      organization_id: organizationId,
      status: stripeSubscription.status,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscription.id,
      current_period_start: stripePeriodStart,
      current_period_end: stripePeriodEnd,
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
      stripe_price_id: stripePriceId,
      quantity,
      updated_at: new Date().toISOString(),
    },
    responseSubscription: {
      status: stripeSubscription.status,
      stripe_price_id: stripePriceId,
      quantity,
      current_period_end: stripePeriodEnd,
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
    },
  };
}

async function upsertStripeSubscriptionRow(
  organizationId: string,
  stripeSubscription: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>,
) {
  const derived = buildStripeDerivedSubscription(organizationId, stripeSubscription);
  const { error: upsertError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(derived.row, { onConflict: 'organization_id' });

  console.log('[billing:status] selfHealUpsert', {
    orgId: organizationId,
    stripeSubscriptionId: stripeSubscription.id,
    stripeStatus: derived.status,
    stripePeriodEnd: derived.periodEnd,
    success: !upsertError,
  });

  if (upsertError) {
    console.error('[billing:status] self-heal upsert failed', {
      organizationId,
      stripeSubscriptionId: stripeSubscription.id,
      error: upsertError.message,
    });
  }

  return derived;
}

function inactiveNoneResponse() {
  return {
    billingEnabled: true,
    active: false,
    status: 'none',
    current_period_end: null,
    subscription: null,
  };
}

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId query param is required.' }, { status: 400 });
  }

  // If billing is disabled, always return active
  if (!BILLING_ENABLED) {
    return NextResponse.json({
      billingEnabled: false,
      status: 'active',
      subscription: null,
    });
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

  // Verify user is a member of this org
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!membership) {
    return applySupabaseCookies(
      jsonError('Not a member of this organization.', 403),
      response,
    );
  }

  const { data: sub, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'organization_id, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, stripe_price_id, quantity',
    )
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (subError) {
    console.error('[billing:status] subscription lookup failed:', subError.message);
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to check subscription.' }, { status: 500 }),
      response,
    );
  }

  const dbStatus = sub?.status ?? 'none';
  const dbPeriodEnd = sub?.current_period_end ?? null;
  const dbIsActive = (dbStatus === 'active' || dbStatus === 'trialing') && Boolean(dbPeriodEnd);

  if (sub && dbIsActive) {
    console.log('[billing:status] returning healthy DB subscription', {
      organizationId,
      dbStatus,
      dbPeriodEnd,
      stripeStatus: null,
      stripePeriodEnd: null,
      selfHealUpdate: false,
    });
    return applySupabaseCookies(
      NextResponse.json({
        billingEnabled: true,
        active: true,
        status: dbStatus,
        current_period_end: dbPeriodEnd,
        subscription: sub,
      }),
      response,
    );
  }

  // Fallback path: no row OR row without stripe_subscription_id.
  if (!sub || !sub.stripe_subscription_id) {
    const escapedOrganizationId = organizationId.replace(/'/g, "\\'");
    try {
      const searchResult = await stripe.subscriptions.search({
        query: `metadata['organization_id']:'${escapedOrganizationId}'`,
        limit: 1,
      });
      const foundSubscription = searchResult.data[0] ?? null;

      console.log('[billing:status] stripeSearch', {
        orgId: organizationId,
        found: Boolean(foundSubscription),
        stripeSubscriptionId: foundSubscription?.id ?? null,
      });

      if (!foundSubscription) {
        return applySupabaseCookies(
          NextResponse.json(inactiveNoneResponse()),
          response,
        );
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(foundSubscription.id);
      const healed = await upsertStripeSubscriptionRow(organizationId, stripeSubscription);
      const active = healed.status === 'active' || healed.status === 'trialing';

      return applySupabaseCookies(
        NextResponse.json({
          billingEnabled: true,
          active,
          status: healed.status,
          current_period_end: healed.periodEnd,
          subscription: healed.responseSubscription,
        }),
        response,
      );
    } catch (stripeSearchError) {
      const message = stripeSearchError instanceof Error ? stripeSearchError.message : String(stripeSearchError);
      console.error('[billing:status] stripe search fallback failed; returning inactive', {
        organizationId,
        error: message,
      });
      return applySupabaseCookies(
        NextResponse.json(inactiveNoneResponse()),
        response,
      );
    }
  }

  let stripeStatus: string | null = null;
  let stripePeriodEnd: string | null = null;
  let selfHealUpdate = false;

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const healed = await upsertStripeSubscriptionRow(organizationId, stripeSubscription);
    stripeStatus = healed.status;
    stripePeriodEnd = healed.periodEnd;
    selfHealUpdate = true;

    console.log('[billing:status] stripe self-heal result', {
      organizationId,
      dbStatus,
      dbPeriodEnd,
      stripeStatus,
      stripePeriodEnd,
      selfHealUpdate,
    });

    const active = stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing';
    return applySupabaseCookies(
      NextResponse.json({
        billingEnabled: true,
        active,
        status: healed.status,
        current_period_end: stripePeriodEnd,
        subscription: healed.responseSubscription,
      }),
      response,
    );
  } catch (stripeError) {
    const message = stripeError instanceof Error ? stripeError.message : String(stripeError);
    console.error('[billing:status] stripe self-heal failed; returning DB state', {
      organizationId,
      dbStatus,
      dbPeriodEnd,
      stripeStatus: null,
      stripePeriodEnd: null,
      selfHealUpdate: false,
      error: message,
    });

    return applySupabaseCookies(
      NextResponse.json({
        billingEnabled: true,
        active: false,
        status: dbStatus,
        current_period_end: dbPeriodEnd,
        subscription: sub,
      }),
      response,
    );
  }
}
