import { getAdminSupabase } from '@/lib/admin/supabase';
import { ACTIVATION_THRESHOLD } from '@/lib/admin/constants';
import type { ActivationStage, RestaurantRow } from '@/lib/admin/types';

// ---------------------------------------------------------------------------
// Filter / pagination types
// ---------------------------------------------------------------------------

export type RestaurantFilters = {
  search?: string;
  subscriptionStatus?: string;
  activationStage?: ActivationStage;
  createdAfter?: string;
  createdBefore?: string;
};

export type RestaurantSort = {
  column: string;
  direction: 'asc' | 'desc';
};

export type RestaurantListResult = {
  data: RestaurantRow[];
  total: number;
  page: number;
  pageSize: number;
};

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

export async function getRestaurantsList(
  filters: RestaurantFilters = {},
  page = 1,
  pageSize = 25,
  sort: RestaurantSort = { column: 'created_at', direction: 'desc' },
): Promise<RestaurantListResult> {
  const db = getAdminSupabase();

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // -------------------------------------------------------------------------
  // 1. Fetch organizations with embedded subscription
  // -------------------------------------------------------------------------
  let orgQuery = db
    .from('organizations')
    .select(
      'id, name, restaurant_code, created_at, subscriptions(status, current_period_end, cancel_at_period_end, stripe_price_id)',
      { count: 'exact' },
    );

  // Search filter — name or restaurant_code
  if (filters.search) {
    const term = `%${filters.search}%`;
    orgQuery = orgQuery.or(`name.ilike.${term},restaurant_code.ilike.${term}`);
  }

  // Date range filters
  if (filters.createdAfter) {
    orgQuery = orgQuery.gte('created_at', filters.createdAfter);
  }
  if (filters.createdBefore) {
    orgQuery = orgQuery.lte('created_at', filters.createdBefore);
  }

  // Sorting on org columns
  const orgSortColumns = ['name', 'restaurant_code', 'created_at'];
  if (orgSortColumns.includes(sort.column)) {
    orgQuery = orgQuery.order(sort.column, { ascending: sort.direction === 'asc' });
  } else {
    orgQuery = orgQuery.order('created_at', { ascending: false });
  }

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  orgQuery = orgQuery.range(from, to);

  const { data: orgs, count: totalCount, error: orgError } = await orgQuery;

  if (orgError || !orgs) {
    return { data: [], total: 0, page, pageSize };
  }

  if (orgs.length === 0) {
    return { data: [], total: totalCount ?? 0, page, pageSize };
  }

  const orgIds = orgs.map((o: Record<string, unknown>) => String(o.id));

  // -------------------------------------------------------------------------
  // 2. Parallel sub-queries for counts and owner info
  // -------------------------------------------------------------------------
  const [
    locationsRes,
    employeesRes,
    activeEmployeesRes,
    shifts7dRes,
    shifts30dRes,
    timeOff30dRes,
    exchange30dRes,
    ownersRes,
  ] = await Promise.all([
    // Locations count per org
    db
      .from('locations')
      .select('organization_id')
      .in('organization_id', orgIds),

    // All employees per org
    db
      .from('users')
      .select('organization_id')
      .in('organization_id', orgIds),

    // Active employees per org
    db
      .from('users')
      .select('organization_id')
      .in('organization_id', orgIds)
      .eq('is_active', true),

    // Shifts 7d
    db
      .from('shifts')
      .select('organization_id')
      .in('organization_id', orgIds)
      .gte('created_at', d7),

    // Shifts 30d
    db
      .from('shifts')
      .select('organization_id')
      .in('organization_id', orgIds)
      .gte('created_at', d30),

    // Time off 30d
    db
      .from('time_off_requests')
      .select('organization_id')
      .in('organization_id', orgIds)
      .gte('created_at', d30),

    // Shift exchange 30d
    db
      .from('shift_exchange_requests')
      .select('organization_id')
      .in('organization_id', orgIds)
      .gte('created_at', d30),

    // Owner: first admin membership per org, joined to users for name
    db
      .from('organization_memberships')
      .select('organization_id, auth_user_id, user_id, users(full_name)')
      .in('organization_id', orgIds)
      .eq('role', 'admin'),
  ]);

  // -------------------------------------------------------------------------
  // 3. Build count maps
  // -------------------------------------------------------------------------
  const locationsMap = countByOrg(locationsRes.data);
  const employeesMap = countByOrg(employeesRes.data);
  const activeEmployeesMap = countByOrg(activeEmployeesRes.data);
  const shifts7dMap = countByOrg(shifts7dRes.data);
  const shifts30dMap = countByOrg(shifts30dRes.data);
  const timeOff30dMap = countByOrg(timeOff30dRes.data);
  const exchange30dMap = countByOrg(exchange30dRes.data);

  // Owner map: orgId → { authUserId, name }
  type OwnerRow = {
    organization_id: string;
    auth_user_id: string;
    user_id: string | null;
    users: { full_name: string } | { full_name: string }[] | null;
  };
  const ownerMap = new Map<string, { authUserId: string; name: string | null }>();
  for (const row of (ownersRes.data ?? []) as OwnerRow[]) {
    const orgId = row.organization_id;
    if (ownerMap.has(orgId)) continue; // first admin wins
    const usersData = Array.isArray(row.users) ? row.users[0] : row.users;
    const name = usersData?.full_name || null;
    ownerMap.set(orgId, { authUserId: row.auth_user_id, name });
  }

  // -------------------------------------------------------------------------
  // 4. Assemble RestaurantRow[]
  // -------------------------------------------------------------------------
  type OrgRow = {
    id: string;
    name: string;
    restaurant_code: string;
    created_at: string;
    subscriptions:
      | { status: string; current_period_end: string | null; cancel_at_period_end: boolean; stripe_price_id: string | null }
      | { status: string; current_period_end: string | null; cancel_at_period_end: boolean; stripe_price_id: string | null }[]
      | null;
  };

  let rows: RestaurantRow[] = (orgs as OrgRow[]).map((org) => {
    const sub = Array.isArray(org.subscriptions)
      ? org.subscriptions[0] ?? null
      : org.subscriptions;

    const orgId = org.id;
    const locCount = locationsMap.get(orgId) ?? 0;
    const empCount = employeesMap.get(orgId) ?? 0;
    const activeEmpCount = activeEmployeesMap.get(orgId) ?? 0;
    const s7d = shifts7dMap.get(orgId) ?? 0;
    const s30d = shifts30dMap.get(orgId) ?? 0;
    const to30d = timeOff30dMap.get(orgId) ?? 0;
    const ex30d = exchange30dMap.get(orgId) ?? 0;
    const owner = ownerMap.get(orgId);

    const stage = computeActivationStage(empCount, s7d, s30d, sub?.status);

    return {
      orgId,
      name: org.name,
      restaurantCode: org.restaurant_code,
      timezone: '',
      ownerAuthUserId: owner?.authUserId ?? null,
      ownerName: owner?.name ?? null,
      subscriptionStatus: sub?.status ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? null,
      priceId: sub?.stripe_price_id ?? null,
      locationsCount: locCount,
      employeesCount: empCount,
      activeEmployeesCount: activeEmpCount,
      shifts7d: s7d,
      shifts30d: s30d,
      timeOff30d: to30d,
      exchange30d: ex30d,
      activationStage: stage,
    };
  });

  // -------------------------------------------------------------------------
  // 5. Client-side filters that can't be pushed to Supabase
  // -------------------------------------------------------------------------
  if (filters.subscriptionStatus) {
    const target = filters.subscriptionStatus;
    rows = rows.filter((r) =>
      target === 'none' ? r.subscriptionStatus === null : r.subscriptionStatus === target,
    );
  }

  if (filters.activationStage !== undefined) {
    const target = filters.activationStage;
    rows = rows.filter((r) => r.activationStage === target);
  }

  // -------------------------------------------------------------------------
  // 6. Client-side sort for computed columns
  // -------------------------------------------------------------------------
  if (!orgSortColumns.includes(sort.column)) {
    const dir = sort.direction === 'asc' ? 1 : -1;
    const key = sort.column as keyof RestaurantRow;
    rows.sort((a, b) => {
      const av = a[key] ?? 0;
      const bv = b[key] ?? 0;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  return {
    data: rows,
    total: totalCount ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByOrg(
  rows: Record<string, unknown>[] | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!rows) return map;
  for (const row of rows) {
    const orgId = String(row.organization_id ?? '');
    map.set(orgId, (map.get(orgId) ?? 0) + 1);
  }
  return map;
}

function computeActivationStage(
  employeesCount: number,
  shifts7d: number,
  shifts30d: number,
  subStatus: string | null | undefined,
): ActivationStage {
  if (employeesCount === 0) return 0;
  if (shifts30d === 0) return 1;
  const isActive = shifts7d >= ACTIVATION_THRESHOLD;
  const hasSub = subStatus === 'active' || subStatus === 'trialing';
  if (isActive && hasSub) return 4;
  if (isActive) return 3;
  return 2;
}
