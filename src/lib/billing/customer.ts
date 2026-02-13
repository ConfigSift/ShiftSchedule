import type Stripe from 'stripe';
import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/server';

export const ACTIVE_BILLING_STATUSES = new Set(['active', 'trialing']);
export const OWNED_MEMBERSHIP_ROLES = new Set(['admin', 'owner']);

type BillingAccountRow = {
  auth_user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  stripe_price_id: string | null;
  status: string;
  quantity: number;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  updated_at: string;
};

function normalizeRole(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function toIsoFromUnixTimestamp(unixSeconds: number | null | undefined) {
  if (typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

export function isActiveBillingStatus(status: string | null | undefined) {
  return ACTIVE_BILLING_STATUSES.has(String(status ?? '').trim().toLowerCase());
}

export function isMissingTableError(error: PostgrestError | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '').toUpperCase();
  return code === 'PGRST205' || message.includes('could not find the table');
}

export async function getOwnedOrganizationIds(
  authUserId: string,
  supabaseClient: SupabaseClient = supabaseAdmin,
) {
  const { data, error } = await supabaseClient
    .from('organization_memberships')
    .select('organization_id,role')
    .eq('auth_user_id', authUserId);

  if (error) {
    return { ids: [] as string[], error };
  }

  const ownedIds = Array.from(
    new Set(
      (data ?? [])
        .filter((row) => OWNED_MEMBERSHIP_ROLES.has(normalizeRole((row as { role?: unknown }).role)))
        .map((row) => String((row as { organization_id?: unknown }).organization_id ?? '').trim())
        .filter(Boolean),
    ),
  );

  return { ids: ownedIds, error: null as PostgrestError | null };
}

export async function getOwnedOrganizationCount(
  authUserId: string,
  supabaseClient: SupabaseClient = supabaseAdmin,
) {
  const result = await getOwnedOrganizationIds(authUserId, supabaseClient);
  return { count: result.ids.length, ids: result.ids, error: result.error };
}

export async function getBillingAccountByAuthUserId(
  authUserId: string,
  supabaseClient: SupabaseClient = supabaseAdmin,
) {
  const { data, error } = await supabaseClient
    .from('billing_accounts')
    .select(
      'auth_user_id,stripe_customer_id,stripe_subscription_id,stripe_subscription_item_id,stripe_price_id,status,quantity,cancel_at_period_end,current_period_end,updated_at',
    )
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error && isMissingTableError(error)) {
    return { data: null as BillingAccountRow | null, error: null as PostgrestError | null };
  }

  return {
    data: (data as BillingAccountRow | null) ?? null,
    error: error ?? null,
  };
}

export async function resolveAuthUserIdFromStripeCustomer(
  stripeCustomerId: string,
  supabaseClient: SupabaseClient = supabaseAdmin,
) {
  const normalized = String(stripeCustomerId ?? '').trim();
  if (!normalized) return null;

  const { data } = await supabaseClient
    .from('stripe_customers')
    .select('auth_user_id')
    .eq('stripe_customer_id', normalized)
    .maybeSingle();

  return String(data?.auth_user_id ?? '').trim() || null;
}

export async function getStripeCustomerIdForAuthUser(
  authUserId: string,
  supabaseClient: SupabaseClient = supabaseAdmin,
) {
  const billingAccountResult = await getBillingAccountByAuthUserId(authUserId, supabaseClient);
  if (billingAccountResult.data?.stripe_customer_id) {
    return billingAccountResult.data.stripe_customer_id;
  }

  const { data } = await supabaseClient
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  return String(data?.stripe_customer_id ?? '').trim() || null;
}

export async function upsertBillingAccountFromSubscription(
  authUserId: string,
  subscription: Stripe.Subscription,
  supabaseClient: SupabaseClient = supabaseAdmin,
) {
  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? '';
  const stripeSubscriptionItemId = subscription.items.data[0]?.id ?? null;
  const stripePriceId = subscription.items.data[0]?.price?.id ?? null;
  const quantity = subscription.items.data[0]?.quantity ?? 1;
  const currentPeriodEnd = toIsoFromUnixTimestamp(subscription.current_period_end);

  const payload = {
    auth_user_id: authUserId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription.id,
    stripe_subscription_item_id: stripeSubscriptionItemId,
    stripe_price_id: stripePriceId,
    status: subscription.status,
    quantity,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient
    .from('billing_accounts')
    .upsert(payload, { onConflict: 'auth_user_id' });

  return { payload, error };
}

export async function refreshBillingAccountFromStripe(
  authUserId: string,
  supabaseClient: SupabaseClient = supabaseAdmin,
) {
  const billingResult = await getBillingAccountByAuthUserId(authUserId, supabaseClient);
  if (!billingResult.data || !billingResult.data.stripe_subscription_id) {
    return billingResult;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(
      billingResult.data.stripe_subscription_id,
    );
    const { error } = await upsertBillingAccountFromSubscription(
      authUserId,
      subscription,
      supabaseClient,
    );
    if (error) {
      return billingResult;
    }
    return getBillingAccountByAuthUserId(authUserId, supabaseClient);
  } catch {
    return billingResult;
  }
}
