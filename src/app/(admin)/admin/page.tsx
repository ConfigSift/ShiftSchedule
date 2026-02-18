import Link from 'next/link';
import {
  Building2,
  MapPin,
  CreditCard,
  Sparkles,
  Store,
  CalendarDays,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';
import { fetchOverviewData } from '@/lib/admin/queries/overview';
import type { AlertItem, OverviewKpis } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  let kpis: OverviewKpis | null = null;
  let alerts: { provisioningErrors: AlertItem[]; incompleteSubscriptions: AlertItem[]; pendingCancellations: AlertItem[] } | null = null;
  let loadError: string | null = null;

  try {
    const data = await fetchOverviewData();
    kpis = data.kpis;
    alerts = data.alerts;
  } catch (err) {
    console.error('[admin/overview page]', err);
    loadError = 'Failed to load overview data. Please refresh the page.';
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-zinc-900">Overview</h2>

      {loadError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 py-16">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-medium text-red-800">{loadError}</p>
        </div>
      )}

      {/* KPI cards — row 1 */}
      {kpis && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Restaurant Owners"
          value={kpis.totalOrganizations}
          icon={<Building2 className="h-5 w-5 text-indigo-500" />}
        />
        <KpiCard
          label="Restaurants"
          value={kpis.totalLocations}
          icon={<MapPin className="h-5 w-5 text-sky-500" />}
        />
        <KpiCard
          label="Active Subscriptions"
          value={kpis.activeSubscriptions}
          icon={<CreditCard className="h-5 w-5 text-emerald-500" />}
        />
      </div>
      )}

      {/* KPI cards — row 2 (dual 7d/30d) */}
      {kpis && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DualKpiCard
          label="New Intents"
          value7d={kpis.newIntents7d}
          value30d={kpis.newIntents30d}
          icon={<Sparkles className="h-5 w-5 text-amber-500" />}
        />
        <DualKpiCard
          label="New Orgs"
          value7d={kpis.newOrgs7d}
          value30d={kpis.newOrgs30d}
          icon={<Store className="h-5 w-5 text-pink-500" />}
        />
        <DualKpiCard
          label="Shifts Created"
          value7d={kpis.shiftsCreated7d}
          value30d={kpis.shiftsCreated30d}
          icon={<CalendarDays className="h-5 w-5 text-teal-500" />}
        />
      </div>
      )}

      {/* Alert panels */}
      {alerts && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AlertPanel
          title="Provisioning Errors"
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          items={alerts.provisioningErrors}
          emptyText="No provisioning errors."
        />
        <AlertPanel
          title="Missing Subscriptions"
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          items={alerts.incompleteSubscriptions}
          emptyText="All organizations have active subscriptions."
        />
        <AlertPanel
          title="Pending Cancellations"
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          items={alerts.pendingCancellations}
          emptyText="No pending cancellations."
        />
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900">
          {value.toLocaleString()}
        </p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

function DualKpiCard({
  label,
  value7d,
  value30d,
  icon,
}: {
  label: string;
  value7d: number;
  value30d: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
        {icon}
      </div>
      <div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-zinc-900">
            {value7d.toLocaleString()}
          </span>
          <span className="text-sm text-zinc-400">
            / {value30d.toLocaleString()}
          </span>
        </div>
        <p className="text-xs text-zinc-500">{label} (7d / 30d)</p>
      </div>
    </div>
  );
}

function AlertPanel({
  title,
  icon,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: AlertItem[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3">
        {icon}
        <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
        {items.length > 0 && (
          <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {items.length}
          </span>
        )}
      </div>

      <div className="divide-y divide-zinc-50">
        {items.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-zinc-400">
            {emptyText}
          </p>
        ) : (
          items.map((item) => <AlertRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function AlertRow({ item }: { item: AlertItem }) {
  const href =
    item.entityType === 'organization' && item.entityId
      ? `/admin/restaurants?id=${item.entityId}`
      : item.entityType === 'intent' && item.entityId
        ? `/admin/provisioning?intent=${item.entityId}`
        : null;

  const severityDot =
    item.severity === 'error'
      ? 'bg-red-500'
      : item.severity === 'warning'
        ? 'bg-amber-400'
        : 'bg-blue-400';

  const content = (
    <div className="flex items-start gap-3 px-5 py-3">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800">
          {item.title}
        </p>
        <p className="truncate text-xs text-zinc-500">{item.description}</p>
      </div>
      {item.timestamp && (
        <time className="shrink-0 text-xs text-zinc-400">
          {formatRelative(item.timestamp)}
        </time>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-colors hover:bg-zinc-50">
        {content}
      </Link>
    );
  }

  return content;
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
