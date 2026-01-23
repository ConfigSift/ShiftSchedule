'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import { TimeOffRequestsPanel } from '../../components/review/TimeOffRequestsPanel';
import { BlockedDayRequestsPanel } from '../../components/review/BlockedDayRequestsPanel';

type ReviewTab = 'time-off' | 'blocked-days';

export default function ReviewRequestsPage() {
  const router = useRouter();
  const { currentUser, isInitialized, activeRestaurantId, init } = useAuthStore();
  const [tab, setTab] = useState<ReviewTab>('time-off');
  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login?notice=login');
      return;
    }
    if (isManager && !activeRestaurantId) {
      router.push('/manager');
    }
  }, [isInitialized, currentUser, activeRestaurantId, isManager, router]);

  if (!isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Review Requests</h1>
          <p className="text-theme-tertiary mt-1">
            {isManager
              ? 'Approve or deny time off and blocked day requests.'
              : 'Track your submitted time off and blocked day requests.'}
          </p>
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

        {tab === 'time-off' ? (
          <TimeOffRequestsPanel allowEmployee showHeader={false} />
        ) : (
          <BlockedDayRequestsPanel allowEmployee showHeader={false} />
        )}
      </div>
    </div>
  );
}
