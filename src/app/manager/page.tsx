'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight, Copy, PlusCircle, Users } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '../../store/authStore';
import { useRestaurantStore, generateRestaurantCode } from '../../store/restaurantStore';
import { supabase } from '../../lib/supabase/client';
import { getUserRole, isManagerRole } from '../../utils/role';

export default function ManagerPage() {
  const router = useRouter();
  const { currentUser, userProfiles, init, isInitialized, activeRestaurantId, setActiveOrganization, refreshProfile } = useAuthStore();
  const {
    restaurants,
    hydrate: hydrateRestaurants,
    isHydrated: restaurantsHydrated,
    addRestaurant,
    getRestaurantsByIds,
    getRestaurantByCode,
  } = useRestaurantStore();

  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const restaurantIds = userProfiles.map((profile) => profile.organizationId);
    hydrateRestaurants(restaurantIds);
  }, [hydrateRestaurants, userProfiles]);

  useEffect(() => {
    if (isInitialized) {
      if (!currentUser) {
        router.push('/login');
      } else if (!isManagerRole(getUserRole(currentUser.role))) {
        router.push('/dashboard');
      }
    }
  }, [isInitialized, currentUser, router]);

  if (!restaurantsHydrated || !isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const managerRestaurantIds = userProfiles.map((profile) => profile.organizationId);
  const managerRestaurants = getRestaurantsByIds(managerRestaurantIds);

  const handleSelectRestaurant = (restaurantId: string) => {
    const selected = restaurants.find((item) => item.id === restaurantId);
    setActiveOrganization(restaurantId, selected?.restaurantCode ?? null);
    router.push('/dashboard');
  };

  const handleCopyCode = async (restaurantCode: string, restaurantId: string) => {
    try {
      await navigator.clipboard.writeText(restaurantCode);
      setCopiedId(restaurantId);
      setTimeout(() => setCopiedId((current) => (current === restaurantId ? null : current)), 2000);
    } catch {
      setError('Unable to copy restaurant code. Copy it manually.');
    }
  };

  const handleCreateRestaurant = async () => {
    setError('');
    const name = newRestaurantName.trim();
    if (!name) {
      setError('Restaurant name is required');
      return;
    }

    let restaurantCode = '';
    for (let i = 0; i < 5; i += 1) {
      const candidate = generateRestaurantCode();
      const existing = await getRestaurantByCode(candidate);
      if (!existing) {
        restaurantCode = candidate;
        break;
      }
    }

    if (!restaurantCode) {
      setError('Unable to generate a unique restaurant code. Try again.');
      return;
    }

    let newRestaurant;
    try {
      newRestaurant = await addRestaurant({
        name,
        restaurantCode,
        createdByUserId: currentUser.id,
      });
    } catch {
      setError('Unable to create restaurant. Try again.');
      return;
    }

    const { error: userError } = await (supabase as any).from('users').insert({
      auth_user_id: currentUser.authUserId,
      organization_id: newRestaurant.id,
      email: currentUser.email,
      phone: currentUser.phone,
      full_name: currentUser.fullName,
      account_type: currentUser.role,
      jobs: currentUser.jobs ?? [],
    });

    if (userError) {
      setError(userError.message);
      return;
    }

    await refreshProfile();
    setActiveOrganization(newRestaurant.id, newRestaurant.restaurantCode);
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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/time-off"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
          >
            <Users className="w-4 h-4" />
            Time Off
          </Link>
          <Link
            href="/staff"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
          >
            <Users className="w-4 h-4" />
            Manage Staff
          </Link>
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
                  className="w-full flex items-center justify-between bg-theme-tertiary border border-theme-primary rounded-xl p-4 text-left hover:bg-theme-hover transition-colors"
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
                    <button
                      type="button"
                      onClick={() => handleCopyCode(restaurant.restaurantCode, restaurant.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-theme-primary bg-theme-secondary text-theme-secondary hover:bg-theme-hover transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedId === restaurant.id ? 'Copied' : 'Copy'}
                    </button>
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
      </main>
    </div>
  );
}
