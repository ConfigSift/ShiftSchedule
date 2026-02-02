'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight, PlusCircle, Pencil } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';

const MANAGER_ROLES = new Set(['admin', 'manager']);

function hasManagerMembership(role?: string | null) {
  return MANAGER_ROLES.has(String(role ?? '').trim().toLowerCase());
}

export default function ManagerClient() {
  const router = useRouter();
  const {
    currentUser,
    init,
    isInitialized,
    activeRestaurantId,
    setActiveOrganization,
    refreshProfile,
    accessibleRestaurants,
  } = useAuthStore();

  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

  useEffect(() => {
    init();
  }, [init]);

  const canManageSite = useMemo(
    () => accessibleRestaurants.some((restaurant) => hasManagerMembership(restaurant.role)),
    [accessibleRestaurants]
  );

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!canManageSite) {
      if (!activeRestaurantId && accessibleRestaurants.length > 1) {
        router.push('/restaurants');
      } else {
        router.push('/dashboard');
      }
    }
  }, [isInitialized, currentUser, canManageSite, activeRestaurantId, accessibleRestaurants, router]);

  if (!isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const managerRestaurants = accessibleRestaurants;

  const handleSelectRestaurant = (restaurantId: string) => {
    const selected = managerRestaurants.find((item) => item.id === restaurantId);
    setActiveOrganization(restaurantId, selected?.restaurantCode ?? null);
    router.push('/dashboard');
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditedName(name);
    setError('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editedName.trim()) {
      setError('Restaurant name is required.');
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
      setError(result.error || 'Unable to update restaurant.');
      return;
    }
    setEditingId(null);
    setEditedName('');
    await refreshProfile();
  };

  const handleCreateRestaurant = async () => {
    setError('');
    const name = newRestaurantName.trim();
    if (!name) {
      setError('Restaurant name is required');
      return;
    }

    const result = await apiFetch('/api/organizations/create', {
      method: 'POST',
      json: { name },
    });

    if (!result.ok || !result.data?.id) {
      setError(result.error || 'Unable to create restaurant. Try again.');
      return;
    }

    await refreshProfile();
    setActiveOrganization(result.data.id, result.data.restaurant_code);
    setNewRestaurantName('');
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <header className="max-w-3xl mx-auto mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary">Site Manager</h1>
          <p className="text-theme-tertiary mt-1">
            Choose which restaurant you want to manage.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto space-y-6">
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-theme-primary mb-3">Your Restaurants</h2>

          {managerRestaurants.length === 0 ? (
            <p className="text-sm text-theme-muted">No restaurants yet. Create your first one below.</p>
          ) : (
            <div className="space-y-3">
              {managerRestaurants.map((restaurant) => (
                <div
                  key={restaurant.id}
                  className={`w-full flex items-center justify-between bg-theme-tertiary border rounded-xl p-4 text-left transition-colors ${
                    activeRestaurantId === restaurant.id
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-theme-primary hover:bg-theme-hover'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectRestaurant(restaurant.id)}
                    className="flex items-center gap-3 text-left flex-1"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-theme-primary font-medium">{restaurant.name}</p>
                      <p className="text-xs text-theme-muted">Restaurant ID: {restaurant.restaurantCode}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 text-xs text-theme-muted">
                    {canManageSite && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(restaurant.id, restaurant.name)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-theme-primary bg-theme-secondary text-theme-secondary hover:bg-theme-hover transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    <span className="inline-flex items-center gap-1">
                      {activeRestaurantId === restaurant.id ? 'Active' : 'Select'}
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editingId && (
          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-theme-primary mb-3">Edit Restaurant</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setEditedName('');
                  }}
                  className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveEdit(editingId)}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          </div>
        )}

        {canManageSite && (
          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-theme-primary mb-3">Create a Restaurant</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newRestaurantName}
                onChange={(e) => setNewRestaurantName(e.target.value)}
                className="flex-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="Restaurant name"
              />
              <button
                onClick={handleCreateRestaurant}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-all hover:scale-[1.02]"
              >
                <PlusCircle className="w-4 h-4" />
                Create
              </button>
            </div>
            {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
