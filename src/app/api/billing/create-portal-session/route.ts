import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { stripe } from '@/lib/stripe/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PortalPayload = {
  organizationId?: string;
};

export async function POST(request: NextRequest) {
  let payload: PortalPayload;
  try {
    payload = (await request.json()) as PortalPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const organizationId = payload.organizationId?.trim();

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
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

  // Look up billing state for this organization.
  const { data: subscriptionRow, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'organization_id, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end',
    )
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (subscriptionError) {
    console.error('[billing:portal] failed to load subscription row', {
      organizationId,
      error: subscriptionError.message,
    });
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to load billing account.' }, { status: 500 }),
      response,
    );
  }

  const rowPresent = Boolean(subscriptionRow);
  const stripeSubscriptionId = subscriptionRow?.stripe_subscription_id ?? null;
  let stripeCustomerId = subscriptionRow?.stripe_customer_id ?? null;
  let selfHealRan = false;

  console.log('[billing:portal] subscription lookup', {
    organizationId,
    rowPresent,
    stripeSubscriptionId,
    stripeCustomerId,
  });

  if (!stripeCustomerId && !stripeSubscriptionId) {
    return applySupabaseCookies(
      NextResponse.json(
        {
          error:
            'No Stripe billing identifiers found for this organization. Please complete checkout first.',
        },
        { status: 400 },
      ),
      response,
    );
  }

  if (!stripeCustomerId && stripeSubscriptionId) {
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const customerId =
      typeof stripeSubscription.customer === 'string'
        ? stripeSubscription.customer
        : stripeSubscription.customer?.id ?? null;

    if (!customerId) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Stripe subscription is missing a customer id.' },
          { status: 400 },
        ),
        response,
      );
    }

    const currentPeriodStart =
      typeof stripeSubscription.current_period_start === 'number'
        ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
        : null;
    const currentPeriodEnd =
      typeof stripeSubscription.current_period_end === 'number'
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : null;

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        stripe_customer_id: customerId,
        status: stripeSubscription.status,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId);

    if (updateError) {
      console.error('[billing:portal] self-heal DB update failed', {
        organizationId,
        stripeSubscriptionId,
        customerId,
        error: updateError.message,
      });
      return applySupabaseCookies(
        NextResponse.json({ error: 'Failed to update billing account.' }, { status: 500 }),
        response,
      );
    }

    stripeCustomerId = customerId;
    selfHealRan = true;
  }

  if (!stripeCustomerId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to resolve Stripe customer id.' }, { status: 400 }),
      response,
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    console.log('[billing:portal] portal session created', {
      organizationId,
      rowPresent,
      selfHealRan,
      stripeSubscriptionId,
      stripeCustomerId,
      portalSessionId: portalSession.id,
    });

    return applySupabaseCookies(
      NextResponse.json({ url: portalSession.url }),
      response,
    );
  } catch (err) {
    console.error('[billing:portal] Stripe portal session creation failed', err);
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to create billing portal session.' }, { status: 500 }),
      response,
    );
  }
}
