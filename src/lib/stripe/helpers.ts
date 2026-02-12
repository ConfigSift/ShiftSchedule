import { stripe } from './server';
import { BILLING_ENABLED } from './config';
import { supabaseAdmin } from '../supabase/admin';

/**
 * Find or create a Stripe Customer for the given auth user.
 * Stores the mapping in the `stripe_customers` table.
 */
export async function getOrCreateStripeCustomer(
  authUserId: string,
  email: string,
  name?: string,
): Promise<string> {
  // Check for existing mapping
  const { data: existing } = await supabaseAdmin
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  // Create customer in Stripe
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { auth_user_id: authUserId },
  });

  // Store mapping
  await supabaseAdmin.from('stripe_customers').insert({
    auth_user_id: authUserId,
    stripe_customer_id: customer.id,
  });

  return customer.id;
}

/**
 * Fetch the subscription row for an organization.
 * Returns null if no subscription exists.
 */
export async function getOrgSubscription(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('[stripe:helpers] getOrgSubscription error', error.message);
    return null;
  }

  return data;
}

/** Subscription statuses that grant app access */
const ACTIVE_STATUSES = ['active', 'past_due', 'trialing'];

/**
 * Check whether an organization has an active subscription.
 *
 * Returns `true` (bypass) when billing is disabled via
 * NEXT_PUBLIC_BILLING_ENABLED=false so the app is fully
 * usable during development and before launch.
 */
export async function isSubscriptionActive(organizationId: string): Promise<boolean> {
  if (!BILLING_ENABLED) {
    return true;
  }

  const sub = await getOrgSubscription(organizationId);
  if (!sub) return false;

  return ACTIVE_STATUSES.includes(sub.status);
}

/**
 * Count locations for an organization (minimum 1 for billing purposes).
 */
export async function getLocationCount(organizationId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (error) {
    console.error('[stripe:helpers] getLocationCount error', error.message);
    return 1;
  }

  return Math.max(1, count ?? 1);
}
