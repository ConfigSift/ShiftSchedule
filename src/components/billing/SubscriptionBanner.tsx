'use client';

import { useState } from 'react';
import { AlertTriangle, CreditCard, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';

export function SubscriptionBanner() {
  const { subscriptionStatus, subscriptionDetails, activeRestaurantId, currentUser } =
    useAuthStore();
  const [dismissed, setDismissed] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Only admins see billing banners
  const role = currentUser?.role;
  const isAdmin = role === 'ADMIN';

  if (!isAdmin) return null;
  if (dismissed) return null;
  if (subscriptionStatus !== 'past_due' && subscriptionStatus !== 'canceled') return null;

  const handleManageBilling = async () => {
    if (!activeRestaurantId) return;
    setPortalLoading(true);
    const result = await apiFetch<{ url: string }>('/api/billing/create-portal-session', {
      method: 'POST',
      json: { organizationId: activeRestaurantId },
    });
    if (result.ok && result.data?.url) {
      window.location.href = result.data.url;
    } else {
      setPortalLoading(false);
    }
  };

  if (subscriptionStatus === 'past_due') {
    return (
      <div className="relative bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-500 truncate">
              Your payment failed. Please update your payment method.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 text-xs font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {portalLoading ? 'Opening...' : 'Manage Billing'}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-amber-500/60 hover:text-amber-500 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (subscriptionStatus === 'canceled') {
    const periodEnd = subscriptionDetails?.currentPeriodEnd
      ? new Date(subscriptionDetails.currentPeriodEnd).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    // Check if we're still within the paid period
    const stillWithinPeriod =
      subscriptionDetails?.currentPeriodEnd &&
      new Date(subscriptionDetails.currentPeriodEnd) > new Date();

    if (!stillWithinPeriod) {
      // Past period end — the gate should handle this, but return null here
      return null;
    }

    return (
      <div className="relative bg-red-500/10 border-b border-red-500/30 px-4 py-3">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400 truncate">
              Your subscription has been canceled
              {periodEnd ? ` and will end on ${periodEnd}.` : '.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/subscribe"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-400 transition-colors"
            >
              Resubscribe
            </a>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
