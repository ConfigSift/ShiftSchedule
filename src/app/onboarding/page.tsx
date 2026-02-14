'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';
import { TransitionScreen } from '../../components/auth/TransitionScreen';
import { OnboardingBackground } from './OnboardingBackground';
import { OnboardingStepper } from './OnboardingStepper';

function OnboardingGuard() {
  const router = useRouter();
  const {
    isInitialized,
    init,
    accessibleRestaurants,
  } = useAuthStore();

  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [hasAuthSession, setHasAuthSession] = useState(false);

  useEffect(() => {
    if (!isInitialized) init();
  }, [isInitialized, init]);

  useEffect(() => {
    let cancelled = false;
    async function resolveSession() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasAuthSession(Boolean(data.session?.user));
      setIsAuthResolved(true);
    }
    resolveSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasManagerMembership = useMemo(() => {
    if (accessibleRestaurants.length === 0) return false;
    return accessibleRestaurants.some((r) => {
      const role = String(r.role ?? '').trim().toLowerCase();
      return role === 'owner' || role === 'admin' || role === 'manager';
    });
  }, [accessibleRestaurants]);

  useEffect(() => {
    if (!isInitialized || !isAuthResolved) return;

    if (!hasAuthSession) {
      router.replace('/login');
      return;
    }

    if (accessibleRestaurants.length > 0 && !hasManagerMembership) {
      router.replace('/dashboard');
      return;
    }
  }, [
    isInitialized,
    isAuthResolved,
    hasAuthSession,
    accessibleRestaurants.length,
    hasManagerMembership,
    router,
  ]);

  if (!isInitialized || !isAuthResolved) {
    return <TransitionScreen message="Loading..." />;
  }

  // While redirecting, show transition
  if (
    !hasAuthSession ||
    (accessibleRestaurants.length > 0 && !hasManagerMembership)
  ) {
    return <TransitionScreen message="Redirecting..." />;
  }

  return (
    <OnboardingBackground>
      <OnboardingStepper />
    </OnboardingBackground>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<TransitionScreen message="Loading..." />}>
      <OnboardingGuard />
    </Suspense>
  );
}
