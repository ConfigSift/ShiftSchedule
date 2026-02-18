import { getAdminSupabase } from '@/lib/admin/supabase';
import { ACTIVATION_THRESHOLD } from '@/lib/admin/constants';
import type { ActivationStage } from '@/lib/admin/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountProfile = {
  authUserId: string;
  ownerName: string | null;
  accountType: string | null;
};

export type AccountBilling = {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
  quantity: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
} | null;

export type OwnedOrgRow = {
  orgId: string;
  name: string;
  restaurantCode: string;
  subscriptionStatus: string | null;
  locationsCount: number;
  employeesCount: number;
  activationStage: ActivationStage;
};

export type RecentActivityRow = {
  type: 'shift' | 'time_off' | 'exchange';
  orgId: string;
  orgName: string;
  createdAt: string;
};

export type AccountDetailData = {
  profile: AccountProfile;
  billing: AccountBilling;
  ownedOrgs: OwnedOrgRow[];
  recentActivity: RecentActivityRow[];
};

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

export async function getAccountDetail(
  authUserId: string,
): Promise<AccountDetailData | null> {
  const db = getAdminSupabase();

  // -------------------------------------------------------------------------
  // 1. Profile + billing + admin memberships — parallel
  // -------------------------------------------------------------------------
  const [profileRes, billingRes, membershipsRes] = await Promise.all([
    db
      .from('account_profiles')
      .select('auth_user_id, owner_name, account_type')
      .eq('auth_user_id', authUserId)
      .maybeSingle(),

    db
      .from('billing_accounts')
      .select(
        'stripe_customer_id, stripe_subscription_id, status, quantity, cancel_at_period_end, current_period_end',
      )
      .eq('auth_user_id', authUserId)
      .maybeSingle(),

    db
      .from('organization_memberships')
      .select('organization_id')
      .eq('auth_user_id', authUserId)
      .eq('role', 'admin'),
  ]);

  // If no profile and no memberships, treat as not found
  if (!profileRes.data && (!membershipsRes.data || membershipsRes.data.length === 0)) {
    return null;
  }

  const profile: AccountProfile = {
    authUserId,
    ownerName: (profileRes.data as Record<string, unknown> | null)?.owner_name as string | null ?? null,
    accountType: (profileRes.data as Record<string, unknown> | null)?.account_type as string | null ?? null,
  };

  const billingRaw = billingRes.data as Record<string, unknown> | null;
  const billing: AccountBilling = billingRaw
    ? {
        stripeCustomerId: String(billingRaw.stripe_customer_id),
        stripeSubscriptionId: billingRaw.stripe_subscription_id
          ? String(billingRaw.stripe_subscription_id)
          : null,
        status: String(billingRaw.status),
        quantity: Number(billingRaw.quantity ?? 0),
        cancelAtPeriodEnd: Boolean(billingRaw.cancel_at_period_end),
        currentPeriodEnd: billingRaw.current_period_end
          ? String(billingRaw.current_period_end)
          : null,
      }
    : null;

  const orgIds = (membershipsRes.data ?? []).map((m) =>
    String((m as Record<string, unknown>).organization_id),
  );

  if (orgIds.length === 0) {
    return { profile, billing, ownedOrgs: [], recentActivity: [] };
  }

  // -------------------------------------------------------------------------
  // 2. Org details + counts — parallel
  // -------------------------------------------------------------------------
  const [orgsRes, locationsRes, employeesRes, shifts7dRes, shifts30dRes, recentShiftsRes] =
    await Promise.all([
      db
        .from('organizations')
        .select('id, name, restaurant_code, subscriptions(status)')
        .in('id', orgIds),

      db.from('locations').select('organization_id').in('organization_id', orgIds),

      db.from('users').select('organization_id').in('organization_id', orgIds),

      db
        .from('shifts')
        .select('organization_id')
        .in('organization_id', orgIds)
        .gte(
          'created_at',
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        ),

      db
        .from('shifts')
        .select('organization_id')
        .in('organization_id', orgIds)
        .gte(
          'created_at',
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        ),

      // Recent activity: last 10 shifts across owned orgs
      db
        .from('shifts')
        .select('organization_id, created_at')
        .in('organization_id', orgIds)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  const locMap = countByOrg(locationsRes.data);
  const empMap = countByOrg(employeesRes.data);
  const s7dMap = countByOrg(shifts7dRes.data);
  const s30dMap = countByOrg(shifts30dRes.data);

  // Build org name lookup
  type OrgRaw = {
    id: string;
    name: string;
    restaurant_code: string;
    subscriptions: { status: string } | { status: string }[] | null;
  };
  const orgMap = new Map<string, OrgRaw>();
  for (const o of (orgsRes.data ?? []) as OrgRaw[]) {
    orgMap.set(o.id, o);
  }

  // -------------------------------------------------------------------------
  // 3. Assemble owned orgs
  // -------------------------------------------------------------------------
  const ownedOrgs: OwnedOrgRow[] = orgIds
    .map((orgId): OwnedOrgRow | null => {
      const org = orgMap.get(orgId);
      if (!org) return null;

      const subs = Array.isArray(org.subscriptions)
        ? org.subscriptions
        : org.subscriptions
          ? [org.subscriptions]
          : [];
      const subStatus: string | null = subs[0]?.status ?? null;
      const empCount = empMap.get(orgId) ?? 0;
      const s7d = s7dMap.get(orgId) ?? 0;
      const s30d = s30dMap.get(orgId) ?? 0;

      return {
        orgId,
        name: org.name,
        restaurantCode: org.restaurant_code,
        subscriptionStatus: subStatus,
        locationsCount: locMap.get(orgId) ?? 0,
        employeesCount: empCount,
        activationStage: computeStage(empCount, s7d, s30d, subStatus),
      };
    })
    .filter((o): o is OwnedOrgRow => o !== null);

  // -------------------------------------------------------------------------
  // 4. Recent activity
  // -------------------------------------------------------------------------
  const recentActivity: RecentActivityRow[] = (
    (recentShiftsRes.data ?? []) as { organization_id: string; created_at: string }[]
  ).map((s) => ({
    type: 'shift' as const,
    orgId: s.organization_id,
    orgName: orgMap.get(s.organization_id)?.name ?? s.organization_id.slice(0, 8),
    createdAt: s.created_at,
  }));

  return { profile, billing, ownedOrgs, recentActivity };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByOrg(rows: Record<string, unknown>[] | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!rows) return map;
  for (const row of rows) {
    const id = String(row.organization_id ?? '');
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

function computeStage(
  employees: number,
  shifts7d: number,
  shifts30d: number,
  subStatus: string | null,
): ActivationStage {
  if (employees === 0) return 0;
  if (shifts30d === 0) return 1;
  const active = shifts7d >= ACTIVATION_THRESHOLD;
  const hasSub = subStatus === 'active' || subStatus === 'trialing';
  if (active && hasSub) return 4;
  if (active) return 3;
  return 2;
}
