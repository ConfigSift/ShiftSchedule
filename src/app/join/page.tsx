'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase/client';

export default function JoinPage() {
  const router = useRouter();
  const { init, isInitialized, currentUser, accessibleRestaurants, signOut } = useAuthStore();
  const [authResolved, setAuthResolved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      void init();
    }
  }, [init, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    let active = true;

    const resolveAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        router.replace('/login');
        return;
      }
      setAuthResolved(true);
    };

    void resolveAuth();

    return () => {
      active = false;
    };
  }, [isInitialized, router]);

  const showSiteManagerCta = useMemo(() => {
    if (accessibleRestaurants.length > 0) return true;
    const role = String(currentUser?.role ?? '').trim().toLowerCase();
    return role === 'admin' || role === 'manager' || role === 'owner';
  }, [accessibleRestaurants.length, currentUser?.role]);

  // Employee-only empty-state branch: no memberships yet, show only dashboard/login actions.
  const isEmployeeOnboarding = useMemo(() => {
    if (accessibleRestaurants.length > 0) return false;
    const role = String(currentUser?.role ?? '').trim().toLowerCase();
    const persona = String(currentUser?.persona ?? '').trim().toLowerCase();
    const accountType = String(currentUser?.accountType ?? '').trim().toLowerCase();
    return (
      role === 'employee'
      || role === 'worker'
      || persona === 'employee'
      || accountType === 'employee'
    );
  }, [accessibleRestaurants.length, currentUser?.accountType, currentUser?.persona, currentUser?.role]);

  const handleBackToLogin = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      router.replace('/login?notice=signed-out');
    }
  };

  if (!isInitialized || !authResolved || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary relative flex items-center justify-center p-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-lg animate-auth-enter">
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-5">
            <Calendar className="w-6 h-6 text-zinc-900" />
          </div>

          <h1 className="text-2xl font-bold text-theme-primary mb-3">Join a CrewShyft restaurant</h1>
          <p className="text-theme-tertiary mb-8">
            You&apos;re not part of a restaurant yet. Ask your manager to invite you, then sign in
            with the same email.
          </p>

          {isEmployeeOnboarding ? (
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <Link
                href="/restaurants"
                className="inline-flex items-center justify-center rounded-lg border border-theme-primary px-4 py-2.5 text-sm font-medium text-theme-secondary hover:bg-theme-hover transition-colors"
              >
                Go to dashboard
              </Link>
              <button
                type="button"
                onClick={handleBackToLogin}
                disabled={signingOut}
                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-amber-400 transition-colors disabled:opacity-60"
              >
                {signingOut ? 'Signing out...' : 'Back to login'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <Link
                  href="/restaurants"
                  className="inline-flex items-center justify-center rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-500 hover:bg-amber-500/15 transition-colors"
                >
                  Create a Restaurant
                </Link>
                {showSiteManagerCta && (
                  <Link
                    href="/restaurants"
                    className="inline-flex items-center justify-center rounded-lg border border-theme-primary px-4 py-2.5 text-sm font-medium text-theme-secondary hover:bg-theme-hover transition-colors"
                  >
                    Go to Site Manager
                  </Link>
                )}
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-amber-400 transition-colors"
                >
                  Back to Login
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-lg border border-theme-primary px-4 py-2.5 text-sm font-medium text-theme-secondary hover:bg-theme-hover transition-colors"
                >
                  Go to Homepage
                </Link>
              </div>

              <div className="rounded-xl border border-theme-primary bg-theme-tertiary/30 p-4">
                <h2 className="text-sm font-semibold text-theme-primary mb-2">Need a fresh start?</h2>
                <p className="text-xs text-theme-tertiary mb-3">
                  You can create a new restaurant now or permanently delete this account.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/restaurants"
                    className="inline-flex items-center justify-center rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-500 hover:bg-amber-500/15 transition-colors"
                  >
                    Create a restaurant
                  </Link>
                  <Link
                    href="/account"
                    className="inline-flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/15 transition-colors"
                  >
                    Delete account
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
