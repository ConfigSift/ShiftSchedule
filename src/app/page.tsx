'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';

export default function Home() {
  const router = useRouter();
  const {
    currentUser,
    isInitialized,
    activeRestaurantId,
    accessibleRestaurants,
    pendingInvitations,
    init,
  } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!isInitialized) return;

    // No user -> login
    if (!currentUser) {
      router.push('/login');
      return;
    }

    // Rule 1: Pending invitations AND no valid selection -> /restaurants
    if (pendingInvitations.length > 0 && !activeRestaurantId) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[home] pending invitations without selection, redirecting to /restaurants');
      }
      router.push('/restaurants');
      return;
    }

    // Rule 2: No memberships -> /restaurants
    if (accessibleRestaurants.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[home] no memberships, redirecting to /restaurants');
      }
      router.push('/restaurants');
      return;
    }

    // Rule 3: Single membership (activeRestaurantId should be set by init) -> /dashboard
    if (accessibleRestaurants.length === 1) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[home] single membership, redirecting to /dashboard');
      }
      router.push('/dashboard');
      return;
    }

    // Rule 4: Multiple memberships
    if (activeRestaurantId) {
      // Valid selection exists -> /dashboard
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[home] multiple memberships with valid selection, redirecting to /dashboard');
      }
      router.push('/dashboard');
    } else {
      // No valid selection -> /restaurants (do NOT auto-select)
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[home] multiple memberships without selection, redirecting to /restaurants');
      }
      router.push('/restaurants');
    }
  }, [isInitialized, currentUser, activeRestaurantId, accessibleRestaurants, pendingInvitations, router]);

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-theme-secondary">Loading...</p>
      </div>
    </div>
  );
}
