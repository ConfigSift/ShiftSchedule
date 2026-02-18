import { getAuthUsersByIds } from '@/lib/admin/authUsers';
import { getAdminSupabase } from '@/lib/admin/supabase';
import type { AccountRow, ProfileState } from '@/lib/admin/types';

export type AccountFilters = {
  search?: string;
  billingStatus?: string;
  profileState?: ProfileState | 'all';
};

export type AccountSort = {
  column: string;
  direction: 'asc' | 'desc';
};

export type AccountListDebug = {
  ownersStrategy: 'memberships' | 'fallback';
  ownersFound: number;
};

export type AccountListResult = {
  data: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
  debug?: AccountListDebug;
};

type ProfileRow = {
  auth_user_id: string;
  owner_name: string | null;
};

type BillingRow = {
  auth_user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  quantity: number | null;
};

type OwnerSeedResolution = {
  ownerIds: string[];
  strategy: 'memberships' | 'fallback';
};

export async function getAccountsList(
  filters: AccountFilters = {},
  page = 1,
  pageSize = 25,
  sort: AccountSort = { column: 'ownerName', direction: 'asc' },
): Promise<AccountListResult> {
  const db = getAdminSupabase();
  const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
  const safePageSize = Math.min(100, Math.max(1, Number.isFinite(pageSize) ? pageSize : 25));
  const normalizedSort = normalizeSort(sort);
  const includeDebug = process.env.ADMIN_DEBUG === '1';

  const ownerSeed = await resolveOwnerSeed();
  if (ownerSeed.ownerIds.length === 0) {
    return {
      data: [],
      total: 0,
      page: safePage,
      pageSize: safePageSize,
      ...(includeDebug ? { debug: { ownersStrategy: ownerSeed.strategy, ownersFound: 0 } } : {}),
    };
  }

  const orgIdsByOwner = await resolveOwnedOrgIdsByOwner(ownerSeed.ownerIds);
  const allOwnedOrgIds = [...new Set([...orgIdsByOwner.values()].flat())];

  const [profiles, billingRows, authUsersMap, usersRows, shiftsRows] = await Promise.all([
    fetchProfilesByOwnerIds(ownerSeed.ownerIds),
    fetchBillingByOwnerIds(ownerSeed.ownerIds),
    getAuthUsersByIds(ownerSeed.ownerIds),
    allOwnedOrgIds.length > 0
      ? db.from('users').select('organization_id').in('organization_id', allOwnedOrgIds)
      : Promise.resolve({ data: [], error: null }),
    allOwnedOrgIds.length > 0
      ? db
          .from('shifts')
          .select('organization_id, created_at')
          .in('organization_id', allOwnedOrgIds)
          .order('created_at', { ascending: false })
          .limit(20_000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profileMap = new Map<string, ProfileRow>();
  for (const row of profiles) profileMap.set(row.auth_user_id, row);

  const billingMap = new Map<string, BillingRow>();
  for (const row of billingRows) billingMap.set(row.auth_user_id, row);

  const employeesByOrg = countByOrg((usersRows.data ?? []) as Record<string, unknown>[]);
  const lastShiftByOrg = new Map<string, string>();
  for (const row of (shiftsRows.data ?? []) as { organization_id: string; created_at: string }[]) {
    if (!lastShiftByOrg.has(row.organization_id)) {
      lastShiftByOrg.set(row.organization_id, row.created_at);
    }
  }

  let rows: AccountRow[] = ownerSeed.ownerIds.map((authUserId) => {
    const profile = profileMap.get(authUserId);
    const ownerName = normalizeNullableText(profile?.owner_name);
    const hasAuthUser = authUsersMap.has(authUserId);
    const email = authUsersMap.get(authUserId) ?? null;
    const billing = billingMap.get(authUserId);
    const ownedOrgIds = orgIdsByOwner.get(authUserId) ?? [];

    let employeesCount = 0;
    let lastShiftCreatedAt: string | null = null;
    for (const orgId of ownedOrgIds) {
      employeesCount += employeesByOrg.get(orgId) ?? 0;
      const latestShift = lastShiftByOrg.get(orgId);
      if (latestShift && (!lastShiftCreatedAt || latestShift > lastShiftCreatedAt)) {
        lastShiftCreatedAt = latestShift;
      }
    }

    const profileState: ProfileState = !hasAuthUser
      ? 'orphaned'
      : ownerName
        ? 'ok'
        : 'missing_name';

    return {
      authUserId,
      email,
      ownerName,
      profileState,
      isOrphaned: profileState === 'orphaned',
      billingStatus: billing?.status ?? null,
      stripeCustomerId: billing?.stripe_customer_id ?? null,
      stripeSubscriptionId: billing?.stripe_subscription_id ?? null,
      quantity: billing?.quantity ?? null,
      ownedOrganizationsCount: ownedOrgIds.length,
      locationsCount: ownedOrgIds.length,
      employeesCount,
      lastShiftCreatedAt,
    };
  });

  if (filters.search) {
    const term = filters.search.trim().toLowerCase();
    if (term) {
      rows = rows.filter((row) =>
        row.authUserId.toLowerCase().includes(term)
        || (row.ownerName?.toLowerCase().includes(term) ?? false)
        || (row.email?.toLowerCase().includes(term) ?? false),
      );
    }
  }

  if (filters.billingStatus) {
    const target = filters.billingStatus;
    rows = rows.filter((row) =>
      target === 'none' ? row.billingStatus === null : row.billingStatus === target,
    );
  }

  if (filters.profileState && filters.profileState !== 'all') {
    rows = rows.filter((row) => row.profileState === filters.profileState);
  }

  rows = sortRows(rows, normalizedSort);
  const total = rows.length;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize;

  return {
    data: rows.slice(from, to),
    total,
    page: safePage,
    pageSize: safePageSize,
    ...(includeDebug
      ? {
          debug: {
            ownersStrategy: ownerSeed.strategy,
            ownersFound: ownerSeed.ownerIds.length,
          } satisfies AccountListDebug,
        }
      : {}),
  };
}

async function resolveOwnerSeed(): Promise<OwnerSeedResolution> {
  const fromMemberships = await fetchOwnerIdsFromMemberships();
  if (fromMemberships.length > 0) {
    return { ownerIds: fromMemberships, strategy: 'memberships' };
  }

  return {
    ownerIds: await fetchOwnerIdsFallback(),
    strategy: 'fallback',
  };
}

async function fetchOwnerIdsFromMemberships(): Promise<string[]> {
  const db = getAdminSupabase();
  const ownerIds = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await db
      .from('organization_memberships')
      .select('auth_user_id')
      .ilike('role', 'owner')
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Unable to load owner memberships.');
    }

    const rows = (data ?? []) as { auth_user_id: string | null }[];
    for (const row of rows) {
      const id = String(row.auth_user_id ?? '').trim();
      if (id) ownerIds.add(id);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...ownerIds];
}

async function fetchOwnerIdsFallback(): Promise<string[]> {
  const db = getAdminSupabase();
  const ownerIds = new Set<string>();

  const [billingRes, intentsRes] = await Promise.all([
    db.from('billing_accounts').select('auth_user_id'),
    db
      .from('organization_create_intents')
      .select('auth_user_id, status')
      .eq('status', 'completed'),
  ]);

  if (billingRes.error) {
    throw new Error(billingRes.error.message || 'Unable to load billing account owners.');
  }
  if (intentsRes.error) {
    throw new Error(intentsRes.error.message || 'Unable to load completed intent owners.');
  }

  for (const row of (billingRes.data ?? []) as { auth_user_id: string | null }[]) {
    const id = String(row.auth_user_id ?? '').trim();
    if (id) ownerIds.add(id);
  }
  for (const row of (intentsRes.data ?? []) as { auth_user_id: string | null }[]) {
    const id = String(row.auth_user_id ?? '').trim();
    if (id) ownerIds.add(id);
  }

  return [...ownerIds];
}

async function resolveOwnedOrgIdsByOwner(ownerIds: string[]): Promise<Map<string, string[]>> {
  const fromMemberships = await fetchOwnedOrgIdsFromMemberships(ownerIds);
  const hasAnyMembershipOrg = [...fromMemberships.values()].some((orgIds) => orgIds.length > 0);
  if (hasAnyMembershipOrg) return fromMemberships;
  return fetchOwnedOrgIdsFromCompletedIntents(ownerIds);
}

async function fetchOwnedOrgIdsFromMemberships(ownerIds: string[]): Promise<Map<string, string[]>> {
  const db = getAdminSupabase();
  const out = new Map<string, string[]>();
  if (ownerIds.length === 0) return out;

  const { data, error } = await db
    .from('organization_memberships')
    .select('auth_user_id, organization_id')
    .in('auth_user_id', ownerIds)
    .ilike('role', 'owner');

  if (error) {
    throw new Error(error.message || 'Unable to load owner organization memberships.');
  }

  for (const row of (data ?? []) as { auth_user_id: string; organization_id: string | null }[]) {
    const authUserId = String(row.auth_user_id ?? '').trim();
    const orgId = String(row.organization_id ?? '').trim();
    if (!authUserId || !orgId) continue;
    const list = out.get(authUserId) ?? [];
    if (!list.includes(orgId)) list.push(orgId);
    out.set(authUserId, list);
  }

  return out;
}

async function fetchOwnedOrgIdsFromCompletedIntents(ownerIds: string[]): Promise<Map<string, string[]>> {
  const db = getAdminSupabase();
  const out = new Map<string, string[]>();
  if (ownerIds.length === 0) return out;

  const { data, error } = await db
    .from('organization_create_intents')
    .select('auth_user_id, organization_id, status')
    .in('auth_user_id', ownerIds)
    .eq('status', 'completed')
    .not('organization_id', 'is', null);

  if (error) {
    throw new Error(error.message || 'Unable to load owner organizations from intents.');
  }

  for (const row of (data ?? []) as { auth_user_id: string; organization_id: string | null }[]) {
    const authUserId = String(row.auth_user_id ?? '').trim();
    const orgId = String(row.organization_id ?? '').trim();
    if (!authUserId || !orgId) continue;
    const list = out.get(authUserId) ?? [];
    if (!list.includes(orgId)) list.push(orgId);
    out.set(authUserId, list);
  }

  return out;
}

async function fetchProfilesByOwnerIds(ownerIds: string[]): Promise<ProfileRow[]> {
  const db = getAdminSupabase();
  if (ownerIds.length === 0) return [];
  const { data, error } = await db
    .from('account_profiles')
    .select('auth_user_id, owner_name')
    .in('auth_user_id', ownerIds);
  if (error) {
    throw new Error(error.message || 'Unable to load owner profiles.');
  }
  return (data ?? []) as ProfileRow[];
}

async function fetchBillingByOwnerIds(ownerIds: string[]): Promise<BillingRow[]> {
  const db = getAdminSupabase();
  if (ownerIds.length === 0) return [];
  const { data, error } = await db
    .from('billing_accounts')
    .select('auth_user_id, stripe_customer_id, stripe_subscription_id, status, quantity')
    .in('auth_user_id', ownerIds);
  if (error) {
    throw new Error(error.message || 'Unable to load owner billing accounts.');
  }
  return (data ?? []) as BillingRow[];
}

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function countByOrg(rows: Record<string, unknown>[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const orgId = String(row.organization_id ?? '');
    if (!orgId) continue;
    map.set(orgId, (map.get(orgId) ?? 0) + 1);
  }
  return map;
}

function normalizeSort(sort: AccountSort): AccountSort {
  const direction = sort.direction === 'desc' ? 'desc' : 'asc';
  const columnMap: Record<string, string> = {
    authUserId: 'authUserId',
    ownerName: 'ownerName',
    email: 'email',
    profileState: 'profileState',
    billingStatus: 'billingStatus',
    ownedOrganizationsCount: 'ownedOrganizationsCount',
    locationsCount: 'locationsCount',
    employeesCount: 'employeesCount',
    lastShiftCreatedAt: 'lastShiftCreatedAt',
  };
  return {
    column: columnMap[sort.column] ?? 'ownerName',
    direction,
  };
}

function sortRows(rows: AccountRow[], sort: AccountSort): AccountRow[] {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const key = sort.column as keyof AccountRow;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null || av === undefined) return -1 * dir;
    if (bv === null || bv === undefined) return 1 * dir;
    return av < bv ? -1 * dir : 1 * dir;
  });
}
