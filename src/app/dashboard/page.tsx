'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../components/Dashboard';
import { EmployeeDashboard } from '../../components/employee/EmployeeDashboard';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { normalizePersona, readStoredPersona } from '@/lib/persona';
import { resolveNoMembershipDestination } from '@/lib/authRedirect';
import { getUserRole, isManagerRole } from '../../utils/role';
import { supabase } from '../../lib/supabase/client';
import { TransitionScreen } from '../../components/auth/TransitionScreen';

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
    subscriptionStatus,
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
        showToast('Welcome to CrewShyft Pro!', 'success');
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
    let cancelled = false;

    async function guardRoute() {
      // Treat auth session as source of truth; missing profile row should not force /login.
      if (!currentUser) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!data.session?.user) {
          router.replace('/login');
          return;
        }

        const storedPersona = readStoredPersona();
        if (!storedPersona) {
          router.replace('/persona?next=/dashboard');
          return;
        }

        if (accessibleRestaurants.length === 0) {
          router.replace(resolveNoMembershipDestination(null, storedPersona));
          return;
        }

        if (!activeRestaurantId) {
          router.replace('/restaurants');
          return;
        }
        return;
      }

      const persona = normalizePersona(currentUser.persona) ?? readStoredPersona();
      if (!persona) {
        router.replace('/persona?next=/dashboard');
        return;
      }

      if (pendingInvitations.length > 0 && !activeRestaurantId) {
        router.replace('/restaurants');
        return;
      }

      if (accessibleRestaurants.length === 0) {
        router.replace(resolveNoMembershipDestination(currentUser.role, persona));
        return;
      }

      if (!activeRestaurantId) {
        router.replace('/restaurants');
      }
    }

    void guardRoute();
    return () => {
      cancelled = true;
    };
  }, [isHydrated, isInitialized, currentUser, activeRestaurantId, accessibleRestaurants.length, pendingInvitations.length, router]);

  // Subscription loading gate: show spinner while status is 'loading', max 5 seconds
  const [subLoadingTimedOut, setSubLoadingTimedOut] = useState(false);
  const subTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (subscriptionStatus !== 'loading') {
      setSubLoadingTimedOut(false);
      if (subTimerRef.current) clearTimeout(subTimerRef.current);
      return;
    }
    subTimerRef.current = setTimeout(() => setSubLoadingTimedOut(true), 5000);
    return () => {
      if (subTimerRef.current) clearTimeout(subTimerRef.current);
    };
  }, [subscriptionStatus]);

  const isSubLoading = subscriptionStatus === 'loading' && !subLoadingTimedOut;

  if (!isHydrated || !isInitialized || !currentUser || isSubLoading) {
    const loadingMessage = isSubLoading ? 'Checking subscription...' : 'Loading...';
    return <TransitionScreen message={loadingMessage} />;
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
