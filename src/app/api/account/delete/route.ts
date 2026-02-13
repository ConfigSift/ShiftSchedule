import { NextRequest, NextResponse } from 'next/server';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import { getSiteUrl } from '@/lib/site-url';
import { stripe } from '@/lib/stripe/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DeleteAccountPayload = {
  organizationId?: string;
  confirm?: string;
};

type DeletionStep = {
  table: string;
  column: string;
};

type DeleteFailure = {
  table: string;
  column: string;
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

const ALLOWED_MEMBERSHIP_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'incomplete',
  'unpaid',
]);

const SCHEDULE_VERSION_CHILD_DELETION_STEPS: DeletionStep[] = [
  { table: 'shifts', column: 'schedule_version_id' },
];

const ORG_DELETION_STEPS: DeletionStep[] = [
  { table: 'chat_messages', column: 'organization_id' },
  { table: 'chat_rooms', column: 'organization_id' },
  { table: 'shift_exchange_requests', column: 'organization_id' },
  { table: 'time_off_requests', column: 'organization_id' },
  { table: 'blocked_day_requests', column: 'organization_id' },
  { table: 'shifts', column: 'organization_id' },
  { table: 'schedule_versions', column: 'organization_id' },
  { table: 'schedule_view_settings', column: 'organization_id' },
  { table: 'business_hour_ranges', column: 'organization_id' },
  { table: 'core_hour_ranges', column: 'organization_id' },
  { table: 'business_hours', column: 'organization_id' },
  { table: 'core_hours', column: 'organization_id' },
  { table: 'locations', column: 'organization_id' },
  { table: 'organization_invitations', column: 'organization_id' },
  { table: 'subscriptions', column: 'organization_id' },
  { table: 'organization_memberships', column: 'organization_id' },
  { table: 'users', column: 'organization_id' },
];

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function withNoStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function getSupabaseServiceClient() {
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

function normalizeRole(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function chunkArray<T>(values: T[], chunkSize: number) {
  if (chunkSize <= 0) return [values];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function toIsoFromUnixTimestamp(unixSeconds: number | null | undefined) {
  if (typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function isMissingSchemaError(error: PostgrestError | null) {
  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('relation') && message.includes('does not exist')
  ) || (
    message.includes('column') && message.includes('does not exist')
  );
}

function isMissingTableError(error: PostgrestError | null) {
  const code = String(error?.code ?? '').toUpperCase();
  const message = String(error?.message ?? '').toLowerCase();
  return code === 'PGRST205' || message.includes('could not find the table');
}

function buildDeleteFailure(table: string, column: string, error: PostgrestError): DeleteFailure {
  return {
    table,
    column,
    message: String(error.message ?? 'Unknown database error'),
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

function logDeleteFailure(prefix: string, organizationId: string, userId: string, failure: DeleteFailure) {
  console.error(prefix, {
    organizationId,
    userId,
    table: failure.table,
    column: failure.column,
    error: failure.message,
    code: failure.code,
    details: failure.details,
    hint: failure.hint,
  });
}

function deleteFailureResponse(failure: DeleteFailure) {
  return jsonNoStore(
    {
      error: 'DELETE_STEP_FAILED',
      message: `Failed deleting ${failure.table}.`,
      table: failure.table,
      column: failure.column,
      code: failure.code,
      details: failure.details,
      hint: failure.hint,
    },
    { status: 500 },
  );
}

async function resolveLegacyAdminStatus(
  supabaseAdminClient: ReturnType<typeof createClient>,
  organizationId: string,
  authUserId: string,
) {
  const withIsAdmin = await supabaseAdminClient
    .from('users')
    .select('role,account_type,is_admin')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (withIsAdmin.error) {
    const message = String(withIsAdmin.error.message ?? '').toLowerCase();
    if (!(message.includes('column') && message.includes('is_admin'))) {
      return { allowed: false, error: withIsAdmin.error };
    }

    const withoutIsAdmin = await supabaseAdminClient
      .from('users')
      .select('role,account_type')
      .eq('organization_id', organizationId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (withoutIsAdmin.error) {
      return { allowed: false, error: withoutIsAdmin.error };
    }

    const fallbackRole = normalizeRole(withoutIsAdmin.data?.role ?? withoutIsAdmin.data?.account_type);
    return {
      allowed: ALLOWED_MEMBERSHIP_ROLES.has(fallbackRole),
      role: fallbackRole || 'UNKNOWN',
      error: null,
    };
  }

  const legacyRole = normalizeRole(withIsAdmin.data?.role ?? withIsAdmin.data?.account_type);
  const isAdminFlag = withIsAdmin.data?.is_admin === true;
  return {
    allowed: isAdminFlag || ALLOWED_MEMBERSHIP_ROLES.has(legacyRole),
    role: legacyRole || (isAdminFlag ? 'IS_ADMIN' : 'UNKNOWN'),
    error: null,
  };
}

async function ensureDeletionAuthorized(
  supabaseAdminClient: ReturnType<typeof createClient>,
  organizationId: string,
  authUserId: string,
) {
  const { data: membership, error: membershipError } = await supabaseAdminClient
    .from('organization_memberships')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (membershipError) {
    return {
      allowed: false,
      status: 500,
      error: membershipError.message,
      role: null as string | null,
    };
  }

  if (!membership) {
    return {
      allowed: false,
      status: 403,
      error: 'Not a member of this organization.',
      role: null as string | null,
    };
  }

  const role = normalizeRole((membership as Record<string, unknown>).role);
  if (role) {
    if (!ALLOWED_MEMBERSHIP_ROLES.has(role)) {
      return {
        allowed: false,
        status: 403,
        error: 'Only owner/admin/manager can delete this organization.',
        role,
      };
    }

    return {
      allowed: true,
      status: 200,
      error: null as string | null,
      role,
    };
  }

  const legacyStatus = await resolveLegacyAdminStatus(
    supabaseAdminClient,
    organizationId,
    authUserId,
  );

  if (legacyStatus.error) {
    return {
      allowed: false,
      status: 500,
      error: legacyStatus.error.message,
      role: null as string | null,
    };
  }

  if (!legacyStatus.allowed) {
    return {
      allowed: false,
      status: 403,
      error: 'Only admins can delete this organization.',
      role: legacyStatus.role ?? 'UNKNOWN',
    };
  }

  return {
    allowed: true,
    status: 200,
    error: null as string | null,
    role: legacyStatus.role ?? 'UNKNOWN',
  };
}

export async function POST(request: NextRequest) {
  let payload: DeleteAccountPayload;
  try {
    payload = (await request.json()) as DeleteAccountPayload;
  } catch {
    return jsonNoStore({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const organizationId = String(payload.organizationId ?? '').trim();
  const confirm = String(payload.confirm ?? '');

  if (!organizationId) {
    return jsonNoStore({ error: 'organizationId is required.' }, { status: 400 });
  }

  if (confirm !== 'DELETE') {
    return jsonNoStore({ error: 'confirm must equal DELETE.' }, { status: 400 });
  }

  let supabaseAdminClient: ReturnType<typeof createClient>;
  try {
    supabaseAdminClient = getSupabaseServiceClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[account:delete] missing service-role configuration', { error: message });
    return jsonNoStore({ error: 'Server billing/auth configuration is incomplete.' }, { status: 500 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;

  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    return applySupabaseCookies(withNoStore(jsonError(message, 401)), response);
  }

  console.log('[account:delete] request', {
    organizationId,
    userId: authUserId,
  });

  const { data: orgRow, error: orgLookupError } = await supabaseAdminClient
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .maybeSingle();

  if (orgLookupError) {
    console.error('[account:delete] organization lookup failed', {
      organizationId,
      userId: authUserId,
      error: orgLookupError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Unable to verify organization.' }, { status: 500 }),
      response,
    );
  }

  if (!orgRow) {
    return applySupabaseCookies(
      jsonNoStore({ error: 'Organization not found.' }, { status: 404 }),
      response,
    );
  }

  const authorization = await ensureDeletionAuthorized(
    supabaseAdminClient,
    organizationId,
    authUserId,
  );

  console.log('[account:delete] membership check', {
    organizationId,
    userId: authUserId,
    role: authorization.role,
    allowed: authorization.allowed,
  });

  if (!authorization.allowed) {
    const status = authorization.status === 500 ? 500 : 403;
    const fallbackMessage =
      status === 500 ? 'Unable to verify organization permissions.' : 'Not authorized.';
    return applySupabaseCookies(
      jsonNoStore({ error: authorization.error ?? fallbackMessage }, { status }),
      response,
    );
  }

  if (BILLING_ENABLED) {
    const { data: subscription, error: subscriptionError } = await supabaseAdminClient
      .from('subscriptions')
      .select('status,cancel_at_period_end,current_period_end,stripe_subscription_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (subscriptionError && !isMissingSchemaError(subscriptionError)) {
      console.error('[account:delete] subscription status lookup failed', {
        organizationId,
        userId: authUserId,
        error: subscriptionError.message,
      });
      return applySupabaseCookies(
        jsonNoStore({ error: 'Unable to validate subscription status.' }, { status: 500 }),
        response,
      );
    }

    let subscriptionStatus = String(subscription?.status ?? '').trim().toLowerCase();
    let cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
    let currentPeriodEnd = String(subscription?.current_period_end ?? '').trim() || null;

    if (subscription?.stripe_subscription_id) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
        subscriptionStatus = String(stripeSubscription.status ?? '').trim().toLowerCase();
        cancelAtPeriodEnd = Boolean(stripeSubscription.cancel_at_period_end);
        currentPeriodEnd = toIsoFromUnixTimestamp(stripeSubscription.current_period_end);

        const { error: stripeSyncError } = await supabaseAdminClient
          .from('subscriptions')
          .update({
            status: stripeSubscription.status,
            cancel_at_period_end: stripeSubscription.cancel_at_period_end,
            current_period_start: toIsoFromUnixTimestamp(stripeSubscription.current_period_start),
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);

        if (stripeSyncError) {
          console.warn('[account:delete] Stripe sync update failed (continuing)', {
            organizationId,
            userId: authUserId,
            stripeSubscriptionId: subscription.stripe_subscription_id,
            error: stripeSyncError.message,
          });
        }
      } catch (stripeSyncError) {
        const message =
          stripeSyncError instanceof Error ? stripeSyncError.message : String(stripeSyncError);
        console.warn('[account:delete] Stripe refresh failed; using DB subscription state', {
          organizationId,
          userId: authUserId,
          stripeSubscriptionId: subscription.stripe_subscription_id,
          error: message,
        });
      }
    }

    console.log('[account:delete] subscription check', {
      organizationId,
      userId: authUserId,
      status: subscriptionStatus || 'none',
      cancelAtPeriodEnd,
      currentPeriodEnd,
    });

    if (BLOCKING_SUBSCRIPTION_STATUSES.has(subscriptionStatus) && !cancelAtPeriodEnd) {
      return applySupabaseCookies(
        jsonNoStore(
          {
            error: 'SUBSCRIPTION_ACTIVE',
            message:
              'Your subscription is still active. Cancel renewal in the Billing Portal first (set to cancel at period end), then you can delete.',
            manageBillingUrl: `${getSiteUrl()}/billing`,
          },
          { status: 409 },
        ),
        response,
      );
    }
  } else {
    console.log('[account:delete] subscription check skipped (billing disabled)', {
      organizationId,
      userId: authUserId,
    });
  }

  let scheduleVersionIds: string[] = [];
  const { data: scheduleVersionRows, error: scheduleVersionLookupError } = await supabaseAdminClient
    .from('schedule_versions')
    .select('id')
    .eq('organization_id', organizationId);

  if (scheduleVersionLookupError) {
    if (isMissingTableError(scheduleVersionLookupError)) {
      console.warn('[account:delete] skipping missing table schedule_versions (PGRST205)', {
        organizationId,
        userId: authUserId,
        code: scheduleVersionLookupError.code ?? null,
        error: scheduleVersionLookupError.message,
      });
    } else if (isMissingSchemaError(scheduleVersionLookupError)) {
      console.warn('[account:delete] schedule_versions table missing, skipping version-scoped cleanup', {
        organizationId,
        userId: authUserId,
        error: scheduleVersionLookupError.message,
      });
    } else {
      const failure = buildDeleteFailure('schedule_versions', 'organization_id', scheduleVersionLookupError);
      logDeleteFailure('[account:delete] schedule version lookup failed', organizationId, authUserId, failure);
      return applySupabaseCookies(deleteFailureResponse(failure), response);
    }
  } else {
    scheduleVersionIds = (scheduleVersionRows ?? [])
      .map((row) => String((row as { id?: unknown }).id ?? '').trim())
      .filter(Boolean);
  }

  if (scheduleVersionIds.length > 0) {
    console.log('[account:delete] deleting schedule-version dependent rows', {
      organizationId,
      userId: authUserId,
      scheduleVersionCount: scheduleVersionIds.length,
    });
  }

  for (const step of SCHEDULE_VERSION_CHILD_DELETION_STEPS) {
    if (scheduleVersionIds.length === 0) {
      continue;
    }

    console.log('[account:delete] deleting table rows (schedule version scoped)', {
      organizationId,
      userId: authUserId,
      table: step.table,
      column: step.column,
      scheduleVersionCount: scheduleVersionIds.length,
    });

    const scheduleVersionIdChunks = chunkArray(scheduleVersionIds, 500);

    for (const idChunk of scheduleVersionIdChunks) {
      const { error } = await supabaseAdminClient
        .from(step.table)
        .delete()
        .in(step.column, idChunk);

      if (!error) {
        continue;
      }

      if (isMissingSchemaError(error)) {
        console.warn('[account:delete] table/column missing, skipping version-scoped step', {
          organizationId,
          userId: authUserId,
          table: step.table,
          column: step.column,
          error: error.message,
        });
        break;
      }

      const failure = buildDeleteFailure(step.table, step.column, error);
      logDeleteFailure('[account:delete] delete step failed', organizationId, authUserId, failure);
      return applySupabaseCookies(deleteFailureResponse(failure), response);
    }
  }

  for (const step of ORG_DELETION_STEPS) {
    console.log('[account:delete] deleting table rows', {
      organizationId,
      userId: authUserId,
      table: step.table,
      column: step.column,
    });

    const { error } = await supabaseAdminClient
      .from(step.table)
      .delete()
      .eq(step.column, organizationId);

    if (!error) {
      continue;
    }

    if (isMissingSchemaError(error)) {
      console.warn('[account:delete] table/column missing, skipping step', {
        organizationId,
        userId: authUserId,
        table: step.table,
        column: step.column,
        error: error.message,
      });
      continue;
    }

    if (step.table === 'schedule_versions' && isMissingTableError(error)) {
      console.warn('[account:delete] skipping missing table schedule_versions (PGRST205)', {
        organizationId,
        userId: authUserId,
        code: error.code ?? null,
        error: error.message,
      });
      continue;
    }

    const failure = buildDeleteFailure(step.table, step.column, error);
    logDeleteFailure('[account:delete] delete step failed', organizationId, authUserId, failure);
    return applySupabaseCookies(deleteFailureResponse(failure), response);
  }

  console.log('[account:delete] deleting organization row', {
    organizationId,
    userId: authUserId,
  });

  const { error: organizationDeleteError } = await supabaseAdminClient
    .from('organizations')
    .delete()
    .eq('id', organizationId);

  if (organizationDeleteError) {
    const failure = buildDeleteFailure('organizations', 'id', organizationDeleteError);
    logDeleteFailure('[account:delete] organization delete failed', organizationId, authUserId, failure);
    return applySupabaseCookies(
      deleteFailureResponse(failure),
      response,
    );
  }

  const { data: remainingUserRows, error: remainingUserLookupError } = await supabaseAdminClient
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId);

  if (remainingUserLookupError && !isMissingSchemaError(remainingUserLookupError)) {
    console.error('[account:delete] remaining user lookup failed', {
      organizationId,
      userId: authUserId,
      error: remainingUserLookupError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Deleted organization, but failed checking remaining user rows.' }, { status: 500 }),
      response,
    );
  }

  const remainingUserIds = (remainingUserRows ?? [])
    .map((row) => String((row as { id?: unknown }).id ?? '').trim())
    .filter(Boolean);

  const membershipCountQuery = supabaseAdminClient
    .from('organization_memberships')
    .select('id', { count: 'exact', head: true });

  const membershipFilter = remainingUserIds.length > 0
    ? `auth_user_id.eq.${authUserId},user_id.in.(${remainingUserIds.join(',')})`
    : `auth_user_id.eq.${authUserId}`;

  const { count: remainingMembershipCount, error: remainingMembershipError } = await membershipCountQuery
    .or(membershipFilter);

  if (remainingMembershipError) {
    console.error('[account:delete] membership recount failed', {
      organizationId,
      userId: authUserId,
      error: remainingMembershipError.message,
    });
    return applySupabaseCookies(
      jsonNoStore({ error: 'Deleted organization, but failed checking remaining memberships.' }, { status: 500 }),
      response,
    );
  }

  const hasOtherMemberships = (remainingMembershipCount ?? 0) > 0;
  let deletedAuthUser = false;

  if (!hasOtherMemberships) {
    console.log('[account:delete] deleting auth user', {
      organizationId,
      userId: authUserId,
    });

    const { error: deleteAuthError } = await supabaseAdminClient.auth.admin.deleteUser(authUserId);
    if (deleteAuthError) {
      console.error('[account:delete] auth user delete failed', {
        organizationId,
        userId: authUserId,
        error: deleteAuthError.message,
      });
      return applySupabaseCookies(
        jsonNoStore({ error: 'Organization deleted, but failed deleting auth user.' }, { status: 500 }),
        response,
      );
    }

    deletedAuthUser = true;
  }

  console.log('[account:delete] completed', {
    organizationId,
    userId: authUserId,
    deletedAuthUser,
    remainingMembershipCount: remainingMembershipCount ?? 0,
  });

  return applySupabaseCookies(
    jsonNoStore({
      ok: true,
      deletedOrg: organizationId,
      deletedAuthUser,
    }),
    response,
  );
}
