'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';
import { Modal } from '../../components/Modal';
import { PlusCircle, Check, ChevronRight, Pencil, Store, Mail, Trash2 } from 'lucide-react';

type CreateIntentResponse = {
  intentId: string;
  desiredQuantity: number;
  ownedOrgCount: number;
  billingEnabled: boolean;
  hasActiveSubscription: boolean;
  needsUpgrade: boolean;
};

type UpgradeQuantityResponse = {
  ok?: boolean;
  bypass?: boolean;
  upgraded?: boolean;
  code?: string;
  message?: string;
  redirect?: string;
  manageBillingUrl?: string;
  hostedInvoiceUrl?: string;
  error?: string;
};

type CommitIntentResponse = {
  ok: boolean;
  organizationId: string;
  restaurantCode?: string | null;
};

type DeleteRestaurantResponse = {
  ok: boolean;
  quantitySynced?: boolean;
  newQuantity?: number | null;
  ownedRestaurantCount?: number;
  syncError?: string;
};

export default function RestaurantSelectPage() {
  const router = useRouter();
  const {
    currentUser,
    isInitialized,
    accessibleRestaurants,
    activeRestaurantId,
    pendingInvitations,
    setActiveOrganization,
    clearActiveOrganization,
    init,
    refreshProfile,
    refreshInvitations,
  } = useAuthStore();

  const [inviteError, setInviteError] = useState('');
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [manageError, setManageError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [intentDesiredQuantity, setIntentDesiredQuantity] = useState<number | null>(null);
  const [createModalStep, setCreateModalStep] = useState<'hidden' | 'upgrade' | 'payment'>('hidden');
  const [createFlowError, setCreateFlowError] = useState('');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; restaurantCode: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteToast, setDeleteToast] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!deleteToast) return;
    const timer = setTimeout(() => {
      setDeleteToast(null);
    }, 3500);
    return () => {
      clearTimeout(timer);
    };
  }, [deleteToast]);

  useEffect(() => {
    if (!isInitialized) return;

    // No user -> login
    if (!currentUser) {
      router.push('/login');
      return;
    }

    // DO NOT auto-redirect if:
    // - User has pending invitations (let them see/manage them)
    // - User has multiple restaurants (let them switch)
    // Only auto-redirect for single membership with no pending invitations
    if (
      accessibleRestaurants.length === 1 &&
      pendingInvitations.length === 0 &&
      !activeRestaurantId
    ) {
      const only = accessibleRestaurants[0];
      setActiveOrganization(only.id, only.restaurantCode);
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[restaurants] single membership, no invitations, auto-selecting and redirecting');
      }
      router.push('/dashboard');
    }

    // If activeRestaurantId is already set AND no pending invites AND user navigated here directly,
    // we let them stay (they may want to switch restaurants).
    // The page is now accessible to all authenticated users.
  }, [isInitialized, currentUser, activeRestaurantId, accessibleRestaurants, pendingInvitations, router, setActiveOrganization]);

  const hasAdminMembership = useMemo(
    () =>
      accessibleRestaurants.some((restaurant) => {
        const value = String(restaurant.role ?? '').trim().toLowerCase();
        return value === 'admin';
      }),
    [accessibleRestaurants]
  );
  const canCreateRestaurant = accessibleRestaurants.length === 0 || hasAdminMembership;

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const handleSelectRestaurant = (restaurantId: string) => {
    const selected = accessibleRestaurants.find((item) => item.id === restaurantId);
    setActiveOrganization(restaurantId, selected?.restaurantCode ?? null);
    router.push('/dashboard');
  };

  const handleInviteResponse = async (invitationId: string, action: 'accept' | 'decline') => {
    setInviteError('');
    const result = await apiFetch('/api/auth/invitations/respond', {
      method: 'POST',
      json: { invitationId, action },
    });
    if (!result.ok) {
      setInviteError(result.error || 'Unable to update invitation.');
      return;
    }
    // Refresh profile and invitations from store (updates accessibleRestaurants and pendingInvitations)
    await refreshProfile();
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditedName(name);
    setManageError('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editedName.trim()) {
      setManageError('Restaurant name is required.');
      return;
    }
    const result = await apiFetch('/api/organizations/update', {
      method: 'POST',
      json: {
        organizationId: id,
        name: editedName.trim(),
      },
    });
    if (!result.ok) {
      setManageError(result.error || 'Unable to update restaurant.');
      return;
    }
    setEditingId(null);
    setEditedName('');
    await refreshProfile();
  };

  const clearIntentFlow = () => {
    setIntentId(null);
    setIntentDesiredQuantity(null);
    setCreateModalStep('hidden');
    setCreateFlowError('');
    setPaymentUrl(null);
    setUpgradeSubmitting(false);
  };

  const commitIntent = async (nextIntentId: string) => {
    const result = await apiFetch<CommitIntentResponse | UpgradeQuantityResponse>('/api/orgs/commit-intent', {
      method: 'POST',
      json: { intentId: nextIntentId },
    });

    if (result.ok && (result.data as CommitIntentResponse | null)?.organizationId) {
      const organizationId = (result.data as CommitIntentResponse).organizationId;
      await refreshProfile();
      const matchedRestaurant = useAuthStore
        .getState()
        .accessibleRestaurants
        .find((restaurant) => restaurant.id === organizationId);
      setActiveOrganization(organizationId, matchedRestaurant?.restaurantCode ?? null);
      setNewRestaurantName('');
      clearIntentFlow();
      router.push('/dashboard');
      return true;
    }

    const body = (result.data ?? null) as UpgradeQuantityResponse | null;
    if (result.status === 409) {
      if (body?.code === 'NO_ACTIVE_SUBSCRIPTION' && body.redirect) {
        router.push(body.redirect);
        return false;
      }
      setCreateFlowError(body?.message || 'Payment is required before this restaurant can be created.');
      setCreateModalStep('payment');
      setPaymentUrl(body?.hostedInvoiceUrl ?? body?.manageBillingUrl ?? body?.redirect ?? '/billing');
      return false;
    }

    setCreateFlowError(body?.message || body?.error || result.error || 'Unable to create restaurant.');
    return false;
  };

  const runUpgradeQuantity = async (nextIntentId: string) => {
    setUpgradeSubmitting(true);
    setCreateFlowError('');

    const result = await apiFetch<UpgradeQuantityResponse>('/api/billing/upgrade-quantity', {
      method: 'POST',
      json: { intentId: nextIntentId },
    });

    if (!result.ok || !result.data) {
      setCreateFlowError(result.error || 'Unable to update subscription quantity.');
      setUpgradeSubmitting(false);
      return;
    }

    if (result.data.ok && (result.data.upgraded || result.data.bypass)) {
      const committed = await commitIntent(nextIntentId);
      setUpgradeSubmitting(false);
      if (committed) return;
      return;
    }

    if (result.data.code === 'NO_SUBSCRIPTION') {
      setUpgradeSubmitting(false);
      router.push(result.data.redirect || `/subscribe?intent=${encodeURIComponent(nextIntentId)}`);
      return;
    }

    if (result.data.code === 'PAYMENT_REQUIRED') {
      setCreateModalStep('payment');
      setPaymentUrl(result.data.hostedInvoiceUrl ?? result.data.manageBillingUrl ?? '/billing');
      setCreateFlowError(result.data.message || 'Complete payment, then return and continue.');
      setUpgradeSubmitting(false);
      return;
    }

    setCreateFlowError(result.data.message || result.data.error || 'Unable to update subscription quantity.');
    setUpgradeSubmitting(false);
  };

  const handleCancelPendingIntent = async () => {
    if (!intentId) {
      clearIntentFlow();
      return;
    }
    await apiFetch('/api/orgs/cancel-intent', {
      method: 'POST',
      json: { intentId },
    });
    clearIntentFlow();
  };

  const handleCreateRestaurant = async () => {
    setManageError('');
    const name = newRestaurantName.trim();
    if (!name) {
      setManageError('Restaurant name is required');
      return;
    }

    setCreateSubmitting(true);
    setCreateFlowError('');

    const createIntentResult = await apiFetch<CreateIntentResponse>('/api/orgs/create-intent', {
      method: 'POST',
      json: { restaurantName: name },
    });

    if (!createIntentResult.ok || !createIntentResult.data?.intentId) {
      setManageError(createIntentResult.error || 'Unable to create restaurant. Try again.');
      setCreateSubmitting(false);
      return;
    }

    const nextIntentId = createIntentResult.data.intentId;
    setIntentId(nextIntentId);
    setIntentDesiredQuantity(createIntentResult.data.desiredQuantity);

    if (!createIntentResult.data.billingEnabled) {
      await commitIntent(nextIntentId);
      setCreateSubmitting(false);
      return;
    }

    if (!createIntentResult.data.hasActiveSubscription) {
      setCreateSubmitting(false);
      router.push(`/subscribe?intent=${encodeURIComponent(nextIntentId)}`);
      return;
    }

    if (createIntentResult.data.needsUpgrade) {
      setCreateModalStep('upgrade');
      setCreateSubmitting(false);
      return;
    }

    await commitIntent(nextIntentId);
    setCreateSubmitting(false);
  };

  const handleOpenDelete = (restaurant: { id: string; name: string; restaurantCode: string }) => {
    const orgId = String(restaurant.id ?? '').trim();
    if (!orgId) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('[restaurants] delete modal skipped (missing org id)', restaurant);
      }
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[restaurants] open delete modal', { organizationId: orgId });
    }
    setDeleteTarget({ ...restaurant, id: orgId });
    setDeleteConfirm('');
    setDeleteError('');
  };

  const handleCloseDelete = () => {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteConfirm('');
    setDeleteError('');
  };

  const handleDeleteRestaurant = async () => {
    if (!deleteTarget) return;
    const organizationId = String(deleteTarget.id ?? '').trim();
    if (!organizationId) return;
    const confirmValue = deleteConfirm.trim();
    const isMatch =
      confirmValue === deleteTarget.name || confirmValue === deleteTarget.restaurantCode;
    if (!isMatch) return;
    setDeleteSubmitting(true);
    setDeleteError('');
    const result = await apiFetch<DeleteRestaurantResponse>(`/api/organizations/${organizationId}/delete`, {
      method: 'POST',
    });
    if (!result.ok) {
      setDeleteError(result.error || 'Unable to delete restaurant.');
      setDeleteSubmitting(false);
      return;
    }
    if (activeRestaurantId === deleteTarget.id) {
      clearActiveOrganization();
    }
    await refreshProfile();
    await useAuthStore.getState().fetchSubscriptionStatus();
    const quantitySynced = result.data?.quantitySynced !== false;
    const newQuantity = Number(result.data?.newQuantity ?? 0);
    if (quantitySynced && Number.isFinite(newQuantity) && newQuantity > 0) {
      setDeleteToast({
        type: 'success',
        message: `Restaurant deleted. Billing updated to ${newQuantity} location${newQuantity === 1 ? '' : 's'}.`,
      });
    } else if (quantitySynced) {
      setDeleteToast({
        type: 'success',
        message: 'Restaurant deleted.',
      });
    } else {
      setDeleteToast({
        type: 'warning',
        message: 'Restaurant deleted. Billing update is syncing - refresh in a moment.',
      });
    }
    setDeleteSubmitting(false);
    setDeleteTarget(null);
  };

  return (
    <div className="bg-theme-primary text-theme-primary p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Page header */}
        <div className="mb-2">
          <h1 className="text-xl font-semibold">Site Manager</h1>
          <p className="text-theme-muted text-sm">Select a restaurant to manage.</p>
        </div>

        {/* Your Restaurants Card */}
        <div className="bg-theme-secondary border border-theme-primary rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-theme-primary bg-theme-tertiary/50">
            <h2 className="text-sm font-semibold text-theme-primary">Your Restaurants</h2>
          </div>
          {accessibleRestaurants.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-theme-muted text-sm">No restaurant access found.</p>
              <p className="text-theme-muted text-xs mt-1">Accept an invitation or contact your manager.</p>
            </div>
          ) : (
            <div className="divide-y divide-theme-primary">
              {accessibleRestaurants.map((restaurant) => {
                const isActive = activeRestaurantId === restaurant.id;
                const isManagerForThis = (() => {
                  const role = String(restaurant.role ?? '').trim().toLowerCase();
                  return role === 'admin' || role === 'manager';
                })();
                const isAdminForThis = (() => {
                  const role = String(restaurant.role ?? '').trim().toLowerCase();
                  return role === 'admin';
                })();

                return (
                  <div
                    key={restaurant.id}
                    onClick={() => handleSelectRestaurant(restaurant.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectRestaurant(restaurant.id);
                      }
                    }}
                    className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-amber-500/10'
                        : 'hover:bg-theme-hover'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'bg-theme-tertiary text-theme-muted group-hover:text-theme-secondary'
                    }`}>
                      <Store className="w-4 h-4" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-theme-primary text-sm truncate">{restaurant.name}</p>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[10px] font-semibold uppercase shrink-0">
                            <Check className="w-2.5 h-2.5" />
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-theme-muted">{restaurant.restaurantCode}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isManagerForThis && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(restaurant.id, restaurant.name);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-theme-muted hover:text-theme-primary hover:bg-theme-tertiary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Edit ${restaurant.name}`}
                        >
                          <Pencil className="w-3 h-3" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                      )}
                      {isAdminForThis && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDelete({
                              id: restaurant.id,
                              name: restaurant.name,
                              restaurantCode: restaurant.restaurantCode,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Delete ${restaurant.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      )}
                      {!isActive && (
                        <ChevronRight className="w-4 h-4 text-theme-muted group-hover:text-amber-500 transition-colors" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending Invitations Card */}
        {pendingInvitations.length > 0 && (
          <div className="bg-theme-secondary border border-theme-primary rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-theme-primary bg-theme-tertiary/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-theme-primary">Pending Invitations</h2>
              <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-500 text-zinc-900 text-[10px] font-bold rounded-full">
                {pendingInvitations.length}
              </span>
            </div>
            <div className="divide-y divide-theme-primary">
              {pendingInvitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-500">
                    <Mail className="w-4 h-4" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-theme-primary text-sm truncate">{invite.organizationName || 'Restaurant'}</p>
                    <p className="text-xs text-theme-muted">
                      {invite.restaurantCode} · <span className="capitalize">{invite.role}</span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(invite.id, 'accept')}
                      className="px-3 py-1.5 rounded-md bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors text-xs"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(invite.id, 'decline')}
                      className="px-3 py-1.5 rounded-md bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {inviteError && (
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
                <p className="text-xs text-red-400">{inviteError}</p>
              </div>
            )}
          </div>
        )}

        {/* Edit Restaurant Card */}
        {editingId && (
          <div className="bg-theme-secondary border border-amber-500/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5">
              <h2 className="text-sm font-semibold text-theme-primary">Edit Restaurant</h2>
            </div>
            <div className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditedName('');
                      setManageError('');
                    }}
                    className="px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(editingId)}
                    className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors text-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
              {manageError && <p className="text-xs text-red-400 mt-2">{manageError}</p>}
            </div>
          </div>
        )}

        {/* Create Restaurant Card - ONLY for admin */}
        {canCreateRestaurant && !editingId && (
          <div className="bg-theme-secondary border border-theme-primary rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-theme-primary bg-theme-tertiary/50">
              <h2 className="text-sm font-semibold text-theme-primary">Create Restaurant</h2>
            </div>
            <div className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={newRestaurantName}
                  onChange={(e) => setNewRestaurantName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  placeholder="Restaurant name"
                />
                <button
                  onClick={handleCreateRestaurant}
                  disabled={createSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusCircle className="w-4 h-4" />
                  {createSubmitting ? 'Starting...' : 'Create'}
                </button>
              </div>
              {manageError && !editingId && <p className="text-xs text-red-400 mt-2">{manageError}</p>}
            </div>
          </div>
        )}
        {!canCreateRestaurant && !editingId && (
          <div className="bg-theme-secondary border border-theme-primary rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-theme-primary bg-theme-tertiary/50">
              <h2 className="text-sm font-semibold text-theme-primary">Create Restaurant</h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-theme-muted">Only admins can create restaurants.</p>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={createModalStep !== 'hidden'}
        onClose={() => {
          if (upgradeSubmitting) return;
          void handleCancelPendingIntent();
        }}
        title="Create Restaurant"
        size="md"
      >
        <div className="space-y-4">
          {createModalStep === 'upgrade' && (
            <>
              <p className="text-sm text-theme-secondary">
                Creating this restaurant requires upgrading your subscription to{' '}
                <span className="font-semibold text-amber-400">
                  {intentDesiredQuantity ?? 'the required'}
                </span>{' '}
                locations.
              </p>
              <p className="text-xs text-theme-muted">
                We will only create the restaurant after billing confirms the quantity update.
              </p>
            </>
          )}

          {createModalStep === 'payment' && (
            <>
              <p className="text-sm text-theme-secondary">
                {createFlowError || 'Payment is required before this restaurant can be created.'}
              </p>
              <p className="text-xs text-theme-muted">
                Complete payment, then return and click &quot;I&apos;ve completed payment&quot;.
              </p>
            </>
          )}

          {createFlowError && createModalStep === 'upgrade' && (
            <p className="text-xs text-red-400">{createFlowError}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCancelPendingIntent();
              }}
              disabled={upgradeSubmitting}
              className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors disabled:opacity-50"
            >
              Cancel pending creation
            </button>

            {createModalStep === 'upgrade' && (
              <button
                type="button"
                onClick={() => {
                  if (!intentId) return;
                  void runUpgradeQuantity(intentId);
                }}
                disabled={upgradeSubmitting}
                className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {upgradeSubmitting ? 'Processing...' : 'Continue to payment'}
              </button>
            )}

            {createModalStep === 'payment' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (!paymentUrl) return;
                    window.open(paymentUrl, '_blank');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors"
                >
                  Open billing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!intentId) return;
                    void runUpgradeQuantity(intentId);
                  }}
                  disabled={upgradeSubmitting}
                  className="px-4 py-2 rounded-lg border border-theme-primary text-theme-secondary hover:bg-theme-hover transition-colors disabled:opacity-50"
                >
                  {upgradeSubmitting ? 'Checking...' : "I've completed payment"}
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={handleCloseDelete}
        title="Delete restaurant?"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-theme-secondary">
            This permanently deletes this restaurant and ALL associated data. This cannot be undone.
          </p>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-theme-muted">
              Type restaurant name or code to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              placeholder={deleteTarget ? `${deleteTarget.name} or ${deleteTarget.restaurantCode}` : ''}
            />
          </div>
          {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCloseDelete}
              className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteRestaurant}
              disabled={
                deleteSubmitting ||
                !deleteTarget ||
                !(
                  deleteConfirm.trim() === deleteTarget.name ||
                  deleteConfirm.trim() === deleteTarget.restaurantCode
                )
              }
              className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-400 transition-colors disabled:opacity-50"
            >
              {deleteSubmitting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
      {deleteToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-in">
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg border ${
              deleteToast.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-amber-500/40 bg-amber-500/15 text-amber-100'
            }`}
          >
            <span className="text-sm font-medium">{deleteToast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
