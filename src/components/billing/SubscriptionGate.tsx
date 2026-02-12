'use client';

import { Calendar, Lock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

type SubscriptionGateProps = {
  children: React.ReactNode;
};

/**
 * Client-side subscription enforcement.
 * Wraps app content and blocks access when no active subscription exists.
 * This complements the middleware safety-net redirect.
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { subscriptionStatus, subscriptionDetails, currentUser } = useAuthStore();

  // Still loading — don't block, let content render (avoids flash)
  if (subscriptionStatus === 'loading') {
    return <>{children}</>;
  }

  // Active or past_due — allow access (banner handles past_due warning)
  if (subscriptionStatus === 'active' || subscriptionStatus === 'past_due') {
    return <>{children}</>;
  }

  // Canceled but still within paid period — allow access (banner shows warning)
  if (subscriptionStatus === 'canceled' && subscriptionDetails?.currentPeriodEnd) {
    const stillWithinPeriod = new Date(subscriptionDetails.currentPeriodEnd) > new Date();
    if (stillWithinPeriod) {
      return <>{children}</>;
    }
  }

  // No subscription or expired — block access
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
            Subscription Required
          </h2>

          {isAdmin ? (
            <>
              <p className="text-sm text-theme-tertiary mb-6">
                Your organization needs an active subscription to access ShiftFlow.
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
