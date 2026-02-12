'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Check,
  AlertTriangle,
  XCircle,
  CreditCard,
  ExternalLink,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';
import { getUserRole } from '../../utils/role';

const BILLING_PORTAL_ERROR_MESSAGE =
  'We couldn’t open the billing portal yet. Please try again in a moment.';

function logPortalError(context: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.error(`[billing:ui] ${context}`, details);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isMissingBillingAccountError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes('no billing account found') ||
    lowered.includes('no stripe billing identifiers found') ||
    lowered.includes('unable to resolve stripe customer id')
  );
}

export default function BillingClient() {
  const router = useRouter();
  const {
    currentUser,
    activeRestaurantId,
    isInitialized,
    init,
    subscriptionStatus,
    subscriptionDetails,
  } = useAuthStore();

  const [portalLoading, setPortalLoading] = useState(false);
  const [fixingBillingLink, setFixingBillingLink] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isInitialized) init();
  }, [isInitialized, init]);

  // Redirect non-admins
  useEffect(() => {
    if (!isInitialized || !currentUser) return;
    const role = getUserRole(currentUser.role);
    if (role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [isInitialized, currentUser, router]);

  // Redirect if no subscription → /subscribe
  useEffect(() => {
    if (subscriptionStatus === 'loading') return;
    if (subscriptionStatus === 'none' && isInitialized) {
      router.push('/subscribe');
    }
  }, [subscriptionStatus, isInitialized, router]);

  const handleManageBilling = async () => {
    if (!activeRestaurantId) return;
    setError('');
    setPortalLoading(true);
    setFixingBillingLink(false);

    const openPortal = () =>
      apiFetch<{ url: string }>('/api/billing/create-portal-session', {
        method: 'POST',
        json: { organizationId: activeRestaurantId },
      });

    const firstAttempt = await openPortal();
    if (firstAttempt.ok && firstAttempt.data?.url) {
      window.open(firstAttempt.data.url, '_blank');
      setPortalLoading(false);
      return;
    }

    const firstError = firstAttempt.error || '';
    if (isMissingBillingAccountError(firstError)) {
      setFixingBillingLink(true);
      logPortalError('missing billing account on first portal attempt', {
        organizationId: activeRestaurantId,
        error: firstError,
      });

      // Give webhook/self-heal paths a moment, then retry once.
      await sleep(1500);

      const retryAttempt = await openPortal();
      setFixingBillingLink(false);
      if (retryAttempt.ok && retryAttempt.data?.url) {
        window.open(retryAttempt.data.url, '_blank');
        setPortalLoading(false);
        return;
      }

      logPortalError('portal retry failed after missing billing account', {
        organizationId: activeRestaurantId,
        error: retryAttempt.error || null,
      });
      setError(BILLING_PORTAL_ERROR_MESSAGE);
      setPortalLoading(false);
      return;
    }

    logPortalError('portal open failed', {
      organizationId: activeRestaurantId,
      error: firstError || null,
    });
    setError(BILLING_PORTAL_ERROR_MESSAGE);
    setPortalLoading(false);
  };

  if (!isInitialized || subscriptionStatus === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!currentUser || getUserRole(currentUser.role) !== 'ADMIN') return null;

  const details = subscriptionDetails;
  const planLabel =
    details?.planInterval === 'monthly'
      ? 'Monthly'
      : details?.planInterval === 'annual'
        ? 'Annual'
        : 'Pro';

  const pricePerUnit = details?.planInterval === 'annual' ? 199 : 19.99;
  const interval = details?.planInterval === 'annual' ? '/yr' : '/mo';
  const quantity = details?.quantity ?? 1;
  const totalPrice = (pricePerUnit * quantity).toFixed(2);

  const periodEnd = details?.currentPeriodEnd
    ? new Date(details.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const StatusBadge = () => {
    if (subscriptionStatus === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-500">
          <Check className="w-3 h-3" /> Active
        </span>
      );
    }
    if (subscriptionStatus === 'past_due') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-500">
          <AlertTriangle className="w-3 h-3" /> Past Due
        </span>
      );
    }
    if (subscriptionStatus === 'canceled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">
          <XCircle className="w-3 h-3" /> Canceled
        </span>
      );
    }
    return null;
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-theme-primary">Billing</h1>
          <p className="text-sm text-theme-tertiary">Manage your ShiftFlow subscription</p>
        </div>
      </div>

      {/* Plan card */}
      <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-zinc-900" />
            </div>
            <div>
              <p className="font-semibold text-theme-primary">ShiftFlow Pro — {planLabel}</p>
              <StatusBadge />
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-theme-tertiary">Locations</span>
            <span className="text-theme-primary font-medium">
              {quantity} location{quantity !== 1 ? 's' : ''} &times; ${pricePerUnit.toFixed(2)}{interval} ={' '}
              <span className="font-bold">${totalPrice}{interval}</span>
            </span>
          </div>

          {periodEnd && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-tertiary">
                {details?.cancelAtPeriodEnd ? 'Cancels on' : 'Next billing date'}
              </span>
              <span className="text-theme-primary font-medium">{periodEnd}</span>
            </div>
          )}
        </div>

        {details?.cancelAtPeriodEnd && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
            <p className="text-sm text-amber-500">
              Your subscription will not renew after {periodEnd}. Use Manage Billing to reactivate.
            </p>
          </div>
        )}

        {subscriptionStatus === 'past_due' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
            <p className="text-sm text-amber-500">
              Your last payment failed. Please update your payment method to avoid service interruption.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          onClick={handleManageBilling}
          disabled={portalLoading}
          className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {portalLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          {portalLoading ? (fixingBillingLink ? 'Fixing billing link...' : 'Opening...') : 'Manage Billing'}
        </button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-theme-secondary border border-theme-primary rounded-xl p-4">
          <p className="text-sm font-semibold text-theme-primary mb-1">Change Plan</p>
          <p className="text-xs text-theme-tertiary">
            Use Manage Billing to switch between monthly and annual plans.
          </p>
        </div>
        <div className="bg-theme-secondary border border-theme-primary rounded-xl p-4">
          <p className="text-sm font-semibold text-theme-primary mb-1">Invoice History</p>
          <p className="text-xs text-theme-tertiary">
            View and download past invoices in the billing portal.
          </p>
        </div>
      </div>
    </div>
  );
}
