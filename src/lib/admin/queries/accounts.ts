import { getAdminSupabase } from '@/lib/admin/supabase';
import type { AccountRow } from '@/lib/admin/types';

// ---------------------------------------------------------------------------
// Filter / pagination types
// ---------------------------------------------------------------------------

export type AccountFilters = {
  search?: string;
  billingStatus?: string;
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

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

export async function getAccountsList(
  filters: AccountFilters = {},
  page = 1,
  pageSize = 25,
  sort: AccountSort = { column: 'ownerName', direction: 'asc' },
): Promise<AccountListResult> {
  const db = getAdminSupabase();

  // -------------------------------------------------------------------------
  // 1. Get distinct owner auth_user_ids from admin memberships
  // -------------------------------------------------------------------------
  const { data: adminMemberships } = await db
    .from('organization_memberships')
    .select('auth_user_id')
    .eq('role', 'admin');

  if (!adminMemberships || adminMemberships.length === 0) {
    return { data: [], total: 0, page, pageSize };
  }

  // Deduplicate auth_user_ids
  const uniqueIds = [
    ...new Set(adminMemberships.map((m) => String(m.auth_user_id))),
  ];

  // -------------------------------------------------------------------------
  // 2. Fetch profiles, billing, memberships, and counts in parallel
  // -------------------------------------------------------------------------
  const [profilesRes, billingRes, membershipsRes] = await Promise.all([
    // account_profiles for owner names
    db
      .from('account_profiles')
      .select('auth_user_id, owner_name, account_type')
      .in('auth_user_id', uniqueIds),

    // billing_accounts for billing info
    db
      .from('billing_accounts')
      .select(
        'auth_user_id, stripe_customer_id, stripe_subscription_id, status, quantity',
      )
      .in('auth_user_id', uniqueIds),

    // all admin memberships with org_ids for aggregation
    db
      .from('organization_memberships')
      .select('auth_user_id, organization_id')
      .eq('role', 'admin')
      .in('auth_user_id', uniqueIds),
  ]);

  // Build lookup maps
  type ProfileRow = { auth_user_id: string; owner_name: string | null; account_type: string | null };
  const profileMap = new Map<string, ProfileRow>();
  for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
    profileMap.set(p.auth_user_id, p);
  }

  type BillingRow = {
    auth_user_id: string;
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
    status: string;
    quantity: number;
  };
  const billingMap = new Map<string, BillingRow>();
  for (const b of (billingRes.data ?? []) as BillingRow[]) {
    billingMap.set(b.auth_user_id, b);
  }

  // Map: auth_user_id → org_ids they own
  const ownerOrgsMap = new Map<string, string[]>();
  for (const m of (membershipsRes.data ?? []) as { auth_user_id: string; organization_id: string }[]) {
    const list = ownerOrgsMap.get(m.auth_user_id) ?? [];
    list.push(m.organization_id);
    ownerOrgsMap.set(m.auth_user_id, list);
  }

  // Collect ALL org IDs across all owners for batch count queries
  const allOrgIds = [...new Set([...ownerOrgsMap.values()].flat())];

  // -------------------------------------------------------------------------
  // 3. Batch count queries for locations, employees, last shift
  // -------------------------------------------------------------------------
  const [locationsRes, employeesRes, shiftsRes] = await Promise.all([
    allOrgIds.length > 0
      ? db
          .from('locations')
          .select('organization_id')
          .in('organization_id', allOrgIds)
      : Promise.resolve({ data: [] }),

    allOrgIds.length > 0
      ? db
          .from('users')
          .select('organization_id')
          .in('organization_id', allOrgIds)
      : Promise.resolve({ data: [] }),

    allOrgIds.length > 0
      ? db
          .from('shifts')
          .select('organization_id, created_at')
          .in('organization_id', allOrgIds)
          .order('created_at', { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);

  // Count-by-org helpers
  const locationsByOrg = countByOrg(locationsRes.data);
  const employeesByOrg = countByOrg(employeesRes.data);

  // Last shift per org
  const lastShiftByOrg = new Map<string, string>();
  for (const s of (shiftsRes.data ?? []) as { organization_id: string; created_at: string }[]) {
    if (!lastShiftByOrg.has(s.organization_id)) {
      lastShiftByOrg.set(s.organization_id, s.created_at);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Assemble AccountRow[] per auth_user_id
  // -------------------------------------------------------------------------
  let rows: AccountRow[] = uniqueIds.map((authUserId) => {
    const profile = profileMap.get(authUserId);
    const billing = billingMap.get(authUserId);
    const orgIds = ownerOrgsMap.get(authUserId) ?? [];

    let locCount = 0;
    let empCount = 0;
    let latestShift: string | null = null;

    for (const orgId of orgIds) {
      locCount += locationsByOrg.get(orgId) ?? 0;
      empCount += employeesByOrg.get(orgId) ?? 0;
      const shiftDate = lastShiftByOrg.get(orgId);
      if (shiftDate && (!latestShift || shiftDate > latestShift)) {
        latestShift = shiftDate;
      }
    }

    return {
      authUserId,
      ownerName: profile?.owner_name ?? null,
      billingStatus: billing?.status ?? null,
      stripeCustomerId: billing?.stripe_customer_id ?? null,
      stripeSubscriptionId: billing?.stripe_subscription_id ?? null,
      quantity: billing?.quantity ?? null,
      ownedOrganizationsCount: orgIds.length,
      locationsCount: locCount,
      employeesCount: empCount,
      lastShiftCreatedAt: latestShift,
    };
  });

  // -------------------------------------------------------------------------
  // 5. Apply filters
  // -------------------------------------------------------------------------
  if (filters.search) {
    const term = filters.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.ownerName?.toLowerCase().includes(term) ?? false) ||
        r.authUserId.toLowerCase().includes(term),
    );
  }

  if (filters.billingStatus) {
    const target = filters.billingStatus;
    rows = rows.filter((r) =>
      target === 'none' ? r.billingStatus === null : r.billingStatus === target,
    );
  }

  const total = rows.length;

  // -------------------------------------------------------------------------
  // 6. Sort
  // -------------------------------------------------------------------------
  const dir = sort.direction === 'asc' ? 1 : -1;
  const key = camelToRow(sort.column) as keyof AccountRow;
  rows.sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  // -------------------------------------------------------------------------
  // 7. Paginate
  // -------------------------------------------------------------------------
  const from = (page - 1) * pageSize;
  const paged = rows.slice(from, from + pageSize);

  return { data: paged, total, page, pageSize };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByOrg(
  rows: Record<string, unknown>[] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!rows) return map;
  for (const row of rows) {
    const orgId = String(row.organization_id ?? '');
    map.set(orgId, (map.get(orgId) ?? 0) + 1);
  }
  return map;
}

/** Ensure column name maps back to AccountRow keys */
function camelToRow(col: string): string {
  // Already camelCase — return as-is for known keys
  const valid = [
    'authUserId',
    'ownerName',
    'billingStatus',
    'ownedOrganizationsCount',
    'locationsCount',
    'employeesCount',
    'lastShiftCreatedAt',
  ];
  if (valid.includes(col)) return col;
  return 'ownerName';
}
