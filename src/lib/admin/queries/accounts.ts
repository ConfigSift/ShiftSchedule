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

type MembershipRow = {
  auth_user_id: string;
  organization_id: string;
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

  const { data: profileRows, error: profileError } = await db
    .from('account_profiles')
    .select('auth_user_id, owner_name');

  if (profileError) {
    throw new Error(profileError.message || 'Unable to load account profiles.');
  }

  const profiles = (profileRows ?? []) as ProfileRow[];
  if (profiles.length === 0) {
    return { data: [], total: 0, page: safePage, pageSize: safePageSize };
  }

  const authUserIds = [...new Set(profiles.map((row) => String(row.auth_user_id ?? '')).filter(Boolean))];
  const [authUsersMap, billingRes, membershipsRes] = await Promise.all([
    getAuthUsersByIds(authUserIds),
    db
      .from('billing_accounts')
      .select('auth_user_id, stripe_customer_id, stripe_subscription_id, status, quantity')
      .in('auth_user_id', authUserIds),
    db
      .from('organization_memberships')
      .select('auth_user_id, organization_id')
      .in('auth_user_id', authUserIds)
      .in('role', ['owner', 'admin']),
  ]);

  const billingRows = (billingRes.data ?? []) as BillingRow[];
  const membershipRows = (membershipsRes.data ?? []) as MembershipRow[];

  const billingMap = new Map<string, BillingRow>();
  for (const row of billingRows) {
    billingMap.set(row.auth_user_id, row);
  }

  const ownerOrgsMap = new Map<string, string[]>();
  for (const membership of membershipRows) {
    const list = ownerOrgsMap.get(membership.auth_user_id) ?? [];
    list.push(membership.organization_id);
    ownerOrgsMap.set(membership.auth_user_id, list);
  }
  const allOrgIds = [...new Set([...ownerOrgsMap.values()].flat())];

  const [locationsRes, employeesRes, shiftsRes] = await Promise.all([
    allOrgIds.length
      ? db.from('locations').select('organization_id').in('organization_id', allOrgIds)
      : Promise.resolve({ data: [], error: null }),
    allOrgIds.length
      ? db.from('users').select('organization_id').in('organization_id', allOrgIds)
      : Promise.resolve({ data: [], error: null }),
    allOrgIds.length
      ? db
          .from('shifts')
          .select('organization_id, created_at')
          .in('organization_id', allOrgIds)
          .order('created_at', { ascending: false })
          .limit(10_000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const locationsByOrg = countByOrg(locationsRes.data as Record<string, unknown>[] | null);
  const employeesByOrg = countByOrg(employeesRes.data as Record<string, unknown>[] | null);
  const lastShiftByOrg = new Map<string, string>();
  for (const row of (shiftsRes.data ?? []) as { organization_id: string; created_at: string }[]) {
    if (!lastShiftByOrg.has(row.organization_id)) {
      lastShiftByOrg.set(row.organization_id, row.created_at);
    }
  }

  let rows: AccountRow[] = profiles.map((profile) => {
    const authUserId = profile.auth_user_id;
    const email = authUsersMap.get(authUserId) ?? null;
    const hasAuthUser = authUsersMap.has(authUserId);
    const ownerName = normalizeNullableText(profile.owner_name);

    const profileState: ProfileState = !hasAuthUser
      ? 'orphaned'
      : ownerName
        ? 'ok'
        : 'missing_name';

    const billing = billingMap.get(authUserId);
    const orgIds = ownerOrgsMap.get(authUserId) ?? [];

    let locationsCount = 0;
    let employeesCount = 0;
    let lastShiftCreatedAt: string | null = null;
    for (const orgId of orgIds) {
      locationsCount += locationsByOrg.get(orgId) ?? 0;
      employeesCount += employeesByOrg.get(orgId) ?? 0;
      const shiftDate = lastShiftByOrg.get(orgId);
      if (shiftDate && (!lastShiftCreatedAt || shiftDate > lastShiftCreatedAt)) {
        lastShiftCreatedAt = shiftDate;
      }
    }

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
      ownedOrganizationsCount: orgIds.length,
      locationsCount,
      employeesCount,
      lastShiftCreatedAt,
    };
  });

  if (filters.search) {
    const term = filters.search.trim().toLowerCase();
    if (term) {
      rows = rows.filter((row) =>
        row.authUserId.toLowerCase().includes(term)
        || (row.email?.toLowerCase().includes(term) ?? false)
        || (row.ownerName?.toLowerCase().includes(term) ?? false),
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

  const total = rows.length;
  rows = sortRows(rows, normalizedSort);

  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize;
  return {
    data: rows.slice(from, to),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

function normalizeNullableText(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function countByOrg(rows: Record<string, unknown>[] | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
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
  const key = sort.column as keyof AccountRow;
  const dir = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null || av === undefined) return -1 * dir;
    if (bv === null || bv === undefined) return 1 * dir;
    return av < bv ? -1 * dir : 1 * dir;
  });
}
