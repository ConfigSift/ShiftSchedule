import { getAdminSupabase } from '@/lib/admin/supabase';
import { getAuthUsersByIds } from '@/lib/admin/authUsers';
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

export type AccountListResult = {
  data: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
};

type OwnerMembershipRow = {
  auth_user_id: string;
  organization_id: string;
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

  const ownerMemberships = await fetchOwnerMemberships();
  if (ownerMemberships.length === 0) {
    return { data: [], total: 0, page: safePage, pageSize: safePageSize };
  }

  const ownerIds = [...new Set(ownerMemberships.map((row) => row.auth_user_id))];
  const orgIdsByOwner = new Map<string, string[]>();
  for (const row of ownerMemberships) {
    const list = orgIdsByOwner.get(row.auth_user_id) ?? [];
    list.push(row.organization_id);
    orgIdsByOwner.set(row.auth_user_id, list);
  }
  const allOwnedOrgIds = [...new Set(ownerMemberships.map((row) => row.organization_id))];

  const [profiles, billingRows, authUsersMap, usersRows, shiftsRows] = await Promise.all([
    fetchProfilesByOwnerIds(ownerIds),
    fetchBillingByOwnerIds(ownerIds),
    getAuthUsersByIds(ownerIds),
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

  let rows: AccountRow[] = ownerIds.map((authUserId) => {
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
      // In this admin directory, locations means restaurants owned by this owner.
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
  };
}

async function fetchOwnerMemberships(): Promise<OwnerMembershipRow[]> {
  const db = getAdminSupabase();
  const pageSize = 1000;
  const rows: OwnerMembershipRow[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await db
      .from('organization_memberships')
      .select('auth_user_id, organization_id')
      .eq('role', 'owner')
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Unable to load owner memberships.');
    }

    const pageRows = (data ?? []) as OwnerMembershipRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    from += pageSize;
  }

  return rows;
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
