'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';
import { PlusCircle, Check, ChevronRight, Pencil, Store, Mail } from 'lucide-react';

export default function RestaurantSelectPage() {
  const router = useRouter();
  const {
    currentUser,
    isInitialized,
    accessibleRestaurants,
    activeRestaurantId,
    pendingInvitations,
    setActiveOrganization,
    init,
    refreshProfile,
    refreshInvitations,
  } = useAuthStore();

  const [inviteError, setInviteError] = useState('');
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [manageError, setManageError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

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

  const hasManagerMembership = useMemo(
    () =>
      accessibleRestaurants.some((restaurant) => {
        const value = String(restaurant.role ?? '').trim().toLowerCase();
        return value === 'admin' || value === 'manager';
      }),
    [accessibleRestaurants]
  );

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

  const handleCreateRestaurant = async () => {
    setManageError('');
    const name = newRestaurantName.trim();
    if (!name) {
      setManageError('Restaurant name is required');
      return;
    }

    const result = await apiFetch('/api/organizations/create', {
      method: 'POST',
      json: { name },
    });

    if (!result.ok || !result.data?.id) {
      setManageError(result.error || 'Unable to create restaurant. Try again.');
      return;
    }

    await refreshProfile();
    setActiveOrganization(result.data.id, result.data.restaurant_code);
    setNewRestaurantName('');
    router.push('/dashboard');
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

        {/* Create Restaurant Card - ONLY for admin/manager */}
        {hasManagerMembership && !editingId && (
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
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors text-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create
                </button>
              </div>
              {manageError && !editingId && <p className="text-xs text-red-400 mt-2">{manageError}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
