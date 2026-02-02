'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../components/Dashboard';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';

export default function DashboardPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const { hydrate, isHydrated } = useScheduleStore();
  const {
    currentUser,
    isInitialized,
    activeRestaurantId,
    accessibleRestaurants,
    pendingInvitations,
    init,
  } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setNotice(params.get('notice'));
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      init();
    }
  }, [isHydrated, init]);

  useEffect(() => {
    if (!isHydrated || !isInitialized) return;

    // Rule: No user -> login
    if (!currentUser) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[dashboard] no user, redirecting to /login');
      }
      router.push('/login');
      return;
    }

    // Rule 1: Pending invitations AND no valid selection -> /restaurants
    if (pendingInvitations.length > 0 && !activeRestaurantId) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[dashboard] pending invitations without selection, redirecting to /restaurants');
      }
      router.push('/restaurants');
      return;
    }

    // Rule 2: No memberships -> /restaurants (shows no-access message)
    if (accessibleRestaurants.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[dashboard] no memberships, redirecting to /restaurants');
      }
      router.push('/restaurants');
      return;
    }

    // Rule 3: Single membership - activeRestaurantId should already be set by init()
    // Rule 4: Multiple memberships without valid selection -> /restaurants
    if (!activeRestaurantId) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[dashboard] no active restaurant, redirecting to /restaurants');
      }
      router.push('/restaurants');
      return;
    }

    // activeRestaurantId is set and valid -> allow dashboard access
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[dashboard] valid selection, allowing access:', activeRestaurantId);
    }
  }, [isHydrated, isInitialized, currentUser, activeRestaurantId, accessibleRestaurants, pendingInvitations, router]);

  if (!isHydrated || !isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-theme-primary overflow-hidden">
      {notice === 'forbidden' && (
        <div className="bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm text-center py-2 shrink-0">
          You do not have access to that page.
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Dashboard />
      </div>
    </div>
  );
}
