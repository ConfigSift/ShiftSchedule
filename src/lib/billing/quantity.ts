import type Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import { stripe } from '@/lib/stripe/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  getBillingAccountByAuthUserId,
  getOwnedOrganizationCount,
  getStripeCustomerIdForAuthUser,
  toIsoFromUnixTimestamp,
  upsertBillingAccountFromSubscription,
} from '@/lib/billing/customer';

type SyncStripeQuantityInput = {
  authUserId: string;
  supabaseClient?: SupabaseClient;
};

export type SyncStripeQuantityResult = {
  ok: true;
  quantitySynced: boolean;
  changed: boolean;
  billingEnabled: boolean;
  ownedRestaurantCount: number;
  desiredQuantity: number;
  newQuantity: number | null;
  currentQuantity: number | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function pickSubscriptionCandidate(subscriptions: Stripe.Subscription[]) {
  if (subscriptions.length === 0) return null;
  const ranked = [...subscriptions].sort((a, b) => b.created - a.created);
  return (
    ranked.find((subscription) => {
      const status = normalizeStatus(subscription.status);
      return status === 'active' || status === 'trialing';
    }) ??
    ranked.find((subscription) => {
      const status = normalizeStatus(subscription.status);
      return (
        status === 'past_due' ||
        status === 'incomplete' ||
        status === 'incomplete_expired' ||
        status === 'unpaid'
      );
    }) ??
    ranked.find((subscription) => normalizeStatus(subscription.status) !== 'canceled') ??
    ranked[0]
  );
}

async function resolveCustomerSubscription(
  authUserId: string,
  supabaseClient: SupabaseClient,
) {
  const billingResult = await getBillingAccountByAuthUserId(authUserId, supabaseClient);
  if (billingResult.error) {
    throw new Error(billingResult.error.message);
  }

  let stripeCustomerId = String(billingResult.data?.stripe_customer_id ?? '').trim() || null;
  let stripeSubscriptionId =
    String(billingResult.data?.stripe_subscription_id ?? '').trim() || null;

  if (!stripeCustomerId) {
    stripeCustomerId = await getStripeCustomerIdForAuthUser(authUserId, supabaseClient);
  }

  if (!stripeCustomerId) {
    return {
      subscription: null as Stripe.Subscription | null,
      stripeCustomerId: null,
    };
  }

  let subscription: Stripe.Subscription | null = null;
  if (stripeSubscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ['items.data.price'],
      });
    } catch (error) {
      console.warn('[billing:quantity] failed to retrieve stored subscription', {
        authUserId,
        stripeSubscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!subscription) {
    const list = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    const candidate = pickSubscriptionCandidate(list.data);
    if (candidate) {
      stripeSubscriptionId = candidate.id;
      subscription = await stripe.subscriptions.retrieve(candidate.id, {
        expand: ['items.data.price'],
      });
    }
  }

  return {
    subscription,
    stripeCustomerId,
  };
}

async function upsertLegacySubscriptionRowsForOwnedOrganizations(
  organizationIds: string[],
  subscription: Stripe.Subscription,
  supabaseClient: SupabaseClient,
) {
  if (organizationIds.length === 0) return;

  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null;
  if (!stripeCustomerId) return;

  const quantity = subscription.items.data[0]?.quantity ?? 1;
  const now = new Date().toISOString();
  const payload = organizationIds.map((organizationId) => ({
    organization_id: organizationId,
    status: subscription.status,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription.id,
    current_period_start: toIsoFromUnixTimestamp(subscription.current_period_start),
    current_period_end: toIsoFromUnixTimestamp(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_price_id: subscription.items.data[0]?.price?.id ?? null,
    quantity,
    updated_at: now,
  }));

  const { error } = await supabaseClient
    .from('subscriptions')
    .upsert(payload, { onConflict: 'organization_id' });

  if (error) {
    console.warn('[billing:quantity] legacy subscriptions upsert failed', {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }
}

export async function syncStripeQuantityForCustomer(
  input: SyncStripeQuantityInput,
): Promise<SyncStripeQuantityResult> {
  const authUserId = String(input.authUserId ?? '').trim();
  const supabaseClient = input.supabaseClient ?? supabaseAdmin;
  if (!authUserId) {
    throw new Error('authUserId is required.');
  }

  const ownedCountResult = await getOwnedOrganizationCount(authUserId, supabaseClient);
  if (ownedCountResult.error) {
    throw new Error(ownedCountResult.error.message);
  }

  const ownedRestaurantCount = ownedCountResult.count;
  const desiredQuantity = Math.max(1, ownedRestaurantCount);
  const defaultResult: SyncStripeQuantityResult = {
    ok: true,
    quantitySynced: true,
    changed: false,
    billingEnabled: BILLING_ENABLED,
    ownedRestaurantCount,
    desiredQuantity,
    newQuantity: null,
    currentQuantity: null,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
  };

  if (!BILLING_ENABLED) {
    return defaultResult;
  }

  const { subscription, stripeCustomerId } = await resolveCustomerSubscription(
    authUserId,
    supabaseClient,
  );

  if (!subscription) {
    return {
      ...defaultResult,
      stripeCustomerId,
    };
  }

  const currentQuantity = Math.max(1, Number(subscription.items.data[0]?.quantity ?? 1));
  const subscriptionItemId = String(subscription.items.data[0]?.id ?? '').trim() || null;
  let effectiveSubscription = subscription;
  let changed = false;

  if (desiredQuantity < currentQuantity && subscriptionItemId) {
    effectiveSubscription = await stripe.subscriptions.update(subscription.id, {
      items: [{ id: subscriptionItemId, quantity: desiredQuantity }],
      proration_behavior: 'none',
      expand: ['items.data.price'],
    });
    changed = true;
  }

  const billingUpsertResult = await upsertBillingAccountFromSubscription(
    authUserId,
    effectiveSubscription,
    supabaseClient,
  );
  if (billingUpsertResult.error) {
    throw new Error(billingUpsertResult.error.message);
  }
  await upsertLegacySubscriptionRowsForOwnedOrganizations(
    ownedCountResult.ids,
    effectiveSubscription,
    supabaseClient,
  );

  return {
    ok: true,
    quantitySynced: true,
    changed,
    billingEnabled: true,
    ownedRestaurantCount,
    desiredQuantity,
    newQuantity: Math.max(1, Number(effectiveSubscription.items.data[0]?.quantity ?? desiredQuantity)),
    currentQuantity,
    stripeSubscriptionId: effectiveSubscription.id,
    stripeCustomerId:
      typeof effectiveSubscription.customer === 'string'
        ? effectiveSubscription.customer
        : effectiveSubscription.customer?.id ?? stripeCustomerId,
  };
}
