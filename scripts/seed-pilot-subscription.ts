/**
 * One-time pilot migration script.
 *
 * Creates a subscriptions row for an existing organization so that
 * flipping NEXT_PUBLIC_BILLING_ENABLED=true doesn't lock them out.
 *
 * Usage:
 *   npx tsx scripts/seed-pilot-subscription.ts
 *
 * Environment:
 *   Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env / .env.local.
 *   Optionally set these env vars to override defaults:
 *     PILOT_ORG_NAME        — organization name to find (default: search for first org)
 *     PILOT_ORG_ID          — organization UUID (skips name lookup if provided)
 *     PILOT_STRIPE_CUSTOMER — real Stripe customer ID (default: pilot_cus_placeholder)
 *     PILOT_STRIPE_SUB      — real Stripe subscription ID (default: pilot_sub_placeholder)
 */

import { supabaseAdmin } from '../src/lib/supabase/admin';

async function main() {
  const orgId = process.env.PILOT_ORG_ID ?? null;
  const orgName = process.env.PILOT_ORG_NAME ?? null;

  let organizationId: string;

  if (orgId) {
    // Use provided org ID directly
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single();

    if (error || !data) {
      console.error('Organization not found with ID:', orgId, error?.message);
      process.exit(1);
    }
    organizationId = data.id;
    console.log(`Found organization: "${data.name}" (${data.id})`);
  } else if (orgName) {
    // Find by name
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .ilike('name', orgName)
      .single();

    if (error || !data) {
      console.error('Organization not found with name:', orgName, error?.message);
      process.exit(1);
    }
    organizationId = data.id;
    console.log(`Found organization: "${data.name}" (${data.id})`);
  } else {
    // Fall back to the first org in the database
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      console.error('No organizations found in database.', error?.message);
      process.exit(1);
    }
    organizationId = data.id;
    console.log(`Using first organization: "${data.name}" (${data.id})`);
  }

  // Find the admin user for this org
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('auth_user_id')
    .eq('organization_id', organizationId)
    .eq('role', 'admin')
    .limit(1)
    .single();

  if (membershipError || !membership) {
    console.error('No admin membership found for org:', organizationId, membershipError?.message);
    process.exit(1);
  }

  const authUserId = membership.auth_user_id;
  console.log(`Admin auth_user_id: ${authUserId}`);

  const stripeCustomerId = process.env.PILOT_STRIPE_CUSTOMER ?? 'pilot_cus_placeholder';
  const stripeSubId = process.env.PILOT_STRIPE_SUB ?? 'pilot_sub_placeholder';

  // Upsert stripe_customers
  const { error: customerError } = await supabaseAdmin
    .from('stripe_customers')
    .upsert(
      {
        auth_user_id: authUserId,
        stripe_customer_id: stripeCustomerId,
      },
      { onConflict: 'auth_user_id' },
    );

  if (customerError) {
    console.error('Failed to upsert stripe_customers:', customerError.message);
    process.exit(1);
  }
  console.log(`stripe_customers row created (customer: ${stripeCustomerId})`);

  // Upsert subscriptions
  const farFuture = '2030-01-01T00:00:00Z';
  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        organization_id: organizationId,
        stripe_subscription_id: stripeSubId,
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: 'pilot_price_placeholder',
        status: 'active',
        quantity: 1,
        current_period_start: new Date().toISOString(),
        current_period_end: farFuture,
        cancel_at_period_end: false,
      },
      { onConflict: 'organization_id' },
    );

  if (subError) {
    console.error('Failed to upsert subscription:', subError.message);
    process.exit(1);
  }

  console.log(`subscription row created (status: active, expires: ${farFuture})`);
  console.log('\nPilot subscription seeded successfully.');
  console.log('You can now set NEXT_PUBLIC_BILLING_ENABLED=true without locking out this org.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
