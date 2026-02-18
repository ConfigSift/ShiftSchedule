import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { getAccountDetail } from '@/lib/admin/queries/account-detail';
import type { OwnedOrgRow, AccountDetailData } from '@/lib/admin/queries/account-detail';
import {
  ACTIVATION_STAGE_LABELS,
  ACTIVATION_STAGE_COLORS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_COLORS,
  type SubscriptionStatusOption,
} from '@/lib/admin/constants';
import type { ActivationStage } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ authUserId: string }>;
}) {
  const { authUserId } = await params;

  let data: AccountDetailData | null = null;
  let loadError: string | null = null;

  try {
    data = await getAccountDetail(authUserId);
  } catch (err) {
    console.error(`[admin/accounts/${authUserId} page]`, err);
    loadError = 'Failed to load account details. Please refresh the page.';
  }

  if (!data && !loadError) notFound();

  if (loadError || !data) {
    return (
      <div className="space-y-8">
        <h2 className="text-xl font-semibold text-zinc-900">Account Detail</h2>
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 py-16">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-medium text-red-800">{loadError}</p>
        </div>
      </div>
    );
  }

  const { profile, billing, ownedOrgs, recentActivity } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">
          {profile.ownerName || 'Unnamed Account'}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
          <span className="font-mono text-xs text-zinc-400">{authUserId}</span>
          {profile.email && <span>{profile.email}</span>}
          {profile.accountType && (
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs capitalize text-zinc-600">
              {profile.accountType}
            </span>
          )}
        </div>
      </div>

      {profile.profileState === 'orphaned' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This account profile is orphaned: no matching auth user exists in `auth.users`.
        </div>
      )}

      {/* Billing summary card */}
      <Card title="Billing Summary">
        {!billing ? (
          <EmptyState text="No billing account found for this user." />
        ) : (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DlItem label="Status">
              <StatusBadge status={billing.status} />
            </DlItem>
            <DlItem label="Stripe Customer ID">
              <span className="font-mono text-xs">{billing.stripeCustomerId}</span>
            </DlItem>
            <DlItem label="Stripe Subscription ID">
              <span className="font-mono text-xs">
                {billing.stripeSubscriptionId ?? '—'}
              </span>
            </DlItem>
            <DlItem label="Quantity">{billing.quantity}</DlItem>
            <DlItem label="Cancel at Period End">
              {billing.cancelAtPeriodEnd ? (
                <span className="font-medium text-amber-600">Yes</span>
              ) : (
                'No'
              )}
            </DlItem>
            <DlItem label="Period End">
              {billing.currentPeriodEnd
                ? new Date(billing.currentPeriodEnd).toLocaleDateString()
                : '—'}
            </DlItem>
          </dl>
        )}
      </Card>

      {/* Owned organizations */}
      <Card title={`Owned Organizations (${ownedOrgs.length})`}>
        {ownedOrgs.length === 0 ? (
          <EmptyState text="This account does not own any organizations." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-4">Organization</th>
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Sub Status</th>
                  <th className="pb-2 pr-4 text-right">Locations</th>
                  <th className="pb-2 pr-4 text-right">Employees</th>
                  <th className="pb-2">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {ownedOrgs.map((org) => (
                  <OwnedOrgTableRow key={org.orgId} org={org} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <Card title="Recent Activity">
          <ul className="divide-y divide-zinc-50">
            {recentActivity.map((a, i) => (
              <li
                key={`${a.orgId}-${a.createdAt}-${i}`}
                className="flex items-center justify-between py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                    {a.type}
                  </span>
                  <Link
                    href={`/admin/restaurants/${a.orgId}`}
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    {a.orgName}
                  </Link>
                </div>
                <time className="text-xs text-zinc-400">
                  {formatRelative(a.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-zinc-400">{text}</p>;
}

function DlItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm text-zinc-800">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors =
    SUBSCRIPTION_STATUS_COLORS[status as SubscriptionStatusOption] ??
    'bg-zinc-100 text-zinc-600';
  const label =
    SUBSCRIPTION_STATUS_LABELS[status as SubscriptionStatusOption] ?? status;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}

function OwnedOrgTableRow({ org }: { org: OwnedOrgRow }) {
  const subColors = org.subscriptionStatus
    ? (SUBSCRIPTION_STATUS_COLORS[
        org.subscriptionStatus as SubscriptionStatusOption
      ] ?? 'bg-zinc-100 text-zinc-600')
    : '';
  const subLabel = org.subscriptionStatus
    ? (SUBSCRIPTION_STATUS_LABELS[
        org.subscriptionStatus as SubscriptionStatusOption
      ] ?? org.subscriptionStatus)
    : null;

  return (
    <tr className="transition-colors hover:bg-zinc-50">
      <td className="py-2 pr-4">
        <Link
          href={`/admin/restaurants/${org.orgId}`}
          className="font-medium text-indigo-600 hover:underline"
        >
          {org.name}
        </Link>
      </td>
      <td className="py-2 pr-4 font-mono text-xs text-zinc-500">
        {org.restaurantCode}
      </td>
      <td className="py-2 pr-4">
        {subLabel ? (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${subColors}`}
          >
            {subLabel}
          </span>
        ) : (
          <span className="text-xs text-zinc-300">None</span>
        )}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums text-zinc-600">
        {org.locationsCount}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums text-zinc-600">
        {org.employeesCount}
      </td>
      <td className="py-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ACTIVATION_STAGE_COLORS[org.activationStage]}`}
          title={ACTIVATION_STAGE_LABELS[org.activationStage]}
        >
          {org.activationStage}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
