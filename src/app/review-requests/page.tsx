'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import Link from 'next/link';
import { TimeOffRequestsPanel } from '../../components/review/TimeOffRequestsPanel';
import { BlockedDayRequestsPanel } from '../../components/review/BlockedDayRequestsPanel';
import { apiFetch } from '../../lib/apiClient';

type ReviewTab = 'time-off' | 'blocked-days';

export default function ReviewRequestsPage() {
  const router = useRouter();
  const {
    currentUser,
    isInitialized,
    activeRestaurantId,
    activeRestaurantCode,
    accessibleRestaurants,
    init,
  } = useAuthStore();
  const [tab, setTab] = useState<ReviewTab>('time-off');
  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);
  const activeRestaurant = accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId);
  const [pendingCounts, setPendingCounts] = useState<
    Record<string, { timeOff: number; blockedDays: number; total: number }>
  >({});

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const effectiveRole = getUserRole(activeRestaurant?.role ?? currentUser?.role);
    const canFetch = isInitialized && Boolean(currentUser) && isManagerRole(effectiveRole);
    if (!canFetch) return;

    let isActive = true;
    const loadCounts = async () => {
      const result = await apiFetch<{ counts: Record<string, { timeOff: number; blockedDays: number; total: number }> }>(
        '/api/review/pending-counts'
      );
      if (!result.ok || !result.data || !isActive) return;
      setPendingCounts(result.data.counts || {});
    };
    loadCounts();
    return () => {
      isActive = false;
    };
  }, [isInitialized, currentUser, activeRestaurant, activeRestaurantId]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login?notice=login');
      return;
    }
    if (!activeRestaurantId && accessibleRestaurants.length > 1) {
      router.push('/restaurants');
      return;
    }
    if (isManager && !activeRestaurantId) {
      router.push('/restaurants');
    }
  }, [isInitialized, currentUser, activeRestaurantId, isManager, router, accessibleRestaurants.length]);

  if (!isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const activeTotalPending = activeRestaurantId ? pendingCounts[activeRestaurantId]?.total ?? 0 : 0;
  const otherPendingRestaurants = accessibleRestaurants.filter(
    (restaurant) => restaurant.id !== activeRestaurantId && (pendingCounts[restaurant.id]?.total ?? 0) > 0
  );

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-theme-primary">Review Requests</h1>
              <p className="text-theme-tertiary mt-1">
                {isManager
                  ? 'Approve or deny time off and blocked day requests.'
                  : 'Track your submitted time off and blocked day requests.'}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-theme-tertiary text-[11px] text-theme-secondary border border-theme-primary">
              <span className="text-theme-muted">For:</span>
              {activeRestaurant ? (
                <span className="text-theme-primary">
                  {activeRestaurant.name} ({activeRestaurant.restaurantCode || activeRestaurantCode})
                </span>
              ) : (
                <>
                  <span className="text-theme-primary">(none selected)</span>
                  <Link
                    href="/restaurants"
                    className="text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Choose
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('time-off')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'time-off'
                ? 'bg-amber-500 text-zinc-900'
                : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
            }`}
          >
            Time Off Requests
          </button>
          <button
            type="button"
            onClick={() => setTab('blocked-days')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'blocked-days'
                ? 'bg-amber-500 text-zinc-900'
                : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
            }`}
          >
            Blocked Day Requests
          </button>
        </div>

        {activeTotalPending === 0 && otherPendingRestaurants.length > 0 && (
          <div className="rounded-2xl border border-theme-primary bg-theme-secondary/70 px-4 py-3 text-sm text-theme-secondary">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-theme-primary font-semibold">No pending requests for this restaurant.</p>
                <p className="text-theme-tertiary">
                  Pending in other restaurants:{' '}
                  {otherPendingRestaurants
                    .map((restaurant) => {
                      const total = pendingCounts[restaurant.id]?.total ?? 0;
                      return `${restaurant.name} (${total})`;
                    })
                    .join(', ')}
                </p>
              </div>
              <Link
                href="/restaurants"
                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs font-semibold"
              >
                Switch restaurants
              </Link>
            </div>
          </div>
        )}

        {tab === 'time-off' ? (
          <TimeOffRequestsPanel allowEmployee showHeader={false} />
        ) : (
          <BlockedDayRequestsPanel allowEmployee showHeader={false} />
        )}
      </div>
    </div>
  );
}
