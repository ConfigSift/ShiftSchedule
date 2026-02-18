import { getAdminSupabase } from '@/lib/admin/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionRow = {
  id: string;
  orgId: string;
  orgName: string;
  restaurantCode: string;
  ownerName: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceId: string;
  quantity: number;
};

export type SubscriptionFilters = {
  search?: string;
  status?: string;
  priceId?: string;
  cancelAtPeriodEnd?: boolean;
  periodEndBefore?: string;
  periodEndAfter?: string;
};

export type SubscriptionSort = {
  column: string;
  direction: 'asc' | 'desc';
};

export type SubscriptionListResult = {
  data: SubscriptionRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type SubscriptionAggregates = {
  byStatus: Record<string, number>;
  byPriceId: Record<string, number>;
  cancelPending: number;
  orgsWithoutSubscription: number;
};

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

export async function getSubscriptionsList(
  filters: SubscriptionFilters = {},
  page = 1,
  pageSize = 25,
  sort: SubscriptionSort = { column: 'current_period_end', direction: 'asc' },
): Promise<SubscriptionListResult> {
  const db = getAdminSupabase();

  // -------------------------------------------------------------------------
  // 1. Fetch subscriptions with embedded org
  // -------------------------------------------------------------------------
  let query = db
    .from('subscriptions')
    .select(
      'id, organization_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_price_id, quantity, organizations(name, restaurant_code)',
      { count: 'exact' },
    );

  // Filters that can be pushed to PostgREST
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.priceId) {
    query = query.eq('stripe_price_id', filters.priceId);
  }
  if (filters.cancelAtPeriodEnd !== undefined) {
    query = query.eq('cancel_at_period_end', filters.cancelAtPeriodEnd);
  }
  if (filters.periodEndAfter) {
    query = query.gte('current_period_end', filters.periodEndAfter);
  }
  if (filters.periodEndBefore) {
    query = query.lte('current_period_end', filters.periodEndBefore);
  }

  // Sort — map camelCase column names to db columns
  const dbSortCol = mapSortColumn(sort.column);
  query = query.order(dbSortCol, { ascending: sort.direction === 'asc' });

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data: rows, count: totalCount, error } = await query;

  if (error || !rows) {
    return { data: [], total: 0, page, pageSize };
  }

  // -------------------------------------------------------------------------
  // 2. Resolve owner names via admin memberships
  // -------------------------------------------------------------------------
  const orgIds = rows.map((r: Record<string, unknown>) =>
    String(r.organization_id),
  );

  const ownerMap = await resolveOwnerNames(db, orgIds);

  // -------------------------------------------------------------------------
  // 3. Assemble rows
  // -------------------------------------------------------------------------
  type RawRow = {
    id: string;
    organization_id: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_price_id: string;
    quantity: number;
    organizations:
      | { name: string; restaurant_code: string }
      | { name: string; restaurant_code: string }[]
      | null;
  };

  let result: SubscriptionRow[] = (rows as RawRow[]).map((r) => {
    const org = Array.isArray(r.organizations)
      ? r.organizations[0]
      : r.organizations;
    return {
      id: r.id,
      orgId: r.organization_id,
      orgName: org?.name ?? '',
      restaurantCode: org?.restaurant_code ?? '',
      ownerName: ownerMap.get(r.organization_id) ?? null,
      status: r.status,
      currentPeriodStart: r.current_period_start,
      currentPeriodEnd: r.current_period_end,
      cancelAtPeriodEnd: r.cancel_at_period_end,
      priceId: r.stripe_price_id,
      quantity: r.quantity,
    };
  });

  // Client-side search filter (name/code/owner — can't push ILIKE across join)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    result = result.filter(
      (r) =>
        r.orgName.toLowerCase().includes(term) ||
        r.restaurantCode.toLowerCase().includes(term) ||
        (r.ownerName?.toLowerCase().includes(term) ?? false),
    );
  }

  return { data: result, total: totalCount ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export async function getSubscriptionAggregates(): Promise<SubscriptionAggregates> {
  const db = getAdminSupabase();

  const [allSubsRes, orgsCountRes] = await Promise.all([
    db
      .from('subscriptions')
      .select('status, stripe_price_id, cancel_at_period_end'),
    db.from('organizations').select('id', { count: 'exact', head: true }),
  ]);

  const allSubs = (allSubsRes.data ?? []) as {
    status: string;
    stripe_price_id: string;
    cancel_at_period_end: boolean;
  }[];

  const byStatus: Record<string, number> = {};
  const byPriceId: Record<string, number> = {};
  let cancelPending = 0;

  for (const sub of allSubs) {
    byStatus[sub.status] = (byStatus[sub.status] ?? 0) + 1;
    byPriceId[sub.stripe_price_id] = (byPriceId[sub.stripe_price_id] ?? 0) + 1;
    if (sub.cancel_at_period_end) cancelPending++;
  }

  const totalOrgs = orgsCountRes.count ?? 0;
  const orgsWithSub = allSubs.length;
  const orgsWithoutSubscription = Math.max(0, totalOrgs - orgsWithSub);

  return { byStatus, byPriceId, cancelPending, orgsWithoutSubscription };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveOwnerNames(
  db: ReturnType<typeof getAdminSupabase>,
  orgIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (orgIds.length === 0) return map;

  const { data: memberships } = await db
    .from('organization_memberships')
    .select('organization_id, auth_user_id, users(full_name)')
    .eq('role', 'admin')
    .in('organization_id', orgIds);

  type MRow = {
    organization_id: string;
    auth_user_id: string;
    users: { full_name: string } | { full_name: string }[] | null;
  };

  for (const m of (memberships ?? []) as MRow[]) {
    if (map.has(m.organization_id)) continue;
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    if (u?.full_name) map.set(m.organization_id, u.full_name);
  }

  return map;
}

function mapSortColumn(col: string): string {
  const mapping: Record<string, string> = {
    orgName: 'organization_id',
    status: 'status',
    currentPeriodEnd: 'current_period_end',
    currentPeriodStart: 'current_period_start',
    priceId: 'stripe_price_id',
    cancelAtPeriodEnd: 'cancel_at_period_end',
    quantity: 'quantity',
    current_period_end: 'current_period_end',
  };
  return mapping[col] ?? 'current_period_end';
}
