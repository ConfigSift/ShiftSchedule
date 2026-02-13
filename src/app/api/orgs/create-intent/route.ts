import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  getOwnedOrganizationCount,
  isActiveBillingStatus,
  OWNED_MEMBERSHIP_ROLES,
  refreshBillingAccountFromStripe,
} from '@/lib/billing/customer';
import { BILLING_ENABLED } from '@/lib/stripe/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreateIntentPayload = {
  restaurantName?: string;
  locationName?: string;
  timezone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export async function POST(request: NextRequest) {
  let payload: CreateIntentPayload;
  try {
    payload = (await request.json()) as CreateIntentPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const restaurantName = String(payload.restaurantName ?? '').trim();
  if (!restaurantName) {
    return NextResponse.json({ error: 'restaurantName is required.' }, { status: 400 });
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

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId);

  if (membershipError) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to verify memberships.' }, { status: 500 }),
      response,
    );
  }

  const membershipCount = memberships?.length ?? 0;
  const ownedMembershipCount = (memberships ?? []).filter((row) =>
    OWNED_MEMBERSHIP_ROLES.has(String(row.role ?? '').trim().toLowerCase()),
  ).length;

  if (membershipCount > 0 && ownedMembershipCount === 0) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Only admins can create restaurants.' }, { status: 403 }),
      response,
    );
  }

  const cleanupBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from('organization_create_intents')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
      last_error: { reason: 'expired_pending_intent_cleanup' },
    })
    .eq('auth_user_id', authUserId)
    .eq('status', 'pending')
    .lt('created_at', cleanupBefore);

  const ownedCountResult = await getOwnedOrganizationCount(authUserId, supabaseAdmin);
  if (ownedCountResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to count owned organizations.' }, { status: 500 }),
      response,
    );
  }

  const ownedOrgCount = ownedCountResult.count;
  const desiredQuantity = Math.max(1, ownedOrgCount + 1);

  const billingAccountResult = await refreshBillingAccountFromStripe(authUserId, supabaseAdmin);
  if (billingAccountResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to check billing account.' }, { status: 500 }),
      response,
    );
  }

  const billingAccount = billingAccountResult.data;
  const hasActiveSubscription = isActiveBillingStatus(billingAccount?.status);
  const currentQuantity = Math.max(0, Number(billingAccount?.quantity ?? 0));
  const needsUpgrade =
    BILLING_ENABLED &&
    (!hasActiveSubscription || currentQuantity < desiredQuantity);

  const { data: insertedIntent, error: insertError } = await supabaseAdmin
    .from('organization_create_intents')
    .insert({
      auth_user_id: authUserId,
      restaurant_name: restaurantName,
      location_name: String(payload.locationName ?? '').trim() || null,
      timezone: String(payload.timezone ?? '').trim() || null,
      address: String(payload.address ?? '').trim() || null,
      city: String(payload.city ?? '').trim() || null,
      state: String(payload.state ?? '').trim() || null,
      zip: String(payload.zip ?? '').trim() || null,
      status: 'pending',
      desired_quantity: desiredQuantity,
      updated_at: new Date().toISOString(),
    })
    .select('id,desired_quantity')
    .single();

  if (insertError || !insertedIntent) {
    return applySupabaseCookies(
      NextResponse.json({ error: insertError?.message ?? 'Unable to create intent.' }, { status: 500 }),
      response,
    );
  }

  return applySupabaseCookies(
    NextResponse.json({
      intentId: insertedIntent.id,
      desiredQuantity: insertedIntent.desired_quantity,
      ownedOrgCount,
      billingEnabled: BILLING_ENABLED,
      hasActiveSubscription,
      needsUpgrade,
    }),
    response,
  );
}
