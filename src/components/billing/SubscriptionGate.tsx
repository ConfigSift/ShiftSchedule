'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Calendar, Loader2, Lock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';

type SubscriptionGateProps = {
  children: React.ReactNode;
};

const SUBSCRIBED_GRACE_MS = 10_000;

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscriptionStatus, subscriptionDetails, currentUser } = useAuthStore();
  const { setSubscriptionBlocked } = useUIStore();
  const overLimit = Boolean(subscriptionDetails?.overLimit);
  const [subscribedParamPresent, setSubscribedParamPresent] = useState(false);
  const [graceActive, setGraceActive] = useState(subscribedParamPresent);
  const bypassGateRoutes = pathname.startsWith('/restaurants') || pathname.startsWith('/billing');
  const isGateBlocking =
    !bypassGateRoutes
    && !graceActive
    && subscriptionStatus !== 'loading'
    && subscriptionStatus !== 'active';

  useEffect(() => {
    function readSubscribedParam() {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      setSubscribedParamPresent(params.get('subscribed') === 'true');
    }

    readSubscribedParam();
    window.addEventListener('popstate', readSubscribedParam);
    window.addEventListener('focus', readSubscribedParam);
    return () => {
      window.removeEventListener('popstate', readSubscribedParam);
      window.removeEventListener('focus', readSubscribedParam);
    };
  }, []);

  useEffect(() => {
    if (!subscribedParamPresent) {
      setGraceActive(false);
      return;
    }
    setGraceActive(true);
    const timer = setTimeout(() => {
      setGraceActive(false);
    }, SUBSCRIBED_GRACE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [subscribedParamPresent]);

  useEffect(() => {
    if (!subscribedParamPresent) return;
    if (subscriptionStatus !== 'active') return;

    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.delete('subscribed');
    const query = params.toString();
    setSubscribedParamPresent(false);
    router.replace(`${pathname}${query ? `?${query}` : ''}`);
  }, [subscribedParamPresent, subscriptionStatus, pathname, router]);

  useEffect(() => {
    setSubscriptionBlocked(isGateBlocking);
    return () => {
      setSubscriptionBlocked(false);
    };
  }, [isGateBlocking, setSubscriptionBlocked]);

  if (bypassGateRoutes) {
    return <>{children}</>;
  }

  if (graceActive && subscriptionStatus !== 'active') {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-8 shadow-xl">
            <Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-theme-primary mb-2">
              Syncing subscription...
            </h2>
            <p className="text-sm text-theme-tertiary">
              Finalizing your checkout. This can take a few seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (subscriptionStatus === 'loading') {
    return <>{children}</>;
  }

  if (subscriptionStatus === 'active') {
    return <>{children}</>;
  }

  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-lg">
            <Calendar className="w-7 h-7 text-zinc-900" />
          </div>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-8 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-amber-500" />
          </div>

          <h2 className="text-lg font-bold text-theme-primary mb-2">
            {overLimit ? 'Upgrade Required' : 'Subscription Required'}
          </h2>

          {overLimit ? (
            <>
              <p className="text-sm text-theme-tertiary mb-6">
                You have {subscriptionDetails?.ownedOrgCount ?? 0} restaurants, but your plan covers{' '}
                {subscriptionDetails?.quantity ?? 0}. Upgrade to {subscriptionDetails?.requiredQuantity ?? 1}{' '}
                locations to continue.
              </p>
              <div className="space-y-3">
                <Link
                  href="/billing"
                  className="inline-flex items-center justify-center w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
                >
                  Upgrade Locations
                </Link>
                <Link
                  href="/restaurants"
                  className="inline-flex items-center justify-center w-full py-3 border border-theme-primary text-theme-secondary rounded-lg hover:bg-theme-hover transition-colors"
                >
                  Manage Restaurants
                </Link>
              </div>
            </>
          ) : isAdmin ? (
            <>
              <p className="text-sm text-theme-tertiary mb-6">
                Your organization needs an active subscription to access CrewShyft.
              </p>
              <a
                href="/subscribe"
                className="inline-flex items-center justify-center w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
              >
                Choose a Plan
              </a>
            </>
          ) : (
            <p className="text-sm text-theme-tertiary">
              Contact your manager to activate the subscription for your organization.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
