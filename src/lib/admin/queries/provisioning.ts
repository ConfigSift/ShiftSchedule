import { getAdminSupabase } from '@/lib/admin/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProvisioningRow = {
  id: string;
  authUserId: string;
  ownerName: string | null;
  restaurantName: string;
  status: string;
  organizationId: string | null;
  orgName: string | null;
  desiredQuantity: number;
  lastError: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ProvisioningFilters = {
  status?: string;
  hasError?: boolean;
  createdAfter?: string;
  createdBefore?: string;
};

export type ProvisioningSort = {
  column: string;
  direction: 'asc' | 'desc';
};

export type ProvisioningListResult = {
  data: ProvisioningRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProvisioningSummary = {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  canceled: number;
  withErrors: number;
};

// ---------------------------------------------------------------------------
// Intent statuses
// ---------------------------------------------------------------------------

export const INTENT_STATUSES = ['pending', 'completed', 'canceled', 'failed'] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const INTENT_STATUS_COLORS: Record<IntentStatus, string> = {
  pending: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  canceled: 'bg-zinc-100 text-zinc-600',
  failed: 'bg-red-100 text-red-700',
};

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

export async function getProvisioningList(
  filters: ProvisioningFilters = {},
  page = 1,
  pageSize = 25,
  sort: ProvisioningSort = { column: 'created_at', direction: 'desc' },
): Promise<ProvisioningListResult> {
  const db = getAdminSupabase();

  // -------------------------------------------------------------------------
  // 1. Fetch intents with embedded org
  // -------------------------------------------------------------------------
  let query = db
    .from('organization_create_intents')
    .select(
      'id, auth_user_id, restaurant_name, status, organization_id, desired_quantity, last_error, created_at, updated_at, organizations(name)',
      { count: 'exact' },
    );

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.hasError === true) {
    query = query.not('last_error', 'is', null);
  }
  if (filters.createdAfter) {
    query = query.gte('created_at', filters.createdAfter);
  }
  if (filters.createdBefore) {
    query = query.lte('created_at', filters.createdBefore);
  }

  const dbCol = mapSortCol(sort.column);
  query = query.order(dbCol, { ascending: sort.direction === 'asc' });

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data: rows, count: totalCount, error } = await query;

  if (error || !rows) {
    return { data: [], total: 0, page, pageSize };
  }

  // -------------------------------------------------------------------------
  // 2. Resolve owner names
  // -------------------------------------------------------------------------
  const authIds = [...new Set(rows.map((r: Record<string, unknown>) => String(r.auth_user_id)))];
  const ownerMap = await resolveOwnerNames(db, authIds);

  // -------------------------------------------------------------------------
  // 3. Assemble rows
  // -------------------------------------------------------------------------
  type RawRow = {
    id: string;
    auth_user_id: string;
    restaurant_name: string;
    status: string;
    organization_id: string | null;
    desired_quantity: number;
    last_error: unknown;
    created_at: string;
    updated_at: string;
    organizations: { name: string } | { name: string }[] | null;
  };

  const data: ProvisioningRow[] = (rows as RawRow[]).map((r) => {
    const org = Array.isArray(r.organizations)
      ? r.organizations[0]
      : r.organizations;
    return {
      id: r.id,
      authUserId: r.auth_user_id,
      ownerName: ownerMap.get(r.auth_user_id) ?? null,
      restaurantName: r.restaurant_name,
      status: r.status,
      organizationId: r.organization_id,
      orgName: org?.name ?? null,
      desiredQuantity: r.desired_quantity,
      lastError: r.last_error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  return { data, total: totalCount ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Summary aggregates
// ---------------------------------------------------------------------------

export async function getProvisioningSummary(): Promise<ProvisioningSummary> {
  const db = getAdminSupabase();

  const { data: rows } = await db
    .from('organization_create_intents')
    .select('status, last_error');

  const all = (rows ?? []) as { status: string; last_error: unknown }[];

  let completed = 0;
  let failed = 0;
  let pending = 0;
  let canceled = 0;
  let withErrors = 0;

  for (const r of all) {
    if (r.status === 'completed') completed++;
    else if (r.status === 'failed') failed++;
    else if (r.status === 'pending') pending++;
    else if (r.status === 'canceled') canceled++;
    if (r.last_error != null) withErrors++;
  }

  return {
    total: all.length,
    completed,
    failed,
    pending,
    canceled,
    withErrors,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveOwnerNames(
  db: ReturnType<typeof getAdminSupabase>,
  authIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (authIds.length === 0) return map;

  const { data } = await db
    .from('account_profiles')
    .select('auth_user_id, owner_name')
    .in('auth_user_id', authIds);

  for (const r of (data ?? []) as { auth_user_id: string; owner_name: string | null }[]) {
    if (r.owner_name) map.set(r.auth_user_id, r.owner_name);
  }

  return map;
}

function mapSortCol(col: string): string {
  const mapping: Record<string, string> = {
    created_at: 'created_at',
    createdAt: 'created_at',
    status: 'status',
    restaurantName: 'restaurant_name',
    restaurant_name: 'restaurant_name',
    desiredQuantity: 'desired_quantity',
    desired_quantity: 'desired_quantity',
  };
  return mapping[col] ?? 'created_at';
}
