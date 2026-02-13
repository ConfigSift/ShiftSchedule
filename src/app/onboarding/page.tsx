'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, ChevronRight, Clock, Loader2, MapPin, Store } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase/client';

type CreateOrganizationResponse = {
  intentId: string;
  desiredQuantity: number;
  billingEnabled: boolean;
  hasActiveSubscription: boolean;
  needsUpgrade: boolean;
};

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/New_York';
  }
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

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

  const [restaurantName, setRestaurantName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [timezone, setTimezone] = useState(() => detectTimezone());
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [hasAuthSession, setHasAuthSession] = useState(false);
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

  // Check if user is only an employee (invited staff should never see onboarding)
  const isEmployeeOnly = useMemo(() => {
    if (accessibleRestaurants.length === 0) return false;
    return accessibleRestaurants.every((r) => {
      const role = String(r.role ?? '').trim().toLowerCase();
      return role === 'employee' || role === 'staff';
    });
  }, [accessibleRestaurants]);

  // Redirect if not authenticated, employee, or already has a restaurant
  useEffect(() => {
    if (!isInitialized || !isAuthResolved) return;

    if (!hasAuthSession) {
      router.replace('/login');
      return;
    }

    // Employees should never see onboarding — send them to dashboard
    if (isEmployeeOnly) {
      router.replace('/dashboard');
      return;
    }

    // If user already has a restaurant, send admin/managers to subscribe
    if (selectedRestaurant) {
      setActiveOrganization(selectedRestaurant.id, selectedRestaurant.restaurantCode ?? null);
      router.replace('/subscribe');
    }
  }, [isInitialized, isAuthResolved, hasAuthSession, isEmployeeOnly, selectedRestaurant, setActiveOrganization, router]);

  const canSubmit = restaurantName.trim().length > 0 && !loading;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const trimmedRestaurantName = restaurantName.trim();
    if (!trimmedRestaurantName) {
      setError('Restaurant name is required.');
      return;
    }

    setLoading(true);
    try {
      const createResult = await apiFetch<CreateOrganizationResponse>('/api/orgs/create-intent', {
        method: 'POST',
        json: {
          restaurantName: trimmedRestaurantName,
          locationName: locationName.trim() || trimmedRestaurantName,
          timezone,
        },
      });
      if (!createResult.ok || !createResult.data?.intentId) {
        setError(createResult.error || 'Unable to create restaurant.');
        return;
      }

      const nextIntentId = createResult.data.intentId;
      const canCommitNow =
        !createResult.data.billingEnabled ||
        (createResult.data.hasActiveSubscription && !createResult.data.needsUpgrade);

      if (canCommitNow) {
        const commitResult = await apiFetch<{ ok: boolean; organizationId: string; restaurantCode?: string | null }>(
          '/api/orgs/commit-intent',
          {
            method: 'POST',
            json: { intentId: nextIntentId },
          },
        );

        if (!commitResult.ok || !commitResult.data?.organizationId) {
          setError(commitResult.error || 'Unable to create restaurant.');
          return;
        }

        await refreshProfile();
        const organizationId = commitResult.data.organizationId;
        const matchedRestaurant = useAuthStore
          .getState()
          .accessibleRestaurants
          .find((restaurant) => restaurant.id === organizationId);
        setActiveOrganization(organizationId, matchedRestaurant?.restaurantCode ?? null);
        router.replace('/dashboard');
        return;
      }

      router.replace(`/subscribe?intent=${encodeURIComponent(nextIntentId)}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isInitialized || !isAuthResolved) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  // If user already has a restaurant, show loading while redirecting
  if (selectedRestaurant) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">Set up your restaurant</h1>
          <p className="text-theme-tertiary mt-1">
            Tell us about your restaurant to get started.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-full bg-amber-500 text-zinc-900 flex items-center justify-center text-xs font-bold">
              1
            </div>
            <span className="text-sm font-medium text-theme-primary">Restaurant</span>
          </div>
          <ChevronRight className="w-4 h-4 text-theme-muted" />
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-full bg-theme-tertiary text-theme-muted flex items-center justify-center text-xs font-bold">
              2
            </div>
            <span className="text-sm text-theme-muted">Choose Plan</span>
          </div>
        </div>

        {/* Form */}
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Back link */}
            <Link
              href="/start"
              className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors -mt-1 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Restaurant name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Mario's Italian Kitchen"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Location name or address <span className="text-theme-muted text-xs">(optional)</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Downtown / 123 Main St"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Timezone
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none"
                >
                  {/* Show detected timezone first if not in common list */}
                  {!COMMON_TIMEZONES.includes(timezone) && (
                    <option value={timezone}>{timezone} (detected)</option>
                  )}
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}{tz === detectTimezone() ? ' (detected)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? 'Creating restaurant...' : 'Create Restaurant'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
