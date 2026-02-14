'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Settings,
  Store,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { apiFetch } from '../../lib/apiClient';
import { TransitionScreen } from '../../components/auth/TransitionScreen';
import { supabase } from '@/lib/supabase/client';

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

type OnboardingRole = 'manager' | null;
type ManagerStep = 1 | 2 | 3;
type PlanId = 'monthly' | 'annual';

type CreateIntentResponse = {
  intentId: string;
  desiredQuantity: number;
  billingEnabled: boolean;
  hasActiveSubscription: boolean;
  needsUpgrade: boolean;
};

type CommitIntentResponse = {
  ok: boolean;
  organizationId: string;
  restaurantCode?: string | null;
};

type CheckoutSessionResponse = {
  checkoutUrl?: string | null;
  redirect?: string | null;
};

type SubscriptionStatusResponse = {
  active?: boolean;
  status?: string;
};

type FinalizeCheckoutResponse = {
  ok: boolean;
  active?: boolean;
  status?: string;
  error?: string;
};

type DayHoursRow = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  enabled: boolean;
};

type InviteRow = {
  name: string;
  email: string;
  role: string;
  hourlyPay: string;
};

function resolveManagerStep(raw: string | null): ManagerStep {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'staff' || normalized === 'subscription' || normalized === 'billing') return 3;
  if (normalized === 'hours' || normalized === 'core' || normalized === 'settings') return 2;

  const numeric = Number(normalized);
  if (numeric === 2 || numeric === 3) return numeric;
  return 1;
}

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

const ROLE_CHIPS = [
  'Server',
  'Bartender',
  'Host',
  'Busser',
  'Cook',
  'Dishwasher',
  'Food Runner',
  'Manager',
];

const DEFAULT_ROLES = ['Server', 'Cook', 'Host'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SUBSCRIPTION_PLANS = [
  {
    id: 'monthly' as PlanId,
    name: 'Monthly',
    subtitle: 'Flexible month-to-month',
    price: '$19.99',
    cadence: '/mo',
    badge: '$1 first month',
    recommended: false,
  },
  {
    id: 'annual' as PlanId,
    name: 'Annual',
    subtitle: 'Best value for growing teams',
    price: '$199',
    cadence: '/yr',
    badge: 'Save 17%',
    recommended: true,
  },
];

type OnboardingSessionState = {
  organizationId?: string;
  restaurantCode?: string;
  ownerName?: string;
};

const SESSION_KEY = 'crewshyft_onboarding';
const STAFF_DRAFTS_KEY_PREFIX = 'crewshyft_setup_staff_drafts:';
const FINALIZE_TIMEOUT_MS = 12_000;
const CHECKOUT_POLL_INTERVAL_MS = 1_500;
const CHECKOUT_POLL_MAX_MS = 120_000;

function buildUniformHours(openTime: string, closeTime: string): DayHoursRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    openTime,
    closeTime,
    enabled: true,
  }));
}

function saveSession(data: OnboardingSessionState) {
  try {
    const current = loadSession();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...data }));
  } catch { /* ignore */ }
}

function loadSession(): OnboardingSessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Step indicator                                                      */
/* ------------------------------------------------------------------ */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < current;
        const isActive = step === current;
        return (
          <div key={step} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isCompleted
                  ? 'bg-amber-500 text-zinc-900'
                  : isActive
                    ? 'bg-amber-500 text-zinc-900'
                    : 'bg-theme-tertiary text-theme-muted'
              }`}
            >
              {isCompleted ? <Check className="w-4 h-4" /> : step}
            </div>
            {step < total && (
              <div
                className={`w-10 sm:w-14 h-0.5 mx-1 transition-colors ${
                  isCompleted ? 'bg-amber-500' : 'bg-theme-tertiary'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function OnboardingStepper() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSetupWizard = pathname === '/setup';

  const {
    currentUser,
    refreshProfile,
    setActiveOrganization,
    activeRestaurantId,
    accessibleRestaurants,
  } = useAuthStore();
  const { setUiLockedForOnboarding } = useUIStore();

  // ---- State ----
  const initialRole = isSetupWizard
    ? 'manager'
    : ((searchParams.get('role') as OnboardingRole) || null);
  const initialStep = resolveManagerStep(searchParams.get('step'));

  const [role, setRole] = useState<OnboardingRole>(initialRole);
  const [managerStep, setManagerStep] = useState<ManagerStep>(
    initialRole === 'manager' ? initialStep : 1,
  );
  const previousManagerStepRef = useRef<ManagerStep>(initialRole === 'manager' ? initialStep : 1);

  const requestedStepParam = useMemo(
    () => String(searchParams.get('step') ?? '').trim(),
    [searchParams],
  );
  const requestedSetupStep = useMemo<ManagerStep | null>(() => {
    if (!requestedStepParam) return null;
    return resolveManagerStep(requestedStepParam);
  }, [requestedStepParam]);
  const checkoutParams = useMemo(
    () => ({
      checkout: String(searchParams.get('checkout') ?? '').trim().toLowerCase(),
      sessionId: String(searchParams.get('session_id') ?? '').trim(),
      intentId: String(searchParams.get('intent_id') ?? '').trim(),
    }),
    [searchParams],
  );

  useEffect(() => {
    const shouldLock =
      pathname.startsWith('/onboarding')
      || pathname.startsWith('/setup')
      || Boolean(requestedStepParam);
    setUiLockedForOnboarding(shouldLock);
    return () => {
      setUiLockedForOnboarding(false);
    };
  }, [pathname, requestedStepParam, setUiLockedForOnboarding]);

  // Step 1 — Restaurant
  const [ownerName, setOwnerName] = useState(() => loadSession().ownerName ?? '');
  const [ownerNameError, setOwnerNameError] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantNameError, setRestaurantNameError] = useState('');
  const [locationName, setLocationName] = useState('');
  const [timezone, setTimezone] = useState(() => detectTimezone());

  // Created org
  const [organizationId, setOrganizationId] = useState<string | null>(
    () => loadSession().organizationId ?? null,
  );
  const [restaurantCode, setRestaurantCode] = useState<string | null>(
    () => loadSession().restaurantCode ?? null,
  );

  // Step 2 — Schedule
  const [weekStartDay, setWeekStartDay] = useState<'sunday' | 'monday'>('monday');
  const [setHours, setSetHours] = useState(false);
  const [businessHours, setBusinessHours] = useState<DayHoursRow[]>(() => buildUniformHours('10:00', '23:00'));
  const [setCoreHours, setSetCoreHours] = useState(false);
  const [coreOpenTime, setCoreOpenTime] = useState('11:00');
  const [coreCloseTime, setCoreCloseTime] = useState('14:00');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(DEFAULT_ROLES);

  // Step 3 — Subscription (staff drafts are edited in Step 2)
  const emptyRow = useCallback(
    (): InviteRow => ({ name: '', email: '', role: selectedRoles[0] || 'Server', hourlyPay: '' }),
    [selectedRoles],
  );
  const [inviteRows, setInviteRows] = useState<InviteRow[]>(() => [
    { name: '', email: '', role: 'Server', hourlyPay: '' },
    { name: '', email: '', role: 'Server', hourlyPay: '' },
    { name: '', email: '', role: 'Server', hourlyPay: '' },
  ]);
  const [latestIntentId, setLatestIntentId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [checkoutFinalizing, setCheckoutFinalizing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [checkoutCanceled, setCheckoutCanceled] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [checkoutManageUrl, setCheckoutManageUrl] = useState<string | null>(null);
  const [finalizeSessionId, setFinalizeSessionId] = useState<string | null>(null);
  const [finalizeIntentId, setFinalizeIntentId] = useState<string | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState('none');
  const handledCheckoutRef = useRef<string | null>(null);
  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  const checkoutPollIntervalRef = useRef<number | null>(null);
  const checkoutPollTimeoutRef = useRef<number | null>(null);
  const checkoutPollInFlightRef = useRef(false);

  // General
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState('');

  const activeRestaurant = useMemo(
    () =>
      activeRestaurantId
        ? accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId)
        : null,
    [activeRestaurantId, accessibleRestaurants],
  );
  const hasExistingOrgInSetup = isSetupWizard && Boolean(activeRestaurantId);
  const setupExitPath = '/restaurants';

  // Derive invite role options from Step 2 selections
  const inviteRoleOptions = useMemo(() => {
    return selectedRoles.length > 0 ? selectedRoles : ROLE_CHIPS;
  }, [selectedRoles]);

  useEffect(() => {
    previousManagerStepRef.current = managerStep;
  }, [managerStep]);

  // ---- URL sync ----
  useEffect(() => {
    const params = new URLSearchParams();
    if (!isSetupWizard && role) params.set('role', role);
    if (isSetupWizard && managerStep > 1) {
      params.set('step', String(managerStep));
    } else if (role === 'manager' && managerStep > 1) {
      params.set('step', String(managerStep));
    }
    if (checkoutParams.checkout) {
      params.set('checkout', checkoutParams.checkout);
    }
    if (checkoutParams.sessionId) {
      params.set('session_id', checkoutParams.sessionId);
    }
    if (checkoutParams.intentId) {
      params.set('intent_id', checkoutParams.intentId);
    }
    const qs = params.toString();
    const newUrl = `${pathname}${qs ? `?${qs}` : ''}`;
    if (typeof window === 'undefined') return;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === newUrl) return;
    window.history.replaceState({}, '', newUrl);
  }, [
    checkoutParams.checkout,
    checkoutParams.intentId,
    checkoutParams.sessionId,
    isSetupWizard,
    managerStep,
    pathname,
    role,
  ]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current !== null) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
      }
      if (checkoutPollIntervalRef.current !== null) {
        window.clearInterval(checkoutPollIntervalRef.current);
      }
      if (checkoutPollTimeoutRef.current !== null) {
        window.clearTimeout(checkoutPollTimeoutRef.current);
      }
      checkoutPollInFlightRef.current = false;
    };
  }, []);

  // ---- Restore org from session on step 2/3 ----
  useEffect(() => {
    if (role === 'manager' && managerStep > 1 && !organizationId) {
      const session = loadSession();
      if (session.organizationId) {
        setOrganizationId(session.organizationId);
        setRestaurantCode(session.restaurantCode ?? null);
      } else {
        // Lost session — reset to step 1
        setManagerStep(1);
      }
    }
  }, [role, managerStep, organizationId]);

  useEffect(() => {
    if (!isSetupWizard || role !== 'manager' || !activeRestaurantId) return;

    if (organizationId !== activeRestaurantId) {
      setOrganizationId(activeRestaurantId);
      setRestaurantCode(activeRestaurant?.restaurantCode ?? null);
      saveSession({
        organizationId: activeRestaurantId,
        restaurantCode: activeRestaurant?.restaurantCode ?? undefined,
      });
    }

    // Keep setup at >= 2 when no explicit step is requested (or step=1),
    // but do not fight explicit requests for step=2 or step=3,
    // and never downgrade from a higher step.
    if (requestedSetupStep === null || requestedSetupStep === 1) {
      if (managerStep === 1) {
        setManagerStep(2);
      }
      return;
    }

    if (requestedSetupStep === 2) {
      if (managerStep < 2) {
        setManagerStep(2);
      }
      return;
    }

    if (requestedSetupStep === 3 && managerStep !== 3) {
      setManagerStep(3);
    }
  }, [
    activeRestaurant?.restaurantCode,
    activeRestaurantId,
    isSetupWizard,
    managerStep,
    organizationId,
    requestedSetupStep,
    role,
  ]);

  // ---- Handlers ----

  const updateBusinessHour = useCallback(
    (dayOfWeek: number, field: 'openTime' | 'closeTime' | 'enabled', value: string | boolean) => {
      setBusinessHours((prev) =>
        prev.map((hour) =>
          hour.dayOfWeek === dayOfWeek
            ? { ...hour, [field]: value }
            : hour,
        ),
      );
    },
    [],
  );

  const applyHoursToAllDays = useCallback(() => {
    setBusinessHours((prev) => {
      const source = prev.find((hour) => hour.enabled) ?? prev[0];
      if (!source) return prev;
      return prev.map((hour) => ({
        ...hour,
        openTime: source.openTime,
        closeTime: source.closeTime,
      }));
    });
  }, []);

  const persistStaffDrafts = useCallback((orgId: string, rows: InviteRow[]) => {
    const staffDrafts = rows
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        role: row.role,
        hourlyPay: row.hourlyPay.trim(),
        email: row.email.trim().toLowerCase(),
      }));
    try {
      localStorage.setItem(
        `${STAFF_DRAFTS_KEY_PREFIX}${orgId}`,
        JSON.stringify({ savedAt: Date.now(), rows: staffDrafts }),
      );
    } catch {
      // ignore
    }
  }, []);

  const finishSetup = useCallback(async () => {
    if (!organizationId) return;
    setTransitionMessage('Setting up your restaurant...');
    setTransitioning(true);
    await refreshProfile();
    const matchedRestaurant = useAuthStore
      .getState()
      .accessibleRestaurants.find((r) => r.id === organizationId);
    setActiveOrganization(organizationId, matchedRestaurant?.restaurantCode ?? restaurantCode);
    clearSession();
    router.replace('/dashboard');
  }, [organizationId, refreshProfile, restaurantCode, router, setActiveOrganization]);

  const skipSetup = useCallback(() => {
    clearSession();
    router.replace(setupExitPath);
  }, [router, setupExitPath]);

  const handleSelectRole = useCallback((selectedRole: 'manager') => {
    setRole(selectedRole);
    setError('');
  }, []);

  const handleBackToRoleSelection = useCallback(() => {
    if (isSetupWizard) {
      setRole('manager');
      setManagerStep(hasExistingOrgInSetup ? 2 : 1);
      setError('');
      return;
    }
    setRole(null);
    setManagerStep(1);
    setError('');
  }, [hasExistingOrgInSetup, isSetupWizard]);

  const handleOwnerNameChange = useCallback((value: string) => {
    setOwnerName(value);
    setOwnerNameError('');
    saveSession({ ownerName: value });
  }, []);

  const handleRestaurantNameChange = useCallback((value: string) => {
    setRestaurantName(value);
    setRestaurantNameError('');
  }, []);

  const copyCoreHoursFromOperating = useCallback(() => {
    const source = businessHours.find((hour) => hour.enabled) ?? businessHours[0];
    if (!source) return;
    setSetCoreHours(true);
    setCoreOpenTime(source.openTime);
    setCoreCloseTime(source.closeTime);
  }, [businessHours]);

  const saveStaffProfiles = useCallback(async (orgId: string) => {
    const staffRows = inviteRows.filter((row) => row.name.trim() && row.role.trim());
    persistStaffDrafts(orgId, staffRows);
    const rowsWithEmail = staffRows.filter((row) => row.email.trim());

    let successCount = 0;
    for (const row of rowsWithEmail) {
      const parsedHourlyPay = Number.parseFloat(row.hourlyPay);
      const hourlyPay = Number.isFinite(parsedHourlyPay) && parsedHourlyPay >= 0 ? parsedHourlyPay : undefined;
      try {
        const result = await apiFetch('/api/admin/create-user', {
          method: 'POST',
          json: {
            organizationId: orgId,
            fullName: row.name.trim(),
            email: row.email.trim().toLowerCase(),
            accountType: 'EMPLOYEE',
            jobs: [row.role],
            employeeNumber: 1000 + successCount + 1,
            ...(hourlyPay !== undefined ? { hourlyPay } : {}),
          },
        });
        if (result.ok || result.status === 409) {
          successCount++;
        }
      } catch {
        // Best effort only during setup.
      }
    }
  }, [inviteRows, persistStaffDrafts]);

  // Step 1: Create restaurant
  const handleCreateRestaurant = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError('');
      const trimmedOwnerName = ownerName.trim();
      const trimmedName = restaurantName.trim();
      if (hasExistingOrgInSetup && organizationId) {
        setManagerStep(2);
        if (isSetupWizard) {
          router.replace('/setup?step=2');
        }
        return;
      }
      const ownerMissing = !trimmedOwnerName;
      const restaurantMissing = !trimmedName;
      setOwnerNameError(ownerMissing ? 'Owner name is required.' : '');
      setRestaurantNameError(restaurantMissing ? 'Restaurant name is required.' : '');
      if (ownerMissing || restaurantMissing) {
        return;
      }

      setLoading(true);
      try {
        const intentResult = await apiFetch<CreateIntentResponse>('/api/orgs/create-intent', {
          method: 'POST',
          json: {
            restaurantName: trimmedName,
            locationName: locationName.trim() || trimmedName,
            timezone,
            // TODO(onboarding): Persist ownerName to backend once a schema field is available.
          },
        });

        if (!intentResult.ok || !intentResult.data?.intentId) {
          setError(intentResult.error || 'Unable to create restaurant.');
          return;
        }

        const intentId = intentResult.data.intentId;
        setLatestIntentId(intentId);

        // Commit the org
        const commitResult = await apiFetch<CommitIntentResponse>('/api/orgs/commit-intent', {
          method: 'POST',
          json: {
            intentId,
            deferBillingCheck: true,
          },
        });

        if (!commitResult.ok || !commitResult.data?.organizationId) {
          setError(commitResult.error || 'Unable to create restaurant.');
          return;
        }

        const newOrgId = commitResult.data.organizationId;
        const newCode = commitResult.data.restaurantCode ?? null;
        setOrganizationId(newOrgId);
        setRestaurantCode(newCode);
        saveSession({
          organizationId: newOrgId,
          restaurantCode: newCode ?? undefined,
          ownerName: trimmedOwnerName,
        });

        const authUserId =
          currentUser?.authUserId
          || (await supabase.auth.getSession()).data.session?.user?.id
          || null;
        if (authUserId) {
          const accountType = String(currentUser?.accountType ?? 'owner').trim().toLowerCase() === 'employee'
            ? 'employee'
            : 'owner';
          const { error: accountProfileError } = await supabase
            .from('account_profiles')
            .upsert(
              {
                auth_user_id: authUserId,
                owner_name: trimmedOwnerName,
                account_type: accountType,
              },
              { onConflict: 'auth_user_id' },
            );
          void accountProfileError;
        }

        await refreshProfile();

        // Advance to Step 2
        setManagerStep(2);
        if (isSetupWizard) {
          router.replace('/setup?step=2');
        }
      } finally {
        setLoading(false);
      }
    },
    [
      currentUser?.accountType,
      currentUser?.authUserId,
      ownerName,
      restaurantName,
      hasExistingOrgInSetup,
      isSetupWizard,
      organizationId,
      locationName,
      timezone,
      refreshProfile,
      router,
    ],
  );

  // Step 2: Save optional setup details and continue to embedded billing.
  const handleSaveOptionalSetup = useCallback(async () => {
    if (!organizationId) {
      setError('We could not find your restaurant setup context. Please go back to Step 1 and try again.');
      return;
    }

    setError('');
    setLoading(true);
    setManagerStep(3);
    if (isSetupWizard) {
      router.replace('/setup?step=3');
    }

    try {
      let hadSaveError = false;

      // Save week start day
      const scheduleResult = await apiFetch('/api/schedule-view-settings/save', {
        method: 'POST',
        json: { organizationId, weekStartDay },
      });
      if (!scheduleResult.ok) {
        hadSaveError = true;
      }

      // Save business hours if user chose to set them
      if (setHours) {
        const hours = businessHours.map((hour, index) => ({
          dayOfWeek: hour.dayOfWeek,
          openTime: hour.openTime,
          closeTime: hour.closeTime,
          enabled: hour.enabled,
          sortOrder: index,
        }));
        const businessHoursResult = await apiFetch('/api/business-hours/save', {
          method: 'POST',
          json: { organizationId, hours },
        });
        if (!businessHoursResult.ok) {
          hadSaveError = true;
        }
      }

      if (setCoreHours && coreOpenTime && coreCloseTime) {
        const coreHours = Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          openTime: coreOpenTime,
          closeTime: coreCloseTime,
          enabled: true,
          sortOrder: i,
        }));
        const coreHoursResult = await apiFetch('/api/core-hours/save', {
          method: 'POST',
          json: { organizationId, hours: coreHours },
        });
        if (!coreHoursResult.ok) {
          hadSaveError = true;
        }
      }

      await saveStaffProfiles(organizationId);
      if (hadSaveError) {
        setError('Some setup details could not be saved. You can finish them later in CrewShyft.');
      }
    } catch {
      setError('Failed to save setup details. You can configure them later.');
    } finally {
      setLoading(false);
    }
  }, [
    businessHours,
    coreOpenTime,
    coreCloseTime,
    isSetupWizard,
    organizationId,
    router,
    saveStaffProfiles,
    setCoreHours,
    setHours,
    weekStartDay,
  ]);

  const handleSkipOptionalSetup = useCallback(() => {
    if (organizationId) {
      persistStaffDrafts(organizationId, inviteRows.filter((row) => row.name.trim()));
    }
    setError('');
    setManagerStep(3);
    if (isSetupWizard) {
      router.replace('/setup?step=3');
    }
  }, [inviteRows, isSetupWizard, organizationId, persistStaffDrafts, router]);

  const refreshSubscriptionState = useCallback(async (): Promise<boolean> => {
    if (!organizationId) {
      setSubscriptionActive(false);
      setSubscriptionStatus('none');
      return false;
    }

    const result = await apiFetch<SubscriptionStatusResponse>(
      `/api/billing/subscription-status?organizationId=${organizationId}`,
    );

    if (!result.ok || !result.data) {
      setSubscriptionActive(false);
      setSubscriptionStatus('none');
      return false;
    }

    const status = String(result.data.status ?? '').trim().toLowerCase() || 'none';
    const active = Boolean(result.data.active) || status === 'active' || status === 'trialing';
    setSubscriptionStatus(status);
    setSubscriptionActive(active);
    return active;
  }, [organizationId]);

  useEffect(() => {
    if (role !== 'manager' || managerStep !== 3 || !organizationId) return;
    void refreshSubscriptionState();
  }, [role, managerStep, organizationId, refreshSubscriptionState]);

  const clearCheckoutPolling = useCallback(() => {
    if (checkoutPollIntervalRef.current !== null) {
      window.clearInterval(checkoutPollIntervalRef.current);
      checkoutPollIntervalRef.current = null;
    }
    if (checkoutPollTimeoutRef.current !== null) {
      window.clearTimeout(checkoutPollTimeoutRef.current);
      checkoutPollTimeoutRef.current = null;
    }
    checkoutPollInFlightRef.current = false;
  }, []);

  const startCheckoutPolling = useCallback(() => {
    clearCheckoutPolling();

    const pollOnce = async () => {
      if (checkoutPollInFlightRef.current) return;
      checkoutPollInFlightRef.current = true;
      try {
        const active = await refreshSubscriptionState();
        if (active) {
          clearCheckoutPolling();
          await finishSetup();
        }
      } finally {
        checkoutPollInFlightRef.current = false;
      }
    };

    void pollOnce();
    checkoutPollIntervalRef.current = window.setInterval(() => {
      void pollOnce();
    }, CHECKOUT_POLL_INTERVAL_MS);
    checkoutPollTimeoutRef.current = window.setTimeout(() => {
      clearCheckoutPolling();
    }, CHECKOUT_POLL_MAX_MS);
  }, [clearCheckoutPolling, finishSetup, refreshSubscriptionState]);

  useEffect(() => {
    if (!subscriptionActive) return;
    clearCheckoutPolling();
  }, [clearCheckoutPolling, subscriptionActive]);

  const finalizeCheckoutFromSession = useCallback(
    async (sessionIdInput: string, intentIdInput?: string) => {
      const sessionId = String(sessionIdInput ?? '').trim();
      const intentId = String(intentIdInput ?? '').trim() || '';
      if (!sessionId) {
        setCheckoutFinalizing(false);
        setPaymentReceived(false);
        setCheckoutNotice('');
        setCheckoutError('Missing checkout session details. Please retry checkout.');
        return;
      }

      setFinalizeSessionId(sessionId);
      setFinalizeIntentId(intentId || null);
      setCheckoutFinalizing(true);
      setCheckoutError('');
      setCheckoutCanceled(false);
      setPaymentReceived(true);
      setCheckoutManageUrl(null);
      setCheckoutNotice('Payment received. Finalizing your CrewShyft subscription...');

      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, FINALIZE_TIMEOUT_MS);

      try {
        const finalizeResult = await apiFetch<FinalizeCheckoutResponse>('/api/billing/finalize-checkout', {
          method: 'POST',
          signal: controller.signal,
          json: {
            session_id: sessionId,
            intent_id: intentId || undefined,
          },
        });

        if (!finalizeResult.ok || !finalizeResult.data?.ok) {
          setPaymentReceived(false);
          setCheckoutNotice('');
          setCheckoutError(
            timedOut
              ? 'We\u2019re still confirming your subscription. Please try again.'
              : (finalizeResult.error || finalizeResult.data?.error || 'Unable to finalize subscription.'),
          );
          setCheckoutManageUrl('/billing');
          return;
        }

        await refreshProfile();
        if (organizationId) {
          await useAuthStore.getState().fetchSubscriptionStatus(organizationId);
        }
        await refreshSubscriptionState();

        setCheckoutManageUrl(null);
        setCheckoutNotice('Payment received. Subscription active. Redirecting to your dashboard...');
        setCheckoutError('');
        setSubscriptionActive(true);
        if (autoAdvanceTimeoutRef.current !== null) {
          window.clearTimeout(autoAdvanceTimeoutRef.current);
        }
        autoAdvanceTimeoutRef.current = window.setTimeout(() => {
          void finishSetup();
        }, 900);
      } catch {
        setPaymentReceived(false);
        setCheckoutNotice('');
        setCheckoutError(
          timedOut
            ? 'We\u2019re still confirming your subscription. Please try again.'
            : 'Unable to finalize subscription. Please try again.',
        );
        setCheckoutManageUrl('/billing');
      } finally {
        window.clearTimeout(timeoutId);
        setCheckoutLoading(null);
        setCheckoutFinalizing(false);
      }
    },
    [finishSetup, organizationId, refreshProfile, refreshSubscriptionState],
  );

  useEffect(() => {
    if (role !== 'manager' || managerStep !== 3) return;

    const checkoutState = checkoutParams.checkout;
    if (!checkoutState) return;

    const sessionId = checkoutParams.sessionId;
    const intentId = String(checkoutParams.intentId || latestIntentId || '').trim();
    const token = `${checkoutState}:${sessionId || 'none'}:${intentId || 'none'}`;
    if (handledCheckoutRef.current === token) return;
    handledCheckoutRef.current = token;

    if (checkoutState === 'cancel') {
      clearCheckoutPolling();
      setCheckoutLoading(null);
      setCheckoutError('');
      setCheckoutManageUrl(null);
      setCheckoutFinalizing(false);
      setPaymentReceived(false);
      setCheckoutCanceled(true);
      setFinalizeSessionId(null);
      setFinalizeIntentId(null);
      setCheckoutNotice('Payment canceled. You can retry checkout whenever you are ready.');
      return;
    }

    if (checkoutState !== 'success') return;
    setCheckoutCanceled(false);
    if (!sessionId) {
      setPaymentReceived(false);
      setCheckoutError('Missing checkout session details. Please retry checkout.');
      setCheckoutNotice('');
      return;
    }
    void finalizeCheckoutFromSession(sessionId, intentId || undefined);
  }, [
    clearCheckoutPolling,
    checkoutParams.checkout,
    checkoutParams.intentId,
    checkoutParams.sessionId,
    managerStep,
    latestIntentId,
    finalizeCheckoutFromSession,
    role,
  ]);

  const handleStartCheckout = useCallback(async (priceType: PlanId) => {
    if (!organizationId) {
      setCheckoutError('Create your restaurant first.');
      return;
    }

    setSelectedPlan(priceType);
    setCheckoutCanceled(false);
    setPaymentReceived(false);
    setCheckoutError('');
    setCheckoutNotice('Redirecting to Stripe Checkout...');
    setCheckoutManageUrl(null);
    setCheckoutLoading(priceType);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const result = await apiFetch<CheckoutSessionResponse>(
        '/api/billing/create-checkout-session',
        {
          method: 'POST',
          signal: controller.signal,
          json: {
            organizationId,
            priceType,
            flow: 'setup',
          },
        },
      );

      if (!result.ok) {
        const redirect = String(result.data?.redirect ?? '').trim() || null;
        if (redirect) {
          setCheckoutManageUrl(redirect);
          setCheckoutNotice('Manage billing in CrewShyft, then retry checkout.');
        } else {
          setCheckoutNotice('');
        }
        setCheckoutError(result.error || 'Unable to start checkout. Please try again.');
        return;
      }

      const checkoutUrl = String(result.data?.checkoutUrl ?? '').trim();
      if (!checkoutUrl || !/^https?:\/\//i.test(checkoutUrl)) {
        setCheckoutNotice('');
        setCheckoutError('Unable to start checkout. CrewShyft did not receive a valid checkout URL.');
        return;
      }

      const win = window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      if (win) {
        setCheckoutNotice('Stripe opened in a new tab. Complete payment there, then come back here.');
        startCheckoutPolling();
        return;
      }

      window.location.assign(checkoutUrl);
      return;
    } catch {
      setCheckoutNotice('');
      setCheckoutError('Unable to start checkout. Please try again.');
    } finally {
      window.clearTimeout(timeout);
      setCheckoutLoading(null);
    }
  }, [organizationId, startCheckoutPolling]);

  const handleRetryCheckout = useCallback(() => {
    if (!subscriptionActive && finalizeSessionId) {
      void finalizeCheckoutFromSession(finalizeSessionId, finalizeIntentId ?? undefined);
      return;
    }
    clearCheckoutPolling();
    setCheckoutCanceled(false);
    setPaymentReceived(false);
    setCheckoutError('');
    setCheckoutNotice('');
    setCheckoutLoading(null);
  }, [
    clearCheckoutPolling,
    finalizeCheckoutFromSession,
    finalizeIntentId,
    finalizeSessionId,
    subscriptionActive,
  ]);

  const handleSelectPlan = useCallback((planId: PlanId) => {
    setSelectedPlan(planId);
  }, []);

  // Invite row helpers
  const updateInviteRow = useCallback(
    (index: number, field: keyof InviteRow, value: string) => {
      setInviteRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    [],
  );

  const addInviteRow = useCallback(() => {
    setInviteRows((prev) => [...prev, emptyRow()]);
  }, [emptyRow]);

  const removeInviteRow = useCallback((index: number) => {
    setInviteRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const toggleRole = useCallback((roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName],
    );
  }, []);

  // ---- Transition screen ----
  if (transitioning) {
    return <TransitionScreen message={transitionMessage || 'Setting things up...'} />;
  }

  // ---- Render ----
  return (
    <div className="relative w-full max-w-xl animate-auth-enter">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <Calendar className="w-6 h-6 text-zinc-900" />
        </div>
      </div>

      {/* Card */}
      <div className="bg-theme-secondary border border-theme-primary rounded-2xl shadow-xl overflow-hidden">
        <div
          key={`${role ?? 'unset'}-${managerStep}`}
          className="animate-step-enter p-6 sm:p-8"
        >
          {/* Role selection */}
          {!role && <RoleSelectionView onSelect={handleSelectRole} />}

          {/* Manager path */}
          {role === 'manager' && (
            <>
              <StepIndicator current={managerStep} total={3} />

              {managerStep === 1 && (
                <RestaurantStepView
                  ownerName={ownerName}
                  restaurantName={restaurantName}
                  locationName={locationName}
                  timezone={timezone}
                  loading={loading}
                  ownerNameError={ownerNameError}
                  restaurantNameError={restaurantNameError}
                  error={error}
                  onOwnerNameChange={handleOwnerNameChange}
                  onRestaurantNameChange={handleRestaurantNameChange}
                  onLocationNameChange={setLocationName}
                  onTimezoneChange={setTimezone}
                  onSubmit={handleCreateRestaurant}
                  onBack={handleBackToRoleSelection}
                  onSkip={skipSetup}
                />
              )}

              {managerStep === 2 && (
                <ScheduleStepView
                  weekStartDay={weekStartDay}
                  setHoursEnabled={setHours}
                  businessHours={businessHours}
                  setCoreHoursEnabled={setCoreHours}
                  coreOpenTime={coreOpenTime}
                  coreCloseTime={coreCloseTime}
                  staffRows={inviteRows}
                  staffRoleOptions={inviteRoleOptions}
                  selectedRoles={selectedRoles}
                  loading={loading}
                  error={error}
                  onWeekStartDayChange={setWeekStartDay}
                  onSetHoursChange={setSetHours}
                  onBusinessHourChange={updateBusinessHour}
                  onApplyHoursToAll={applyHoursToAllDays}
                  onSetCoreHoursChange={setSetCoreHours}
                  onCoreOpenTimeChange={setCoreOpenTime}
                  onCoreCloseTimeChange={setCoreCloseTime}
                  onCopyCoreHoursFromOperating={copyCoreHoursFromOperating}
                  onToggleRole={toggleRole}
                  onStaffRowChange={updateInviteRow}
                  onAddStaffRow={addInviteRow}
                  onRemoveStaffRow={removeInviteRow}
                  onContinue={handleSaveOptionalSetup}
                  onBack={() => {
                    if (hasExistingOrgInSetup) {
                      router.replace('/restaurants');
                      return;
                    }
                    setManagerStep(1);
                    if (isSetupWizard) {
                      router.replace('/setup?step=1');
                    }
                  }}
                  onSkip={handleSkipOptionalSetup}
                />
              )}

              {managerStep === 3 && (
                <SubscriptionStepView
                  checkoutLoading={checkoutLoading}
                  checkoutFinalizing={checkoutFinalizing}
                  error={checkoutError}
                  notice={checkoutNotice}
                  checkoutCanceled={checkoutCanceled}
                  paymentReceived={paymentReceived}
                  manageBillingUrl={checkoutManageUrl}
                  selectedPlan={selectedPlan}
                  subscriptionActive={subscriptionActive}
                  subscriptionStatus={subscriptionStatus}
                  onSelectPlan={handleSelectPlan}
                  onStartCheckout={handleStartCheckout}
                  retryLabel={finalizeSessionId && !subscriptionActive ? 'Retry finalize' : 'Try again'}
                  onRetry={handleRetryCheckout}
                  onGoToDashboard={finishSetup}
                  onManageBilling={() => router.push('/billing')}
                  onBack={() => {
                    setManagerStep(2);
                    if (isSetupWizard) {
                      router.replace('/setup?step=2');
                    }
                  }}
                  onSkip={skipSetup}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-views                                                           */
/* ------------------------------------------------------------------ */

function RoleSelectionView({
  onSelect,
}: {
  onSelect: (role: 'manager') => void;
}) {
  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-theme-primary text-center mb-2">
        How will you use CrewShyft?
      </h1>
      <p className="text-sm text-theme-tertiary text-center mb-8">
        Choose your role to get started with the right setup.
      </p>

      <div className="grid grid-cols-1 gap-4">
        <button
          onClick={() => onSelect('manager')}
          className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-theme-primary bg-theme-tertiary/30 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
            <Store className="w-6 h-6 text-amber-500" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-theme-primary">I&apos;m a Manager / Owner</p>
            <p className="text-xs text-theme-tertiary mt-1">
              Set up your restaurant and start scheduling
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

/* ---- Step 1: Restaurant ---- */

function RestaurantStepView({
  ownerName,
  restaurantName,
  locationName,
  timezone,
  loading,
  ownerNameError,
  restaurantNameError,
  error,
  onOwnerNameChange,
  onRestaurantNameChange,
  onLocationNameChange,
  onTimezoneChange,
  onSubmit,
  onBack,
  onSkip,
}: {
  ownerName: string;
  restaurantName: string;
  locationName: string;
  timezone: string;
  loading: boolean;
  ownerNameError: string;
  restaurantNameError: string;
  error: string;
  onOwnerNameChange: (v: string) => void;
  onRestaurantNameChange: (v: string) => void;
  onLocationNameChange: (v: string) => void;
  onTimezoneChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const canSubmit = ownerName.trim().length > 0 && restaurantName.trim().length > 0 && !loading;

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h2 className="text-xl font-bold text-theme-primary mb-1">Set up your restaurant</h2>
      <p className="text-sm text-theme-tertiary mb-6">
        Tell us about your restaurant to create your workspace.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Owner name <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
            <input
              type="text"
              value={ownerName}
              onChange={(e) => onOwnerNameChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="e.g., Maria Rossi"
              autoFocus
              required
            />
          </div>
          {ownerNameError && <p className="mt-1 text-xs text-red-400">{ownerNameError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Restaurant name <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => onRestaurantNameChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Mario's Italian Kitchen"
              required
            />
          </div>
          {restaurantNameError && <p className="mt-1 text-xs text-red-400">{restaurantNameError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Location name or address{' '}
            <span className="text-theme-muted text-xs">(optional)</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
            <input
              type="text"
              value={locationName}
              onChange={(e) => onLocationNameChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Downtown / 123 Main St"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">Timezone</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
            <select
              value={timezone}
              onChange={(e) => onTimezoneChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none"
            >
              {!COMMON_TIMEZONES.includes(timezone) && (
                <option value={timezone}>{timezone} (detected)</option>
              )}
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                  {tz === detectTimezone() ? ' (detected)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full py-2.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors inline-flex items-center justify-center gap-1"
        >
          Skip for now
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

/* ---- Step 2: Schedule config ---- */

function ScheduleStepView({
  weekStartDay,
  setHoursEnabled,
  businessHours,
  setCoreHoursEnabled,
  coreOpenTime,
  coreCloseTime,
  staffRows,
  staffRoleOptions,
  selectedRoles,
  loading,
  error,
  onWeekStartDayChange,
  onSetHoursChange,
  onBusinessHourChange,
  onApplyHoursToAll,
  onSetCoreHoursChange,
  onCoreOpenTimeChange,
  onCoreCloseTimeChange,
  onCopyCoreHoursFromOperating,
  onToggleRole,
  onStaffRowChange,
  onAddStaffRow,
  onRemoveStaffRow,
  onContinue,
  onBack,
  onSkip,
}: {
  weekStartDay: 'sunday' | 'monday';
  setHoursEnabled: boolean;
  businessHours: DayHoursRow[];
  setCoreHoursEnabled: boolean;
  coreOpenTime: string;
  coreCloseTime: string;
  staffRows: InviteRow[];
  staffRoleOptions: string[];
  selectedRoles: string[];
  loading: boolean;
  error: string;
  onWeekStartDayChange: (v: 'sunday' | 'monday') => void;
  onSetHoursChange: (v: boolean) => void;
  onBusinessHourChange: (dayOfWeek: number, field: 'openTime' | 'closeTime' | 'enabled', value: string | boolean) => void;
  onApplyHoursToAll: () => void;
  onSetCoreHoursChange: (v: boolean) => void;
  onCoreOpenTimeChange: (v: string) => void;
  onCoreCloseTimeChange: (v: string) => void;
  onCopyCoreHoursFromOperating: () => void;
  onToggleRole: (role: string) => void;
  onStaffRowChange: (index: number, field: keyof InviteRow, value: string) => void;
  onAddStaffRow: () => void;
  onRemoveStaffRow: (index: number) => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h2 className="text-xl font-bold text-theme-primary mb-1">Optional setup details</h2>
      <p className="text-sm text-theme-tertiary mb-6">
        Configure hours, roles, and starter staff now. You can adjust everything later in CrewShyft.
      </p>

      <div className="space-y-6">
        {/* Week start day */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            <Settings className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Week starts on
          </label>
          <div className="flex rounded-lg border border-theme-primary overflow-hidden">
            <button
              type="button"
              onClick={() => onWeekStartDayChange('monday')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                weekStartDay === 'monday'
                  ? 'bg-amber-500 text-zinc-900'
                  : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
              }`}
            >
              Monday
            </button>
            <button
              type="button"
              onClick={() => onWeekStartDayChange('sunday')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                weekStartDay === 'sunday'
                  ? 'bg-amber-500 text-zinc-900'
                  : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
              }`}
            >
              Sunday
            </button>
          </div>
        </div>

        {/* Operating hours */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            <Clock className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Operating hours
          </label>
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => onSetHoursChange(!setHoursEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                setHoursEnabled ? 'bg-amber-500' : 'bg-theme-tertiary'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  setHoursEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-theme-secondary">
              {setHoursEnabled ? 'Set your hours' : 'Skip for now'}
            </span>
          </div>
          {setHoursEnabled && (
            <div className="space-y-2 rounded-lg border border-theme-primary p-3 bg-theme-tertiary/30">
              <div className="flex items-center justify-between">
                <p className="text-xs text-theme-muted">Set by day</p>
                <button
                  type="button"
                  onClick={onApplyHoursToAll}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Apply to all
                </button>
              </div>
              <div className="space-y-2">
                <div className="hidden sm:grid sm:grid-cols-[28px_140px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3 px-1">
                  <span />
                  <span className="text-[11px] uppercase tracking-wide text-theme-muted">Day</span>
                  <span className="text-[11px] uppercase tracking-wide text-theme-muted">Open</span>
                  <span className="text-[11px] uppercase tracking-wide text-theme-muted">Close</span>
                </div>
                {businessHours.map((hour) => (
                  <div
                    key={hour.dayOfWeek}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-theme-primary/40 bg-theme-secondary/40 p-3 sm:grid-cols-[28px_140px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0"
                  >
                    <div className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2 sm:contents">
                      <div className="flex items-center justify-center sm:justify-start">
                        <input
                          type="checkbox"
                          checked={hour.enabled}
                          onChange={(e) => onBusinessHourChange(hour.dayOfWeek, 'enabled', e.target.checked)}
                          className="h-4 w-4 rounded border-theme-primary bg-theme-tertiary text-amber-500 focus:ring-amber-500/40"
                        />
                      </div>
                      <span className="text-sm sm:text-xs font-medium sm:font-normal text-theme-secondary">
                        {DAY_LABELS[hour.dayOfWeek]}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:contents">
                      <div>
                        <label className="mb-1 block text-[11px] uppercase tracking-wide text-theme-muted sm:hidden">
                          Open
                        </label>
                        <input
                          type="time"
                          value={hour.openTime}
                          onChange={(e) => onBusinessHourChange(hour.dayOfWeek, 'openTime', e.target.value)}
                          disabled={!hour.enabled}
                          className="h-12 w-full rounded-lg border border-theme-primary bg-theme-secondary px-3 text-sm text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] uppercase tracking-wide text-theme-muted sm:hidden">
                          Close
                        </label>
                        <input
                          type="time"
                          value={hour.closeTime}
                          onChange={(e) => onBusinessHourChange(hour.dayOfWeek, 'closeTime', e.target.value)}
                          disabled={!hour.enabled}
                          className="h-12 w-full rounded-lg border border-theme-primary bg-theme-secondary px-3 text-sm text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Core hours */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="block text-sm font-medium text-theme-secondary">
              <Clock className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Core hours (optional)
            </label>
            <button
              type="button"
              onClick={onCopyCoreHoursFromOperating}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              Copy from operating hours
            </button>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => onSetCoreHoursChange(!setCoreHoursEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                setCoreHoursEnabled ? 'bg-amber-500' : 'bg-theme-tertiary'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  setCoreHoursEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-theme-secondary">
              {setCoreHoursEnabled ? 'Set core hours' : 'Skip for now'}
            </span>
          </div>
          {setCoreHoursEnabled && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-theme-muted mb-1">Start</label>
                <input
                  type="time"
                  value={coreOpenTime}
                  onChange={(e) => onCoreOpenTimeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <span className="text-theme-muted mt-5">to</span>
              <div className="flex-1">
                <label className="block text-xs text-theme-muted mb-1">End</label>
                <input
                  type="time"
                  value={coreCloseTime}
                  onChange={(e) => onCoreCloseTimeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Role chips */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            What roles does your team have?
          </label>
          <p className="text-xs text-theme-muted mb-3">
            Select the positions you need. You can add more later.
          </p>
          <div className="flex flex-wrap gap-2">
            {ROLE_CHIPS.map((roleName) => {
              const isSelected = selectedRoles.includes(roleName);
              return (
                <button
                  key={roleName}
                  type="button"
                  onClick={() => onToggleRole(roleName)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-500'
                      : 'bg-theme-tertiary border-theme-primary text-theme-secondary hover:border-theme-secondary'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                  {roleName}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Add staff (optional)
          </label>
          <p className="text-xs text-theme-muted mb-3">
            Name and role are required for a draft row. Email and hourly pay are optional.
          </p>
          <div className="space-y-2">
            {staffRows.map((row, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1.1fr_auto_auto_1fr] gap-2">
                  <input
                    type="text"
                    placeholder="Name"
                    value={row.name}
                    onChange={(e) => onStaffRowChange(index, 'name', e.target.value)}
                    className="px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <select
                    value={row.role}
                    onChange={(e) => onStaffRowChange(index, 'role', e.target.value)}
                    className="px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none"
                  >
                    {staffRoleOptions.map((staffRole) => (
                      <option key={staffRole} value={staffRole}>
                        {staffRole}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <DollarSign className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-theme-muted" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Hourly pay"
                      value={row.hourlyPay}
                      onChange={(e) => onStaffRowChange(index, 'hourlyPay', e.target.value)}
                      className="w-full pl-7 pr-2 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email (optional)"
                    value={row.email}
                    onChange={(e) => onStaffRowChange(index, 'email', e.target.value)}
                    className="px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                {staffRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveStaffRow(index)}
                    className="p-2 text-theme-muted hover:text-red-400 transition-colors mt-0.5"
                    aria-label="Remove staff row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {staffRows.length < 10 && (
            <button
              type="button"
              onClick={onAddStaffRow}
              className="inline-flex items-center gap-1.5 text-sm text-amber-500 hover:text-amber-400 transition-colors mt-3"
            >
              <Plus className="w-4 h-4" />
              Add another
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <button
          type="button"
          onClick={onContinue}
          disabled={loading}
          className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full py-2.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors inline-flex items-center justify-center gap-1"
        >
          Skip for now
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ---- Step 3: Subscription ---- */

function SubscriptionStepView({
  checkoutLoading,
  checkoutFinalizing,
  error,
  notice,
  checkoutCanceled,
  paymentReceived,
  manageBillingUrl,
  selectedPlan,
  subscriptionActive,
  subscriptionStatus,
  onSelectPlan,
  onStartCheckout,
  retryLabel,
  onRetry,
  onGoToDashboard,
  onManageBilling,
  onBack,
  onSkip,
}: {
  checkoutLoading: PlanId | null;
  checkoutFinalizing: boolean;
  error: string;
  notice: string;
  checkoutCanceled: boolean;
  paymentReceived: boolean;
  manageBillingUrl: string | null;
  selectedPlan: PlanId | null;
  subscriptionActive: boolean;
  subscriptionStatus: string;
  onSelectPlan: (planId: PlanId) => void;
  onStartCheckout: (priceType: PlanId) => void;
  retryLabel: string;
  onRetry: () => void;
  onGoToDashboard: () => void;
  onManageBilling: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const canManageBilling = Boolean(manageBillingUrl);
  const [pendingCheckoutPlan, setPendingCheckoutPlan] = useState<PlanId | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const openCheckoutModal = useCallback((planId: PlanId) => {
    onSelectPlan(planId);
    setPendingCheckoutPlan(planId);
    setShowCheckoutModal(true);
  }, [onSelectPlan]);

  const closeCheckoutModal = useCallback(() => {
    setShowCheckoutModal(false);
    setPendingCheckoutPlan(null);
  }, []);

  const handleContinueToStripe = useCallback(() => {
    if (!pendingCheckoutPlan) return;
    setShowCheckoutModal(false);
    onStartCheckout(pendingCheckoutPlan);
  }, [onStartCheckout, pendingCheckoutPlan]);

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h2 className="text-xl font-bold text-theme-primary mb-1">Activate your CrewShyft subscription</h2>
      <p className="text-sm text-theme-tertiary mb-6">
        Choose a plan to finish setup. This stays inside your setup flow.
      </p>

      {paymentReceived && (
        <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-300 animate-[pulse_1.6s_ease-in-out_infinite]">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Payment received</p>
              <p className="mt-1 text-xs text-theme-secondary">
                {checkoutFinalizing
                  ? 'Finalizing your CrewShyft subscription...'
                  : 'Subscription confirmed. Redirecting to your dashboard...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!paymentReceived && notice && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-400">{notice}</p>
          {checkoutCanceled && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-400/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10 transition-colors"
          >
            {retryLabel}
          </button>
        </div>
      )}

      {subscriptionActive ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-400">Subscription active</p>
            <p className="text-xs text-theme-secondary mt-1">
              Status: {subscriptionStatus || 'active'}
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDashboard}
            className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] inline-flex items-center justify-center gap-2"
          >
            Go to dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan === plan.id}
                loading={checkoutLoading === plan.id}
                disabled={checkoutLoading !== null || checkoutFinalizing}
                onSelect={onSelectPlan}
                onContinue={openCheckoutModal}
              />
            ))}
          </div>

          <div className="space-y-3">
            {canManageBilling && (
              <button
                type="button"
                onClick={onManageBilling}
                className="w-full py-2.5 border border-theme-primary text-theme-secondary rounded-lg hover:bg-theme-hover transition-colors inline-flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Manage billing
              </button>
            )}
            <button
              type="button"
              onClick={onSkip}
              className="w-full py-2.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors inline-flex items-center justify-center gap-1"
            >
              Skip for now
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      {showCheckoutModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close secure checkout dialog"
            onClick={closeCheckoutModal}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="secure-checkout-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-theme-primary bg-theme-secondary p-5 shadow-2xl"
          >
            <h3 id="secure-checkout-title" className="text-lg font-semibold text-theme-primary">
              Secure checkout
            </h3>
            <p className="mt-2 text-sm text-theme-tertiary">
              You&rsquo;ll complete payment with Stripe and return to CrewShyft to finish setup.
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-theme-muted">
              Powered by Stripe
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeCheckoutModal}
                className="w-full rounded-lg border border-theme-primary px-3 py-2.5 text-sm font-medium text-theme-secondary hover:bg-theme-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinueToStripe}
                disabled={!pendingCheckoutPlan || checkoutLoading !== null || checkoutFinalizing}
                className="w-full rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-amber-400 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                Continue to Stripe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type PlanCardProps = {
  plan: (typeof SUBSCRIPTION_PLANS)[number];
  selected: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: (planId: PlanId) => void;
  onContinue: (planId: PlanId) => void;
};

function PlanCard({
  plan,
  selected,
  loading,
  disabled,
  onSelect,
  onContinue,
}: PlanCardProps) {
  const handleSelect = () => {
    onSelect(plan.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
      className={`group relative rounded-xl border p-4 bg-theme-tertiary/30 cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-theme-secondary ${
        selected
          ? 'border-amber-500 shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_16px_40px_-22px_rgba(245,158,11,0.7)]'
          : 'border-theme-primary hover:-translate-y-0.5 hover:border-amber-400/70 hover:shadow-[0_12px_32px_-22px_rgba(245,158,11,0.55)]'
      }`}
    >
      {selected && (
        <div className="pointer-events-none absolute left-1/2 -top-3 z-10 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500 bg-theme-secondary px-3 py-1 text-xs font-semibold text-amber-400 shadow-sm">
            <Check className="h-3.5 w-3.5" />
            Selected
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-base font-semibold text-theme-primary">{plan.name}</p>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            plan.recommended
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {plan.badge}
        </span>
      </div>
      <p className="text-xs text-theme-tertiary mb-3">{plan.subtitle}</p>
      <div className="flex items-end gap-1 mb-5">
        <span className="text-2xl font-bold text-theme-primary">{plan.price}</span>
        <span className="text-xs text-theme-muted mb-1">{plan.cadence}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          onSelect(plan.id);
          onContinue(plan.id);
        }}
        disabled={disabled}
        className="w-full py-2.5 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Redirecting...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            Continue to payment
          </>
        )}
      </button>
    </div>
  );
}



