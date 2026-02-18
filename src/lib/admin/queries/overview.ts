import { getAdminSupabase } from '@/lib/admin/supabase';
import type { OverviewKpis, AlertItem } from '@/lib/admin/types';

export type OverviewData = {
  kpis: OverviewKpis;
  alerts: {
    provisioningErrors: AlertItem[];
    incompleteSubscriptions: AlertItem[];
    pendingCancellations: AlertItem[];
  };
};

export async function fetchOverviewData(): Promise<OverviewData> {
  const db = getAdminSupabase();

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // -------------------------------------------------------------------------
  // KPI queries
  // -------------------------------------------------------------------------
  const [
    restaurantsTotal,
    ownerAuthUserIds,
    activeSubs,
    intents7d,
    intents30d,
    newOrgs7d,
    newOrgs30d,
    shifts7d,
    shifts30d,
  ] = await Promise.all([
    db.from('organizations').select('id', { count: 'exact', head: true }),
    fetchDistinctOwnerAuthUserIds(),
    db
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'trialing']),
    db
      .from('organization_create_intents')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', d7),
    db
      .from('organization_create_intents')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', d30),
    db
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', d7),
    db
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', d30),
    db
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', d7),
    db
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', d30),
  ]);

  const adminIds = parseAdminAuthUserIds();
  const ownerCount = ownerAuthUserIds.length;
  const ownerCountExcludingAdmins = ownerAuthUserIds.filter((id) => !adminIds.has(id)).length;

  const kpis: OverviewKpis = {
    // KPI semantics:
    // totalOrganizations => unique restaurant owner accounts
    // totalLocations => restaurants (organizations rows)
    // totalUsers => owner accounts excluding platform admin allow-list IDs
    totalOrganizations: ownerCount,
    totalLocations: restaurantsTotal.count ?? 0,
    totalUsers: ownerCountExcludingAdmins,
    activeSubscriptions: activeSubs.count ?? 0,
    newIntents7d: intents7d.count ?? 0,
    newIntents30d: intents30d.count ?? 0,
    newOrgs7d: newOrgs7d.count ?? 0,
    newOrgs30d: newOrgs30d.count ?? 0,
    shiftsCreated7d: shifts7d.count ?? 0,
    shiftsCreated30d: shifts30d.count ?? 0,
  };

  // -------------------------------------------------------------------------
  // Alert queries
  // -------------------------------------------------------------------------
  const [provErrorsRes, incompletSubsRes, pendingCancelRes] = await Promise.all([
    db
      .from('organization_create_intents')
      .select('id, auth_user_id, restaurant_name, status, last_error, created_at')
      .not('last_error', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10),

    db
      .from('organizations')
      .select('id, name, restaurant_code, created_at, subscriptions(status)')
      .limit(10),

    db
      .from('subscriptions')
      .select('id, organization_id, status, current_period_end, cancel_at_period_end')
      .eq('cancel_at_period_end', true)
      .order('current_period_end', { ascending: true })
      .limit(10),
  ]);

  // --- Provisioning errors ---------------------------------------------------
  const provisioningErrors: AlertItem[] = (provErrorsRes.data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      severity: 'error' as const,
      category: 'provisioning_error' as const,
      title: `Failed: ${row.restaurant_name ?? 'Unknown'}`,
      description: summarizeError(row.last_error),
      timestamp: String(row.created_at ?? ''),
      entityId: String(row.id ?? ''),
      entityType: 'intent' as const,
    }),
  );

  // --- Incomplete subscriptions ----------------------------------------------
  type OrgSubRow = {
    id: string;
    name: string;
    restaurant_code: string;
    created_at: string;
    subscriptions: { status: string }[] | { status: string } | null;
  };

  const incompleteSubscriptions: AlertItem[] = (
    (incompletSubsRes.data ?? []) as OrgSubRow[]
  )
    .filter((row) => {
      const subs = Array.isArray(row.subscriptions)
        ? row.subscriptions
        : row.subscriptions
          ? [row.subscriptions]
          : [];
      return (
        subs.length === 0 ||
        !subs.some((s) => s.status === 'active' || s.status === 'trialing')
      );
    })
    .map((row) => ({
      id: row.id,
      severity: 'warning' as const,
      category: 'subscription_incomplete' as const,
      title: row.name || row.restaurant_code,
      description: 'Organization has no active subscription.',
      timestamp: row.created_at,
      entityId: row.id,
      entityType: 'organization' as const,
    }));

  // --- Pending cancellations -------------------------------------------------
  const pendingCancellations: AlertItem[] = (pendingCancelRes.data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      severity: 'warning' as const,
      category: 'subscription_past_due' as const,
      title: `Org ${String(row.organization_id ?? '').slice(0, 8)}…`,
      description: `Cancels at period end${row.current_period_end ? ` (${new Date(String(row.current_period_end)).toLocaleDateString()})` : ''}`,
      timestamp: String(row.current_period_end ?? ''),
      entityId: String(row.organization_id ?? ''),
      entityType: 'organization' as const,
    }),
  );

  return {
    kpis,
    alerts: { provisioningErrors, incompleteSubscriptions, pendingCancellations },
  };
}

async function fetchDistinctOwnerAuthUserIds(): Promise<string[]> {
  const db = getAdminSupabase();
  const pageSize = 1000;
  const ids = new Set<string>();
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await db
      .from('organization_memberships')
      .select('auth_user_id')
      .eq('role', 'owner')
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Unable to load owner memberships.');
    }

    const rows = (data ?? []) as { auth_user_id: string | null }[];
    for (const row of rows) {
      const id = String(row.auth_user_id ?? '').trim();
      if (id) ids.add(id);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...ids];
}

function parseAdminAuthUserIds(): Set<string> {
  const raw = String(process.env.ADMIN_AUTH_USER_IDS ?? '').trim();
  if (!raw) return new Set<string>();
  return new Set(raw.split(',').map((id) => id.trim()).filter(Boolean));
}

function summarizeError(raw: unknown): string {
  if (!raw) return 'Unknown error';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return String(obj.message ?? obj.error ?? JSON.stringify(raw)).slice(0, 200);
  }
  return String(raw).slice(0, 200);
}
