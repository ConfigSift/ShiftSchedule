'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Loader2, MapPin, Store } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase/client';

type CreateOrganizationResponse = {
  id: string;
  name: string;
  restaurant_code: string;
};

function looksLikeMissingAddressColumn(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes('column') && lowered.includes('address');
}

export default function OnboardingPage() {
  const router = useRouter();
  const {
    isInitialized,
    init,
    accessibleRestaurants,
    activeRestaurantId,
    setActiveOrganization,
    refreshProfile,
  } = useAuthStore();

  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [hasAuthSession, setHasAuthSession] = useState(false);
  const [checkingLocations, setCheckingLocations] = useState(true);
  const [hasAtLeastOneLocation, setHasAtLeastOneLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const selectedRestaurant = useMemo(() => {
    if (accessibleRestaurants.length === 0) return null;
    if (!activeRestaurantId) return accessibleRestaurants[0];
    return accessibleRestaurants.find((row) => row.id === activeRestaurantId) ?? accessibleRestaurants[0];
  }, [accessibleRestaurants, activeRestaurantId]);

  useEffect(() => {
    if (!isInitialized || !isAuthResolved) return;

    if (!hasAuthSession) {
      router.replace('/login');
      return;
    }

    if (!selectedRestaurant) {
      setCheckingLocations(false);
      setHasAtLeastOneLocation(false);
      return;
    }

    if (!activeRestaurantId || activeRestaurantId !== selectedRestaurant.id) {
      setActiveOrganization(selectedRestaurant.id, selectedRestaurant.restaurantCode ?? null);
    }

    let cancelled = false;
    async function checkLocations() {
      setCheckingLocations(true);
      const { data, error: lookupError } = await supabase
        .from('locations')
        .select('id')
        .eq('organization_id', selectedRestaurant.id)
        .limit(1);

      if (cancelled) return;
      if (lookupError) {
        setError(lookupError.message || 'Unable to load location status.');
        setHasAtLeastOneLocation(false);
        setCheckingLocations(false);
        return;
      }

      setHasAtLeastOneLocation((data?.length ?? 0) > 0);
      setCheckingLocations(false);
    }

    checkLocations();
    return () => {
      cancelled = true;
    };
  }, [
    isInitialized,
    isAuthResolved,
    hasAuthSession,
    selectedRestaurant,
    activeRestaurantId,
    setActiveOrganization,
    router,
  ]);

  useEffect(() => {
    if (!isInitialized || !isAuthResolved || !hasAuthSession) return;
    if (checkingLocations) return;
    if (!hasAtLeastOneLocation) return;
    router.replace('/subscribe');
  }, [isInitialized, isAuthResolved, hasAuthSession, checkingLocations, hasAtLeastOneLocation, router]);

  const canSubmit = locationName.trim().length > 0 && !loading;

  async function ensureFirstLocation(organizationId: string, name: string, streetAddress: string) {
    const basePayload = {
      organization_id: organizationId,
      name,
      sort_order: 0,
    };

    if (!streetAddress) {
      const { error: baseInsertError } = await (supabase as any).from('locations').insert(basePayload);
      return baseInsertError ? String(baseInsertError.message ?? 'Unable to create first location.') : null;
    }

    const withAddressPayload = {
      ...basePayload,
      address: streetAddress,
    };
    const { error: withAddressError } = await (supabase as any).from('locations').insert(withAddressPayload);

    if (!withAddressError) return null;
    const addressErrorMessage = String(withAddressError.message ?? '');
    if (!looksLikeMissingAddressColumn(addressErrorMessage)) {
      return addressErrorMessage || 'Unable to create first location.';
    }

    const { error: retryError } = await (supabase as any).from('locations').insert(basePayload);
    return retryError ? String(retryError.message ?? 'Unable to create first location.') : null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const trimmedName = locationName.trim();
    const trimmedAddress = address.trim();
    if (!trimmedName) {
      setError('Location name is required.');
      return;
    }

    setLoading(true);
    try {
      let targetOrganizationId = selectedRestaurant?.id ?? null;
      let targetRestaurantCode = selectedRestaurant?.restaurantCode ?? null;

      if (!targetOrganizationId) {
        const createResult = await apiFetch<CreateOrganizationResponse>('/api/organizations/create', {
          method: 'POST',
          json: { name: trimmedName },
        });
        if (!createResult.ok || !createResult.data?.id) {
          setError(createResult.error || 'Unable to create restaurant.');
          return;
        }
        targetOrganizationId = createResult.data.id;
        targetRestaurantCode = createResult.data.restaurant_code;

        // Ensure retries target the same org if first location insert fails.
        await refreshProfile();
        setActiveOrganization(targetOrganizationId, targetRestaurantCode ?? null);
      }

      const locationInsertError = await ensureFirstLocation(
        targetOrganizationId,
        trimmedName,
        trimmedAddress
      );
      if (locationInsertError) {
        setError(locationInsertError);
        return;
      }

      await refreshProfile();
      setActiveOrganization(targetOrganizationId, targetRestaurantCode ?? null);
      router.replace('/subscribe');
    } finally {
      setLoading(false);
    }
  };

  if (!isInitialized || !isAuthResolved || checkingLocations) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">Create your first location</h1>
          <p className="text-theme-tertiary mt-1">
            Add your first location before choosing a subscription plan.
          </p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Location name
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Downtown"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Address (optional)
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="123 Main St"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? 'Saving location...' : 'Continue to Subscribe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
