import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import {
  getOwnedOrganizationCount,
  isActiveBillingStatus,
  refreshBillingAccountFromStripe,
} from '@/lib/billing/customer';
import { generateRestaurantCode } from '@/utils/restaurantCode';
import { splitFullName } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CommitIntentPayload = {
  intentId?: string;
};

type CreateIntentRow = {
  id: string;
  status: string;
  organization_id: string | null;
  restaurant_name: string;
  location_name: string | null;
  desired_quantity: number;
};

function canFallbackLegacyUser(errorMessage: string) {
  const lowered = errorMessage.toLowerCase();
  return lowered.includes('full_name');
}

export async function POST(request: NextRequest) {
  let payload: CommitIntentPayload;
  try {
    payload = (await request.json()) as CommitIntentPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const intentId = String(payload.intentId ?? '').trim();
  if (!intentId) {
    return NextResponse.json({ error: 'intentId is required.' }, { status: 400 });
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
    .lt('created_at', cleanupBefore)
    .neq('id', intentId);

  const { data: intent, error: intentError } = await supabaseAdmin
    .from('organization_create_intents')
    .select('id,status,organization_id,restaurant_name,location_name,desired_quantity')
    .eq('id', intentId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (intentError) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to load intent.' }, { status: 500 }),
      response,
    );
  }

  const typedIntent = (intent as CreateIntentRow | null) ?? null;
  if (!typedIntent) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Intent not found.' }, { status: 404 }),
      response,
    );
  }

  if (typedIntent.organization_id) {
    if (typedIntent.status !== 'completed') {
      await supabaseAdmin
        .from('organization_create_intents')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', typedIntent.id);
    }
    return applySupabaseCookies(
      NextResponse.json({ ok: true, organizationId: typedIntent.organization_id }),
      response,
    );
  }

  if (typedIntent.status !== 'pending') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Intent is not pending.' }, { status: 409 }),
      response,
    );
  }

  const ownedResult = await getOwnedOrganizationCount(authUserId, supabaseAdmin);
  if (ownedResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to verify organization count.' }, { status: 500 }),
      response,
    );
  }

  if (BILLING_ENABLED) {
    const billingResult = await refreshBillingAccountFromStripe(authUserId, supabaseAdmin);
    if (billingResult.error) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unable to check billing account.' }, { status: 500 }),
        response,
      );
    }

    const billing = billingResult.data;
    const active = isActiveBillingStatus(billing?.status);
    const requiredQuantity = Math.max(
      Number(typedIntent.desired_quantity ?? 1),
      ownedResult.count + 1,
    );
    const quantity = Math.max(0, Number(billing?.quantity ?? 0));

    if (!active || quantity < requiredQuantity) {
      const code = !active ? 'NO_ACTIVE_SUBSCRIPTION' : 'QUANTITY_TOO_LOW';
      return applySupabaseCookies(
        NextResponse.json(
          {
            error: 'BILLING_REQUIRED',
            code,
            message:
              code === 'NO_ACTIVE_SUBSCRIPTION'
                ? 'A paid subscription is required before creating this restaurant.'
                : `Upgrade to ${requiredQuantity} locations before creating this restaurant.`,
            manageBillingUrl: '/billing',
            redirect: `/subscribe?intent=${encodeURIComponent(typedIntent.id)}`,
          },
          { status: 409 },
        ),
        response,
      );
    }
  }

  const authUser = authData.user;
  const authEmail = String(authUser?.email ?? '').trim().toLowerCase();
  const authMeta = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
  const fallbackFullName = String(
    authMeta.full_name ?? authMeta.fullName ?? authMeta.name ?? authEmail.split('@')[0] ?? 'Team Member',
  ).trim() || 'Team Member';

  const { data: requesterRow } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .limit(1)
    .maybeSingle();

  const fullName = String((requesterRow as Record<string, unknown> | null)?.full_name ?? fallbackFullName).trim() || 'Team Member';
  const phone = String((requesterRow as Record<string, unknown> | null)?.phone ?? authUser?.phone ?? '').trim() || null;
  const jobs = Array.isArray((requesterRow as Record<string, unknown> | null)?.jobs)
    ? (requesterRow as Record<string, unknown>).jobs
    : [];

  let createdOrganization: { id: string; name: string; restaurant_code: string } | null = null;
  let createdOrganizationId: string | null = null;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidateCode = generateRestaurantCode();
      const { data, error } = await supabaseAdmin
        .from('organizations')
        .insert({
          name: typedIntent.restaurant_name,
          restaurant_code: candidateCode,
        })
        .select('id,name,restaurant_code')
        .single();

      if (!error && data) {
        createdOrganization = data;
        createdOrganizationId = data.id;
        break;
      }

      const duplicate = error?.code === '23505' || String(error?.message ?? '').toLowerCase().includes('duplicate');
      if (!duplicate) {
        throw error ?? new Error('Unable to create organization.');
      }
    }

    if (!createdOrganization) {
      throw new Error('Unable to generate a unique restaurant code.');
    }

    const { error: membershipError } = await supabaseAdmin
      .from('organization_memberships')
      .upsert(
        {
          organization_id: createdOrganization.id,
          auth_user_id: authUserId,
          role: 'admin',
        },
        { onConflict: 'organization_id,auth_user_id' },
      );

    if (membershipError) {
      throw membershipError;
    }

    const profilePayload: Record<string, unknown> = {
      auth_user_id: authUserId,
      organization_id: createdOrganization.id,
      email: String((requesterRow as Record<string, unknown> | null)?.email ?? authEmail).trim() || null,
      phone,
      full_name: fullName,
      role: 'admin',
      jobs,
    };

    const userUpsertResult = await (supabaseAdmin as any)
      .from('users')
      .upsert(profilePayload, { onConflict: 'organization_id,auth_user_id' });

    if (userUpsertResult.error) {
      const errorMessage = String(userUpsertResult.error.message ?? '');
      if (!canFallbackLegacyUser(errorMessage)) {
        throw userUpsertResult.error;
      }

      const { firstName, lastName } = splitFullName(fullName);
      const legacyPayload: Record<string, unknown> = {
        auth_user_id: authUserId,
        organization_id: createdOrganization.id,
        email: String((requesterRow as Record<string, unknown> | null)?.email ?? authEmail).trim() || null,
        phone,
        first_name: firstName,
        last_name: lastName,
        role: 'admin',
        jobs,
      };
      const legacyResult = await (supabaseAdmin as any)
        .from('users')
        .upsert(legacyPayload, { onConflict: 'organization_id,auth_user_id' });
      if (legacyResult.error) {
        throw legacyResult.error;
      }
    }

    const locationName = String(typedIntent.location_name ?? '').trim();
    if (locationName) {
      const { error: locationError } = await supabaseAdmin
        .from('locations')
        .insert({
          organization_id: createdOrganization.id,
          name: locationName,
          sort_order: 0,
        });
      if (locationError) {
        throw locationError;
      }
    }

    await supabaseAdmin
      .from('organization_create_intents')
      .update({
        status: 'completed',
        organization_id: createdOrganization.id,
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', typedIntent.id);

    return applySupabaseCookies(
      NextResponse.json({
        ok: true,
        organizationId: createdOrganization.id,
        restaurantCode: createdOrganization.restaurant_code,
      }),
      response,
    );
  } catch (error) {
    if (createdOrganizationId) {
      await supabaseAdmin.from('organization_memberships').delete().eq('organization_id', createdOrganizationId);
      await supabaseAdmin.from('users').delete().eq('organization_id', createdOrganizationId);
      await supabaseAdmin.from('organizations').delete().eq('id', createdOrganizationId);
    }

    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from('organization_create_intents')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        last_error: { message },
      })
      .eq('id', typedIntent.id);

    return applySupabaseCookies(
      NextResponse.json({ error: message || 'Unable to commit intent.' }, { status: 500 }),
      response,
    );
  }
}
