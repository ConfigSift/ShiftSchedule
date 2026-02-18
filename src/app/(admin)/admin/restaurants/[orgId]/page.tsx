import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { getRestaurantOverview } from '@/lib/admin/queries/restaurant-detail';
import type { RestaurantOverviewData } from '@/lib/admin/queries/restaurant-detail';
import { RestaurantDetailTabs } from './RestaurantDetailTabs';

export const dynamic = 'force-dynamic';

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  let overview: RestaurantOverviewData | null = null;
  let loadError: string | null = null;

  try {
    overview = await getRestaurantOverview(orgId);
  } catch (err) {
    console.error(`[admin/restaurants/${orgId} page]`, err);
    loadError = 'Failed to load organization details. Please refresh the page.';
  }

  if (!overview && !loadError) notFound();

  if (loadError || !overview) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-zinc-900">Restaurant Detail</h2>
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 py-16">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-medium text-red-800">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">
          {overview.org.name}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
          <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs">
            {overview.org.restaurantCode}
          </span>
          <span>Created {new Date(overview.org.createdAt).toLocaleDateString()}</span>
          <span className="font-mono text-xs text-zinc-400">{orgId}</span>
        </div>
      </div>

      {/* Tabs */}
      <RestaurantDetailTabs orgId={orgId} initialMemberships={overview.memberships} />
    </div>
  );
}
