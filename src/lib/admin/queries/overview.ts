import { getAdminSupabase } from '@/lib/admin/supabase';
import type { AlertItem, OverviewKpis } from '@/lib/admin/types';

export type OverviewDebugInfo = {
  ownersCountStrategy: 'memberships' | 'fallback';
  ownersSample: string[];
  membershipsRoleDistinct: string[];
};

export type OverviewData = {
  kpis: OverviewKpis;
  alerts: {
    provisioningErrors: AlertItem[];
    incompleteSubscriptions: AlertItem[];
    pendingCancellations: AlertItem[];
  };
  debug?: OverviewDebugInfo;
};

export async function fetchOverviewData(): Promise<OverviewData> {
  const db = getAdminSupabase();
  const includeDebug = process.env.ADMIN_DEBUG === '1';

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const ownerResolution = await resolveOwnerAuthUsers(includeDebug);

  const [
    restaurantsTotal,
    activeSubs,
    intents7d,
    intents30d,
    newOrgs7d,
    newOrgs30d,
    shifts7d,
    shifts30d,
  ] = await Promise.all([
    db.from('organizations').select('id', { count: 'exact', head: true }),
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

  const ownerCount = ownerResolution.ownerAuthUserIds.length;
  const ownerCountExcludingAdmins = ownerResolution.ownerAuthUserIds.filter(
    (id) => !parseAdminAuthUserIds().has(id),
  ).length;

  const kpis: OverviewKpis = {
    totalOrganizations: ownerCount,
    totalLocations: restaurantsTotal.count ?? 0,
    // Kept for API shape compatibility even though the card is hidden in UI.
    totalUsers: ownerCountExcludingAdmins,
    activeSubscriptions: activeSubs.count ?? 0,
    newIntents7d: intents7d.count ?? 0,
    newIntents30d: intents30d.count ?? 0,
    newOrgs7d: newOrgs7d.count ?? 0,
    newOrgs30d: newOrgs30d.count ?? 0,
    shiftsCreated7d: shifts7d.count ?? 0,
    shiftsCreated30d: shifts30d.count ?? 0,
  };

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

  const pendingCancellations: AlertItem[] = (pendingCancelRes.data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      severity: 'warning' as const,
      category: 'subscription_past_due' as const,
      title: `Org ${String(row.organization_id ?? '').slice(0, 8)}...`,
      description: `Cancels at period end${row.current_period_end ? ` (${new Date(String(row.current_period_end)).toLocaleDateString()})` : ''}`,
      timestamp: String(row.current_period_end ?? ''),
      entityId: String(row.organization_id ?? ''),
      entityType: 'organization' as const,
    }),
  );

  return {
    kpis,
    alerts: { provisioningErrors, incompleteSubscriptions, pendingCancellations },
    ...(includeDebug
      ? {
          debug: {
            ownersCountStrategy: ownerResolution.strategy,
            ownersSample: ownerResolution.ownerAuthUserIds.slice(0, 3),
            membershipsRoleDistinct: ownerResolution.membershipsRoleDistinct,
          } satisfies OverviewDebugInfo,
        }
      : {}),
  };
}

type OwnerResolution = {
  ownerAuthUserIds: string[];
  strategy: 'memberships' | 'fallback';
  membershipsRoleDistinct: string[];
};

async function resolveOwnerAuthUsers(includeDebug: boolean): Promise<OwnerResolution> {
  const membershipOwners = await fetchMembershipOwnerIds();
  const membershipsRoleDistinct = includeDebug ? await fetchDistinctMembershipRoles() : [];

  if (membershipOwners.length > 0) {
    return {
      ownerAuthUserIds: membershipOwners,
      strategy: 'memberships',
      membershipsRoleDistinct,
    };
  }

  return {
    ownerAuthUserIds: await fetchFallbackOwnerIds(),
    strategy: 'fallback',
    membershipsRoleDistinct,
  };
}

async function fetchMembershipOwnerIds(): Promise<string[]> {
  const db = getAdminSupabase();
  const ids = new Set<string>();
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
      if (id) ids.add(id);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...ids];
}

async function fetchFallbackOwnerIds(): Promise<string[]> {
  const db = getAdminSupabase();
  const ownerIds = new Set<string>();

  const [billingRes, intentsRes, adminMembershipsRes] = await Promise.all([
    db.from('billing_accounts').select('auth_user_id'),
    db
      .from('organization_create_intents')
      .select('auth_user_id, status, organization_id')
      .or('status.eq.completed,organization_id.not.is.null'),
    db
      .from('organization_memberships')
      .select('auth_user_id')
      .ilike('role', 'admin'),
  ]);

  if (billingRes.error) {
    throw new Error(billingRes.error.message || 'Unable to load billing owners.');
  }
  if (intentsRes.error) {
    throw new Error(intentsRes.error.message || 'Unable to load completed intents.');
  }
  if (adminMembershipsRes.error) {
    throw new Error(adminMembershipsRes.error.message || 'Unable to load admin memberships.');
  }

  for (const row of (billingRes.data ?? []) as { auth_user_id: string | null }[]) {
    const id = String(row.auth_user_id ?? '').trim();
    if (id) ownerIds.add(id);
  }
  for (const row of (intentsRes.data ?? []) as { auth_user_id: string | null }[]) {
    const id = String(row.auth_user_id ?? '').trim();
    if (id) ownerIds.add(id);
  }
  for (const row of (adminMembershipsRes.data ?? []) as { auth_user_id: string | null }[]) {
    const id = String(row.auth_user_id ?? '').trim();
    if (id) ownerIds.add(id);
  }

  return [...ownerIds];
}

async function fetchDistinctMembershipRoles(): Promise<string[]> {
  const db = getAdminSupabase();
  const roles = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await db
      .from('organization_memberships')
      .select('role')
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Unable to load membership roles.');
    }

    const rows = (data ?? []) as { role: string | null }[];
    for (const row of rows) {
      const role = String(row.role ?? '').trim();
      if (role) roles.add(role);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...roles].sort();
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
