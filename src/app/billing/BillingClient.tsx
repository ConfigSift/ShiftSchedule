'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Check,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';
import { getUserRole } from '../../utils/role';
import { Modal } from '../../components/Modal';
import { clearStorage, STORAGE_KEYS } from '../../utils/storage';

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
const BILLING_PORTAL_ERROR_MESSAGE =
  'We could not open the billing portal yet. Please try again in a moment.';

type SubscriptionStatusSnapshot = {
  billingEnabled?: boolean;
  active?: boolean;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
  owned_org_count?: number;
  required_quantity?: number;
  subscription?: {
    quantity?: number;
    stripe_price_id?: string | null;
    stripe_subscription_id?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    status?: string;
  } | null;
};

type DeleteAccountResponse = {
  ok: boolean;
  deletedOrg: string;
  deletedAuthUser: boolean;
};

type DeleteAccountError = {
  error?: string;
  message?: string;
  manageBillingUrl?: string;
  table?: string;
  column?: string;
  code?: string;
  details?: string;
  hint?: string;
};

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

function clearDeletionStorageKeys() {
  clearStorage();
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_RESTAURANT);
  localStorage.removeItem('shiftflow_active_restaurant');
}

function formatPeriodEndDate(periodEndIso: string | null) {
  if (!periodEndIso) return null;
  const parsed = new Date(periodEndIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function BillingClient() {
  const router = useRouter();
  const {
    currentUser,
    activeRestaurantId,
    accessibleRestaurants,
    isInitialized,
    init,
    subscriptionStatus,
    subscriptionDetails,
    signOut,
  } = useAuthStore();

  const activeRestaurant = useMemo(
    () => accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId),
    [accessibleRestaurants, activeRestaurantId],
  );

  const membershipRoleUpper = String(activeRestaurant?.role ?? currentUser?.role ?? '')
    .trim()
    .toUpperCase();
  const normalizedUserRole = getUserRole(currentUser?.role);
  const canUseDangerZone =
    membershipRoleUpper === 'OWNER' ||
    membershipRoleUpper === 'ADMIN' ||
    membershipRoleUpper === 'MANAGER' ||
    normalizedUserRole === 'ADMIN' ||
    normalizedUserRole === 'MANAGER';

  const [portalLoading, setPortalLoading] = useState(false);
  const [fixingBillingLink, setFixingBillingLink] = useState(false);
  const [error, setError] = useState('');

  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [statusSnapshot, setStatusSnapshot] = useState<SubscriptionStatusSnapshot | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteKeyword, setDeleteKeyword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteErrorDetails, setDeleteErrorDetails] = useState<DeleteAccountError | null>(null);
  const [deleteErrorManageBillingUrl, setDeleteErrorManageBillingUrl] = useState<string | null>(null);
  const [deleteSuccessVisible, setDeleteSuccessVisible] = useState(false);
  const [statusRefreshLoading, setStatusRefreshLoading] = useState(false);
  const reconcileAttemptedRef = useRef(false);

  useEffect(() => {
    if (!isInitialized) init();
  }, [isInitialized, init]);

  useEffect(() => {
    if (!isInitialized || !currentUser) return;
    if (!canUseDangerZone) {
      router.push('/dashboard');
    }
  }, [isInitialized, currentUser, canUseDangerZone, router]);

  useEffect(() => {
    if (subscriptionStatus === 'loading') return;
    if (subscriptionStatus === 'none' && isInitialized && !subscriptionDetails?.overLimit) {
      router.push('/subscribe');
    }
  }, [subscriptionStatus, isInitialized, router, subscriptionDetails?.overLimit]);

  const loadSubscriptionSnapshot = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) {
        setSnapshotLoading(true);
      }

      const result = await apiFetch<SubscriptionStatusSnapshot>(
        activeRestaurantId
          ? `/api/billing/subscription-status?organizationId=${activeRestaurantId}`
          : '/api/billing/subscription-status',
        { cache: 'no-store' },
      );

      if (result.ok && result.data) {
        setStatusSnapshot(result.data);
        if (!silent) {
          setSnapshotLoading(false);
        }
        return result.data;
      } else if (!silent) {
        setStatusSnapshot(null);
      }

      if (!silent) {
        setSnapshotLoading(false);
      }
      return null;
    },
    [activeRestaurantId],
  );

  const refetchSubscriptionStatus = useCallback(
    async (options?: { silent?: boolean; refreshRouter?: boolean }) => {
      const snapshot = await loadSubscriptionSnapshot({ silent: options?.silent });
      if (snapshot && options?.refreshRouter !== false) {
        router.refresh();
      }
      return snapshot;
    },
    [loadSubscriptionSnapshot, router],
  );

  const refreshDeleteEligibilityFast = useCallback(async () => {
    const immediate = await refetchSubscriptionStatus({ refreshRouter: true });
    const immediateStatus = String(immediate?.status ?? '').trim().toLowerCase();
    const immediateCancelAtPeriodEnd = Boolean(immediate?.cancel_at_period_end);
    const immediateActive = immediate?.active === true || immediateStatus === 'active' || immediateStatus === 'trialing';
    const immediateHasSubscription = immediate?.subscription !== null && immediate?.subscription !== undefined;
    const immediateBlocked =
      Boolean(immediate?.billingEnabled ?? BILLING_ENABLED) &&
      immediateHasSubscription &&
      immediateActive &&
      !immediateCancelAtPeriodEnd;

    if (!immediateBlocked) {
      return;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < 15000) {
      await sleep(1000);
      const snapshot = await refetchSubscriptionStatus({ silent: true, refreshRouter: false });
      if (!snapshot) continue;

      const status = String(snapshot.status ?? '').trim().toLowerCase();
      const cancelAtPeriodEnd = Boolean(snapshot.cancel_at_period_end);
      const active = snapshot.active === true || status === 'active' || status === 'trialing';
      const hasSubscription = snapshot.subscription !== null && snapshot.subscription !== undefined;
      const blocked =
        Boolean(snapshot.billingEnabled ?? BILLING_ENABLED) &&
        hasSubscription &&
        active &&
        !cancelAtPeriodEnd;

      if (!blocked) {
        router.refresh();
        return;
      }
    }
  }, [refetchSubscriptionStatus, router]);

  useEffect(() => {
    if (!isInitialized) return;
    void loadSubscriptionSnapshot();
  }, [isInitialized, loadSubscriptionSnapshot]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('portal') !== '1') return;

    let cancelled = false;

    async function refreshAfterPortalReturn() {
      await refreshDeleteEligibilityFast();
      if (cancelled) return;
    }

    void refreshAfterPortalReturn();
    params.delete('portal');
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
    return () => {
      cancelled = true;
    };
  }, [refreshDeleteEligibilityFast]);

  useEffect(() => {
    const onFocus = () => {
      void refreshDeleteEligibilityFast();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshDeleteEligibilityFast();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshDeleteEligibilityFast]);

  useEffect(() => {
    if (!deleteModalOpen) return;
    void refreshDeleteEligibilityFast();
  }, [deleteModalOpen, refreshDeleteEligibilityFast]);

  const handleManageBilling = async () => {
    setError('');
    setPortalLoading(true);
    setFixingBillingLink(false);

    const openPortal = () =>
      apiFetch<{ url: string }>('/api/billing/create-portal-session', {
        method: 'POST',
        json: { organizationId: activeRestaurantId ?? undefined },
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

  const resolvedBillingEnabled = statusSnapshot?.billingEnabled ?? BILLING_ENABLED;
  const statusFromSnapshot = String(statusSnapshot?.status ?? '').trim().toLowerCase();
  const fallbackStatus =
    subscriptionStatus === 'active'
      ? 'active'
      : subscriptionStatus === 'past_due'
        ? 'past_due'
        : subscriptionStatus === 'canceled'
          ? 'canceled'
          : 'none';
  const effectiveStatus = statusFromSnapshot || fallbackStatus;
  const cancelAtPeriodEnd =
    statusSnapshot?.cancel_at_period_end ?? subscriptionDetails?.cancelAtPeriodEnd ?? false;
  const currentPeriodEndIso =
    statusSnapshot?.current_period_end ?? subscriptionDetails?.currentPeriodEnd ?? null;
  const currentPeriodEndLabel = formatPeriodEndDate(currentPeriodEndIso);
  const subscriptionExists =
    statusSnapshot?.subscription !== undefined
      ? statusSnapshot.subscription !== null
      : Boolean(subscriptionDetails);
  const effectiveActive =
    statusSnapshot?.active ?? (effectiveStatus === 'active' || effectiveStatus === 'trialing');
  const snapshotQuantity = Math.max(
    0,
    Number(statusSnapshot?.subscription?.quantity ?? subscriptionDetails?.quantity ?? 0),
  );
  const snapshotOwnedCount = Math.max(
    0,
    Number(statusSnapshot?.owned_org_count ?? subscriptionDetails?.ownedOrgCount ?? 0),
  );

  const isBlockedBySubscription =
    resolvedBillingEnabled &&
    subscriptionExists &&
    effectiveActive &&
    !cancelAtPeriodEnd;
  const deleteAllowedByScheduledCancel =
    resolvedBillingEnabled &&
    subscriptionExists &&
    effectiveActive &&
    cancelAtPeriodEnd;

  const keywordConfirmed = deleteKeyword === 'DELETE';
  const canSubmitDelete =
    keywordConfirmed &&
    !isBlockedBySubscription &&
    !deleteLoading;

  useEffect(() => {
    if (!resolvedBillingEnabled) return;
    if (reconcileAttemptedRef.current) return;
    if (snapshotQuantity <= Math.max(1, snapshotOwnedCount)) return;

    reconcileAttemptedRef.current = true;
    void (async () => {
      const reconcileResult = await apiFetch('/api/billing/reconcile-quantity', {
        method: 'POST',
      });
      if (!reconcileResult.ok) {
        console.error('[billing:quantity] reconcile request failed', {
          status: reconcileResult.status,
          error: reconcileResult.error,
        });
        return;
      }
      await loadSubscriptionSnapshot({ silent: true });
      router.refresh();
    })();
  }, [resolvedBillingEnabled, snapshotQuantity, snapshotOwnedCount, loadSubscriptionSnapshot, router]);

  const openDeleteModal = () => {
    setDeleteKeyword('');
    setDeleteError('');
    setDeleteErrorDetails(null);
    setDeleteErrorManageBillingUrl(null);
    setDeleteModalOpen(true);
  };

  const handleRefreshStatus = async () => {
    setStatusRefreshLoading(true);
    setDeleteError('');
    setDeleteErrorDetails(null);
    setDeleteErrorManageBillingUrl(null);
    try {
      await refreshDeleteEligibilityFast();
    } finally {
      setStatusRefreshLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!activeRestaurantId || !canSubmitDelete) return;

    setDeleteLoading(true);
    setDeleteError('');
    setDeleteErrorDetails(null);
    setDeleteErrorManageBillingUrl(null);

    const result = await apiFetch<DeleteAccountResponse | DeleteAccountError>(
      '/api/account/delete',
      {
        method: 'POST',
        json: {
          organizationId: activeRestaurantId,
          confirm: 'DELETE',
        },
      },
    );

    if (!result.ok) {
      const errorBody = (result.data ?? null) as DeleteAccountError | null;
      // eslint-disable-next-line no-console
      console.error('[ui:delete]', {
        status: result.status,
        error: result.error ?? null,
        response: errorBody,
      });
      setDeleteErrorDetails(errorBody);
      if (result.status === 409 && errorBody?.error === 'SUBSCRIPTION_ACTIVE') {
        setDeleteError(
          errorBody.message || 'Cancel your subscription before deleting this organization.',
        );
        setDeleteErrorManageBillingUrl(errorBody.manageBillingUrl ?? null);
        await loadSubscriptionSnapshot();
      } else {
        setDeleteError(
          errorBody?.message ||
          errorBody?.error ||
          result.error ||
          'Unable to delete account right now.',
        );
      }
      setDeleteLoading(false);
      return;
    }

    setDeleteModalOpen(false);
    setDeleteLoading(false);
    setDeleteSuccessVisible(true);

    await sleep(900);
    await signOut();
    clearDeletionStorageKeys();
    router.replace('/start');
  };

  if (!isInitialized || subscriptionStatus === 'loading' || snapshotLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!currentUser || !canUseDangerZone) {
    return deleteSuccessVisible ? (
      <div className="fixed bottom-4 right-4 z-50 animate-slide-in">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 shadow-lg">
          <CheckCircle className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-200">Account deleted</span>
        </div>
      </div>
    ) : null;
  }

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
    <>
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
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

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-zinc-900" />
              </div>
              <div>
                <p className="font-semibold text-theme-primary">ShiftFlow Pro - {planLabel}</p>
                <StatusBadge />
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-tertiary">Locations</span>
              <span className="text-theme-primary font-medium">
                {quantity} location{quantity !== 1 ? 's' : ''} x ${pricePerUnit.toFixed(2)}{interval} ={' '}
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

        <div className="flex justify-end">
          <button
            onClick={openDeleteModal}
            className="text-sm text-red-400 hover:text-red-300 underline underline-offset-4 transition-colors"
          >
            Delete organization...
          </button>
        </div>
      </div>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (deleteLoading) return;
          setDeleteModalOpen(false);
        }}
        title="Delete Organization"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">
              Deleting this organization removes all schedules, staff, and data. This ends access immediately. This cannot be undone.
            </p>
          </div>

          {isBlockedBySubscription && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
              <p className="text-sm text-amber-300">
                Cancel your subscription before deleting.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  Manage Billing
                </button>
                <button
                  onClick={handleRefreshStatus}
                  disabled={statusRefreshLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-theme-primary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {statusRefreshLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  I already canceled - refresh status
                </button>
              </div>
            </div>
          )}

          {!isBlockedBySubscription && deleteAllowedByScheduledCancel && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-300">
                Subscription is scheduled to cancel on {currentPeriodEndLabel ?? 'the period end date'}. You may delete now, but access ends immediately.
              </p>
            </div>
          )}

          {!isBlockedBySubscription && !deleteAllowedByScheduledCancel && (
            <div className="rounded-lg border border-theme-primary bg-theme-primary p-3">
              <p className="text-sm text-theme-secondary">
                No blocking active subscription found. You may permanently delete this organization.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm text-theme-secondary mb-2" htmlFor="delete-keyword">
              Type <span className="font-semibold text-red-300">DELETE</span> to confirm
            </label>
            <input
              id="delete-keyword"
              type="text"
              value={deleteKeyword}
              onChange={(event) => setDeleteKeyword(event.target.value)}
              disabled={deleteLoading}
              className="w-full rounded-lg border border-theme-primary bg-theme-primary px-3 py-2 text-sm text-theme-primary outline-none focus:border-red-500/50"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {deleteError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 space-y-2">
              <p className="text-sm text-red-300">{deleteError}</p>
              {(deleteErrorDetails?.table || deleteErrorDetails?.code || deleteErrorDetails?.details || deleteErrorDetails?.hint) && (
                <div className="space-y-1 text-xs text-red-200/90">
                  {deleteErrorDetails?.table && <p>Table: <span className="font-mono">{deleteErrorDetails.table}</span></p>}
                  {deleteErrorDetails?.code && <p>Code: <span className="font-mono">{deleteErrorDetails.code}</span></p>}
                  {deleteErrorDetails?.details && <p>Details: {deleteErrorDetails.details}</p>}
                  {deleteErrorDetails?.hint && <p>Hint: {deleteErrorDetails.hint}</p>}
                </div>
              )}
              {deleteErrorManageBillingUrl && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleManageBilling}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Manage Billing
                  </button>
                  <button
                    onClick={handleRefreshStatus}
                    disabled={statusRefreshLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-theme-primary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {statusRefreshLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    I already canceled - refresh status
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm rounded-lg border border-theme-primary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={!canSubmitDelete}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white transition-colors hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600"
              >
                {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Permanently delete
              </button>
            </div>
            {isBlockedBySubscription && (
              <p className="mt-2 text-right text-xs text-amber-300">
                Deletion is disabled until the subscription is canceled (or scheduled to cancel).
              </p>
            )}
            {!isBlockedBySubscription && !keywordConfirmed && (
              <p className="mt-2 text-right text-xs text-theme-tertiary">
                Type DELETE to enable.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {deleteSuccessVisible && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-in">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 shadow-lg">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-200">Account deleted</span>
          </div>
        </div>
      )}
    </>
  );
}
