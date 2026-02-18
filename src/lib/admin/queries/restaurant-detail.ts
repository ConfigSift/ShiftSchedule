import { getAdminSupabase } from '@/lib/admin/supabase';

// ---------------------------------------------------------------------------
// Types — scoped to restaurant detail
// ---------------------------------------------------------------------------

export type OrgProfile = {
  id: string;
  name: string;
  restaurantCode: string;
  createdAt: string;
};

export type MembershipRow = {
  id: string;
  authUserId: string;
  userId: string | null;
  role: string;
  fullName: string | null;
  email: string | null;
};

export type LocationRow = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

export type EmployeeRow = {
  id: string;
  authUserId: string | null;
  displayName: string | null;
  role: string;
  position: string | null;
  isActive: boolean | null;
  employeeNumber: string | null;
  pinReady: boolean;
  email: string | null;
  phone: string | null;
  source: 'users' | 'membership';
};

export type UsageCounts = {
  shifts: number;
  timeOffRequests: number;
  shiftExchangeRequests: number;
  blockedDayRequests: number;
};

export type SubscriptionDetail = {
  id: string;
  status: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  quantity: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null;

export type BillingAccountDetail = {
  authUserId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
  quantity: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
} | null;

export type ProvisioningIntent = {
  id: string;
  authUserId: string;
  restaurantName: string;
  status: string;
  desiredQuantity: number;
  organizationId: string | null;
  lastError: unknown;
  createdAt: string;
  updatedAt: string;
};

export type RestaurantOverviewData = {
  org: OrgProfile;
  memberships: MembershipRow[];
};

// ---------------------------------------------------------------------------
// 1. Overview: org profile + memberships
// ---------------------------------------------------------------------------

export async function getRestaurantOverview(
  orgId: string,
): Promise<RestaurantOverviewData | null> {
  const db = getAdminSupabase();

  const [orgRes, membershipsRes] = await Promise.all([
    db
      .from('organizations')
      .select('id, name, restaurant_code, created_at')
      .eq('id', orgId)
      .maybeSingle(),
    db
      .from('organization_memberships')
      .select('id, auth_user_id, user_id, role, users(full_name, real_email, email)')
      .eq('organization_id', orgId)
      .order('role', { ascending: true }),
  ]);

  if (!orgRes.data) return null;

  const org: OrgProfile = {
    id: orgRes.data.id,
    name: orgRes.data.name,
    restaurantCode: orgRes.data.restaurant_code,
    createdAt: orgRes.data.created_at,
  };

  type MemberRaw = {
    id: string;
    auth_user_id: string;
    user_id: string | null;
    role: string;
    users: { full_name: string; real_email: string | null; email: string | null }
      | { full_name: string; real_email: string | null; email: string | null }[]
      | null;
  };

  const memberships: MembershipRow[] = (
    (membershipsRes.data ?? []) as MemberRaw[]
  ).map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    return {
      id: m.id,
      authUserId: m.auth_user_id,
      userId: m.user_id,
      role: m.role,
      fullName: u?.full_name || null,
      email: u?.real_email || u?.email || null,
    };
  });

  return { org, memberships };
}

// ---------------------------------------------------------------------------
// 2. Locations
// ---------------------------------------------------------------------------

export async function getRestaurantLocations(
  orgId: string,
): Promise<LocationRow[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from('locations')
    .select('id, name, sort_order, created_at')
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at ?? ''),
  }));
}

// ---------------------------------------------------------------------------
// 3. Employees
// ---------------------------------------------------------------------------

export async function getRestaurantEmployees(
  orgId: string,
): Promise<EmployeeRow[]> {
  const db = getAdminSupabase();
  const [usersRows, ownerMembership] = await Promise.all([
    fetchUsersForOrganization(orgId),
    fetchOwnerMembership(orgId),
  ]);

  const ownerAuthUserId = String(ownerMembership?.auth_user_id ?? '').trim() || null;
  let ownerProfileName: string | null = null;
  if (ownerAuthUserId) {
    const ownerProfileRes = await db
      .from('account_profiles')
      .select('owner_name')
      .eq('auth_user_id', ownerAuthUserId)
      .maybeSingle();
    ownerProfileName = normalizeNullableText(ownerProfileRes.data?.owner_name);
  }

  const employees: EmployeeRow[] = usersRows.map((r) => {
    const authUserId = normalizeNullableText(r.auth_user_id);
    const role = ownerAuthUserId && authUserId === ownerAuthUserId
      ? 'owner'
      : normalizeRole(r.role, r.account_type);

    return {
      id: String(r.id),
      authUserId,
      displayName:
        normalizeNullableText(r.full_name)
        ?? normalizeNullableText(r.real_email)
        ?? normalizeNullableText(r.email),
      role,
      position: normalizeNullableText(r.position),
      isActive: r.is_active === null || r.is_active === undefined ? null : Boolean(r.is_active),
      employeeNumber: r.employee_number != null ? String(r.employee_number) : null,
      pinReady: Boolean(r.pin_hash),
      email: normalizeNullableText(r.real_email) ?? normalizeNullableText(r.email),
      phone: normalizeNullableText(r.phone),
      source: 'users',
    };
  });

  if (ownerAuthUserId && !employees.some((row) => row.authUserId === ownerAuthUserId)) {
    employees.push({
      id: ownerAuthUserId,
      authUserId: ownerAuthUserId,
      displayName: ownerProfileName,
      role: 'owner',
      position: null,
      isActive: null,
      employeeNumber: null,
      pinReady: false,
      email: null,
      phone: null,
      source: 'membership',
    });
  }

  return employees;
}

async function fetchUsersForOrganization(orgId: string): Promise<Record<string, unknown>[]> {
  const db = getAdminSupabase();
  const primarySelect =
    'id, auth_user_id, full_name, role, account_type, position, is_active, employee_number, pin_hash, real_email, email, phone, created_at';
  const fallbackSelect =
    'id, auth_user_id, full_name, role, account_type, is_active, employee_number, pin_hash, real_email, email, phone';

  const primaryRes = await db
    .from('users')
    .select(primarySelect)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });
  if (!primaryRes.error) {
    return (primaryRes.data ?? []) as Record<string, unknown>[];
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[admin/restaurant-detail] users primary select failed, using fallback', {
      orgId,
      message: primaryRes.error.message,
    });
  }
  const fallbackRes = await db
    .from('users')
    .select(fallbackSelect)
    .eq('organization_id', orgId)
    .order('id', { ascending: true });

  if (fallbackRes.error) {
    throw new Error(fallbackRes.error.message || 'Unable to load restaurant employees.');
  }

  if (primaryRes.error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[admin/restaurant-detail] users fallback loaded after primary failure', {
        orgId,
      });
    }
  }
  return (fallbackRes.data ?? []) as Record<string, unknown>[];
}

async function fetchOwnerMembership(
  orgId: string,
): Promise<{ auth_user_id: string | null } | null> {
  const db = getAdminSupabase();
  const ownerRes = await db
    .from('organization_memberships')
    .select('auth_user_id')
    .eq('organization_id', orgId)
    .ilike('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (ownerRes.error) {
    throw new Error(ownerRes.error.message || 'Unable to load owner membership.');
  }

  if (ownerRes.data?.auth_user_id) return ownerRes.data;

  // Some production data uses admin for the owner seat.
  const adminRes = await db
    .from('organization_memberships')
    .select('auth_user_id')
    .eq('organization_id', orgId)
    .ilike('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (adminRes.error) {
    throw new Error(adminRes.error.message || 'Unable to load fallback owner membership.');
  }

  return adminRes.data ?? null;
}

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeRole(role: unknown, accountType: unknown): string {
  const raw = String(role ?? accountType ?? 'employee').trim().toLowerCase();
  return raw || 'employee';
}

// ---------------------------------------------------------------------------
// 4. Usage counts
// ---------------------------------------------------------------------------

export async function getRestaurantUsage(
  orgId: string,
  days: number,
): Promise<UsageCounts> {
  const db = getAdminSupabase();
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [shifts, timeOff, exchange, blocked] = await Promise.all([
    db
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since),
    db
      .from('time_off_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since),
    db
      .from('shift_exchange_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since),
    db
      .from('blocked_day_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since),
  ]);

  return {
    shifts: shifts.count ?? 0,
    timeOffRequests: timeOff.count ?? 0,
    shiftExchangeRequests: exchange.count ?? 0,
    blockedDayRequests: blocked.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Subscription + billing account
// ---------------------------------------------------------------------------

export async function getRestaurantSubscription(orgId: string): Promise<{
  subscription: SubscriptionDetail;
  billingAccount: BillingAccountDetail;
}> {
  const db = getAdminSupabase();

  // Get subscription for this org
  const { data: subRow } = await db
    .from('subscriptions')
    .select(
      'id, status, stripe_subscription_id, stripe_customer_id, stripe_price_id, quantity, current_period_start, current_period_end, cancel_at_period_end',
    )
    .eq('organization_id', orgId)
    .maybeSingle();

  const subscription: SubscriptionDetail = subRow
    ? {
        id: subRow.id,
        status: subRow.status,
        stripeSubscriptionId: subRow.stripe_subscription_id,
        stripeCustomerId: subRow.stripe_customer_id,
        stripePriceId: subRow.stripe_price_id,
        quantity: subRow.quantity,
        currentPeriodStart: subRow.current_period_start,
        currentPeriodEnd: subRow.current_period_end,
        cancelAtPeriodEnd: subRow.cancel_at_period_end,
      }
    : null;

  // Find the owner's billing_accounts via the admin membership
  let billingAccount: BillingAccountDetail = null;

  const { data: adminMembership } = await db
    .from('organization_memberships')
    .select('auth_user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (adminMembership?.auth_user_id) {
    const { data: billing } = await db
      .from('billing_accounts')
      .select(
        'auth_user_id, stripe_customer_id, stripe_subscription_id, status, quantity, cancel_at_period_end, current_period_end',
      )
      .eq('auth_user_id', adminMembership.auth_user_id)
      .maybeSingle();

    if (billing) {
      billingAccount = {
        authUserId: billing.auth_user_id,
        stripeCustomerId: billing.stripe_customer_id,
        stripeSubscriptionId: billing.stripe_subscription_id,
        status: billing.status,
        quantity: billing.quantity,
        cancelAtPeriodEnd: billing.cancel_at_period_end,
        currentPeriodEnd: billing.current_period_end,
      };
    }
  }

  return { subscription, billingAccount };
}

// ---------------------------------------------------------------------------
// 6. Provisioning intents
// ---------------------------------------------------------------------------

export async function getRestaurantProvisioning(
  orgId: string,
): Promise<ProvisioningIntent[]> {
  const db = getAdminSupabase();

  // Intents directly linked to this org
  const { data: directIntents } = await db
    .from('organization_create_intents')
    .select(
      'id, auth_user_id, restaurant_name, status, desired_quantity, organization_id, last_error, created_at, updated_at',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);

  // Also find intents by the owner's auth_user_id (may include other orgs)
  const { data: adminMembership } = await db
    .from('organization_memberships')
    .select('auth_user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  let ownerIntents: Record<string, unknown>[] = [];
  if (adminMembership?.auth_user_id) {
    const { data } = await db
      .from('organization_create_intents')
      .select(
        'id, auth_user_id, restaurant_name, status, desired_quantity, organization_id, last_error, created_at, updated_at',
      )
      .eq('auth_user_id', adminMembership.auth_user_id)
      .order('created_at', { ascending: false })
      .limit(20);
    ownerIntents = (data ?? []) as Record<string, unknown>[];
  }

  // Merge and de-duplicate
  const allRaw = [
    ...((directIntents ?? []) as Record<string, unknown>[]),
    ...ownerIntents,
  ];
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  for (const r of allRaw) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(r);
  }

  // Sort descending by created_at
  unique.sort(
    (a, b) =>
      new Date(String(b.created_at)).getTime() -
      new Date(String(a.created_at)).getTime(),
  );

  return unique.map((r) => ({
    id: String(r.id),
    authUserId: String(r.auth_user_id),
    restaurantName: String(r.restaurant_name ?? ''),
    status: String(r.status ?? ''),
    desiredQuantity: Number(r.desired_quantity ?? 1),
    organizationId: r.organization_id ? String(r.organization_id) : null,
    lastError: r.last_error ?? null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  }));
}
