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
    accessibleRestaurants,
    init,
  } = useAuthStore();
  const [tab, setTab] = useState<ReviewTab>('time-off');
  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);
  const [pendingCounts, setPendingCounts] = useState<
    Record<string, { timeOff: number; blockedDays: number; total: number }>
  >({});

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const activeRestaurant = accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId);
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
  }, [isInitialized, currentUser, accessibleRestaurants, activeRestaurantId]);

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
  const activeTab: ReviewTab = isManager ? tab : 'time-off';
  const otherPendingRestaurants = accessibleRestaurants.filter(
    (restaurant) => restaurant.id !== activeRestaurantId && (pendingCounts[restaurant.id]?.total ?? 0) > 0
  );

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="overflow-hidden rounded-2xl border border-theme-primary bg-theme-secondary">
          <header className="bg-theme-secondary">
            <div className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-base font-bold text-theme-primary">Review Requests</h1>
                <p className="text-xs text-theme-tertiary mt-1">
                  {isManager
                    ? 'Track and process time off and blocked day requests.'
                    : 'Track your submitted time off and blocked day requests.'}
                </p>
              </div>

              <div className="inline-flex items-center gap-1 rounded-full border border-theme-primary bg-theme-tertiary p-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setTab('time-off')}
                  className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeTab === 'time-off'
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-none'
                      : 'text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  Time Off Requests
                </button>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => setTab('blocked-days')}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                      activeTab === 'blocked-days'
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-none'
                        : 'text-theme-secondary hover:text-theme-primary'
                    }`}
                  >
                    Blocked Day Requests
                  </button>
                )}
              </div>
            </div>
          </header>

          {activeTab === 'time-off' ? (
            <TimeOffRequestsPanel allowEmployee showHeader={false} />
          ) : (
            <BlockedDayRequestsPanel allowEmployee showHeader={false} />
          )}
        </div>

        {activeTotalPending === 0 && otherPendingRestaurants.length > 0 && (
          <div className="rounded-2xl border border-theme-primary bg-theme-secondary/70 px-4 py-3 text-sm text-theme-secondary">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-theme-primary font-semibold">No pending requests for this restaurant.</p>
                <p className="text-theme-tertiary">
                  Pending requests exist in other restaurants.
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
      </div>
    </div>
  );
}
