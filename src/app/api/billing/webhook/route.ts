import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/server';
import { STRIPE_WEBHOOK_SECRET } from '@/lib/stripe/config';
import {
  resolveAuthUserIdFromStripeCustomer,
  upsertBillingAccountFromSubscription,
} from '@/lib/billing/customer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL.');
  }
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function toIsoFromUnixTimestamp(unixSeconds: number | null | undefined) {
  if (typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function getSubscriptionId(value: string | Stripe.Subscription | null) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function getSubscriptionCustomerId(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) {
    throw new Error(`Missing customer on subscription ${subscription.id}`);
  }

  return customerId;
}

async function resolveAuthUserIdForSubscription(
  supabaseAdminClient: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
) {
  const metadataAuthUserId = String(subscription.metadata?.auth_user_id ?? '').trim();
  if (metadataAuthUserId) {
    return metadataAuthUserId;
  }

  const stripeCustomerId = getSubscriptionCustomerId(subscription);
  const mappedAuthUserId = await resolveAuthUserIdFromStripeCustomer(
    stripeCustomerId,
    supabaseAdminClient,
  );
  if (mappedAuthUserId) {
    return mappedAuthUserId;
  }

  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (!('deleted' in customer) || !customer.deleted) {
      const customerAuthUserId = String(customer.metadata?.auth_user_id ?? '').trim();
      if (customerAuthUserId) {
        await supabaseAdminClient
          .from('stripe_customers')
          .upsert(
            {
              auth_user_id: customerAuthUserId,
              stripe_customer_id: stripeCustomerId,
            },
            { onConflict: 'auth_user_id' },
          );
        return customerAuthUserId;
      }
    }
  } catch {
    // ignore customer lookup failures in webhook path
  }

  return null;
}

async function upsertBillingAccountRow(
  supabaseAdminClient: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
  sourceEvent: string,
  eventId: string,
) {
  const authUserId = await resolveAuthUserIdForSubscription(supabaseAdminClient, subscription);
  if (!authUserId) {
    console.warn('[billing:webhook] missing auth_user_id for billing account upsert', {
      eventId,
      eventType: sourceEvent,
      sourceEvent,
      subscriptionId: subscription.id,
      customer: subscription.customer,
    });
    return;
  }

  const { error } = await upsertBillingAccountFromSubscription(
    authUserId,
    subscription,
    supabaseAdminClient,
  );
  if (error) {
    const missingBillingAccountsTable =
      String(error.code ?? '').toUpperCase() === 'PGRST205' ||
      String(error.message ?? '').toLowerCase().includes('could not find the table');
    if (missingBillingAccountsTable) {
      console.warn('[billing:webhook] billing_accounts table missing, skipping customer upsert', {
        eventId,
        eventType: sourceEvent,
        sourceEvent,
        authUserId,
        subscriptionId: subscription.id,
      });
      return;
    }

    console.error('[billing:webhook] billing_accounts upsert failed', {
      eventId,
      eventType: sourceEvent,
      sourceEvent,
      authUserId,
      subscriptionId: subscription.id,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
}

async function upsertSubscriptionRow(
  supabaseAdminClient: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
  organizationId: string,
  sourceEvent: string,
  eventId: string,
) {
  const customerId = getSubscriptionCustomerId(subscription);
  const priceId = subscription.items.data[0]?.price?.id ?? '';
  const quantity = subscription.items.data[0]?.quantity ?? 1;
  const currentPeriodStart = toIsoFromUnixTimestamp(subscription.current_period_start);
  const currentPeriodEnd = toIsoFromUnixTimestamp(subscription.current_period_end);

  const upsertPayload = {
    organization_id: organizationId,
    status: subscription.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
    stripe_price_id: priceId,
    quantity,
    current_period_start: currentPeriodStart,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };

  console.log('[billing:webhook] upserting subscription row', {
    eventId,
    eventType: sourceEvent,
    sourceEvent,
    organizationId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    status: subscription.status,
    currentPeriodEnd,
    quantity,
    priceId,
  });

  const { error } = await supabaseAdminClient
    .from('subscriptions')
    .upsert(upsertPayload, { onConflict: 'organization_id' });

  if (error) {
    const isMissingOrgFk =
      error.code === '23503' &&
      String(error.message ?? '').toLowerCase().includes('foreign key');
    const isMissingOrgMessage =
      String(error.message ?? '').toLowerCase().includes('organization') &&
      String(error.message ?? '').toLowerCase().includes('not present');

    if (isMissingOrgFk || isMissingOrgMessage) {
      console.warn('[billing:webhook] ignoring subscription upsert for deleted organization', {
        eventId,
        eventType: sourceEvent,
        sourceEvent,
        organizationId,
        stripeSubscriptionId: subscription.id,
        supabaseError: {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
      });
      return { ignoredMissingOrganization: true };
    }

    console.error('[billing:webhook] subscriptions upsert failed', {
      eventId,
      eventType: sourceEvent,
      sourceEvent,
      organizationId,
      stripeSubscriptionId: subscription.id,
      supabaseError: {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      },
    });
    throw error;
  }

  return { ignoredMissingOrganization: false };
}

/**
 * Stripe webhook handler.
 * Uses request.text() for raw body access (required for signature verification).
 */
export async function POST(request: NextRequest) {
  console.log('[billing:webhook] env presence', {
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_SERVICE_ROLE: Boolean(process.env.SUPABASE_SERVICE_ROLE),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  });

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[billing:webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[billing:webhook] Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[billing:webhook] Signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  console.log('[billing:webhook] received event', {
    eventId: event.id,
    eventType: event.type,
  });

  try {
    const supabaseAdminClient = getSupabaseAdminClient();

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
          supabaseAdminClient,
        );
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreatedOrUpdated(
          event.data.object as Stripe.Subscription,
          'customer.subscription.created',
          event.id,
          supabaseAdminClient,
        );
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionCreatedOrUpdated(
          event.data.object as Stripe.Subscription,
          'customer.subscription.updated',
          event.id,
          supabaseAdminClient,
        );
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          supabaseAdminClient,
        );
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, supabaseAdminClient);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          supabaseAdminClient,
        );
        break;

      default:
        console.log('[billing:webhook] unhandled event type, acknowledging', {
          eventId: event.id,
          eventType: event.type,
        });
        break;
    }
  } catch (err) {
    console.error(`[billing:webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  supabaseAdminClient: ReturnType<typeof createClient>,
) {
  console.log('[billing:webhook] checkout.session.completed payload', {
    eventId,
    eventType: 'checkout.session.completed',
    sessionId: session.id,
    subscription: session.subscription,
    customer: session.customer,
    metadata: session.metadata ?? null,
    mode: session.mode,
  });

  if (session.mode !== 'subscription') return;

  const subscriptionId = getSubscriptionId(session.subscription);

  if (!subscriptionId) {
    throw new Error('checkout.session.completed missing subscription ID');
  }

  // Always pull the full, current subscription object before DB writes.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertBillingAccountRow(
    supabaseAdminClient,
    subscription,
    'checkout.session.completed',
    eventId,
  );

  let organizationId = subscription.metadata?.organization_id ?? null;
  if (!organizationId) {
    organizationId = session.metadata?.organization_id ?? null;
  }

  if (!organizationId) {
    console.warn(
      '[billing:webhook] checkout.session.completed missing organization_id in subscription metadata, falling back to session metadata',
      { eventId, subscriptionId },
    );
  }

  if (!organizationId) {
    console.log('[billing:webhook] checkout.session.completed has no organization metadata, billing account only', {
      eventId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
    return;
  }

  console.log('[billing:webhook] checkout subscription details', {
    eventId,
    eventType: 'checkout.session.completed',
    organizationId,
    subscriptionId: subscription.id,
    customer: subscription.customer,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    metadata: subscription.metadata ?? null,
  });

  const upsertResult = await upsertSubscriptionRow(
    supabaseAdminClient,
    subscription,
    organizationId,
    'checkout.session.completed',
    eventId,
  );

  if (upsertResult.ignoredMissingOrganization) {
    console.log('[billing:webhook] write skipped (organization missing)', {
      eventId,
      eventType: 'checkout.session.completed',
      organizationId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } else {
    console.log('[billing:webhook] write success', {
      eventId,
      eventType: 'checkout.session.completed',
      organizationId,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
    });
  }
}

async function handleSubscriptionCreatedOrUpdated(
  eventSubscription: Stripe.Subscription,
  sourceEvent: 'customer.subscription.created' | 'customer.subscription.updated',
  eventId: string,
  supabaseAdminClient: ReturnType<typeof createClient>,
) {
  const subscriptionId = getSubscriptionId(eventSubscription);
  if (!subscriptionId) {
    throw new Error(`Missing subscription ID in ${sourceEvent}`);
  }

  // Always pull the full, current subscription object before DB writes.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertBillingAccountRow(
    supabaseAdminClient,
    subscription,
    sourceEvent,
    eventId,
  );

  const organizationId = subscription.metadata?.organization_id ?? null;
  if (!organizationId) {
    console.log('[billing:webhook] subscription event without organization metadata, billing account only', {
      eventId,
      eventType: sourceEvent,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
    return;
  }

  console.log('[billing:webhook] customer.subscription retrieved', {
    eventId,
    eventType: sourceEvent,
    organizationId,
    subscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    customer: subscription.customer,
  });

  const upsertResult = await upsertSubscriptionRow(
    supabaseAdminClient,
    subscription,
    organizationId,
    sourceEvent,
    eventId,
  );

  if (upsertResult.ignoredMissingOrganization) {
    console.log('[billing:webhook] write skipped (organization missing)', {
      eventId,
      eventType: sourceEvent,
      organizationId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } else {
    console.log('[billing:webhook] write success', {
      eventId,
      eventType: sourceEvent,
      organizationId,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
    });
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabaseAdminClient: ReturnType<typeof createClient>,
) {
  await upsertBillingAccountRow(
    supabaseAdminClient,
    subscription,
    'customer.subscription.deleted',
    `customer.subscription.deleted:${subscription.id}`,
  );

  const { error } = await supabaseAdminClient
    .from('subscriptions')
    .update({
      status: 'canceled',
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    console.error('[billing:webhook] subscription.deleted DB update failed:', error.message);
    throw error;
  }

  const { error: billingAccountError } = await supabaseAdminClient
    .from('billing_accounts')
    .update({
      status: 'canceled',
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (billingAccountError) {
    console.error('[billing:webhook] subscription.deleted billing_accounts update failed:', billingAccountError.message);
    throw billingAccountError;
  }

  console.log(`[billing:webhook] Subscription canceled: ${subscription.id}`);
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  supabaseAdminClient: ReturnType<typeof createClient>,
) {
  const subscriptionId = getSubscriptionId(invoice.subscription);

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertBillingAccountRow(
    supabaseAdminClient,
    subscription,
    'invoice.paid',
    `invoice.paid:${invoice.id}`,
  );

  const organizationId = subscription.metadata?.organization_id ?? null;
  if (!organizationId) {
    console.log('[billing:webhook] invoice.paid without organization metadata, billing account only', {
      invoiceId: invoice.id,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
    return;
  }

  const upsertResult = await upsertSubscriptionRow(
    supabaseAdminClient,
    subscription,
    organizationId,
    'invoice.paid',
    `invoice.paid:${invoice.id}`,
  );

  if (upsertResult.ignoredMissingOrganization) {
    console.log('[billing:webhook] invoice.paid skipped (organization missing)', {
      organizationId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } else {
    console.log('[billing:webhook] invoice.paid upserted subscription', {
      organizationId,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
    });
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabaseAdminClient: ReturnType<typeof createClient>,
) {
  const subscriptionId = getSubscriptionId(invoice.subscription);

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertBillingAccountRow(
    supabaseAdminClient,
    subscription,
    'invoice.payment_failed',
    `invoice.payment_failed:${invoice.id}`,
  );

  const { error } = await supabaseAdminClient
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    console.error('[billing:webhook] invoice.payment_failed DB update failed:', error.message);
    throw error;
  }

  const { error: billingAccountError } = await supabaseAdminClient
    .from('billing_accounts')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (billingAccountError) {
    console.error('[billing:webhook] invoice.payment_failed billing_accounts update failed:', billingAccountError.message);
    throw billingAccountError;
  }

  console.error(
    `[billing:webhook] Payment failed - subscription ${subscriptionId} marked past_due`,
  );
}
