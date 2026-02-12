'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../components/Dashboard';
import { EmployeeDashboard } from '../../components/employee/EmployeeDashboard';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';

function consumeQueryFlag(param: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(param)) return false;
  params.delete(param);
  const qs = params.toString();
  const newUrl = window.location.pathname + (qs ? `?${qs}` : '');
  window.history.replaceState({}, '', newUrl);
  return true;
}

export default function DashboardPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const { hydrate, isHydrated, showToast } = useScheduleStore();
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

      // Post-checkout toasts — consume the flag and clean URL
      if (consumeQueryFlag('subscribed')) {
        showToast('Welcome to ShiftFlow Pro!', 'success');
      } else if (consumeQueryFlag('checkout_canceled')) {
        showToast('Checkout canceled. You can subscribe anytime from Settings.', 'error');
      }
    }
  }, [showToast]);

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

  // Branch here to keep manager/admin dashboard untouched while giving employees their own view.
  const matchedRestaurant = activeRestaurantId
    ? accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId)
    : undefined;
  const effectiveRole = getUserRole(matchedRestaurant?.role ?? currentUser.role);
  const isManager = isManagerRole(effectiveRole);

  return (
    <div className="h-full flex flex-col bg-theme-primary overflow-hidden">
      {notice === 'forbidden' && (
        <div className="bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm text-center py-2 shrink-0">
          You do not have access to that page.
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isManager ? <Dashboard /> : <EmployeeDashboard />}
      </div>
    </div>
  );
}
