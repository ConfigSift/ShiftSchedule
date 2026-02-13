'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { DEMO_DATA } from './mockData';
import { DemoInterceptModal } from './DemoInterceptModal';

// ---------------------------------------------------------------------------
// Context — lets child components check if demo mode is active
// ---------------------------------------------------------------------------

interface DemoContextValue {
  isDemo: true;
  /** Show the intercept modal for a given action label */
  intercept: (action: string) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemoContext() {
  return useContext(DemoContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a function that, when called, shows the signup intercept modal
 * instead of performing the real write operation.
 */
function makeInterceptor<T extends (...args: any[]) => any>(
  action: string,
  interceptFn: (action: string) => void,
  returnValue?: ReturnType<T>,
) {
  return ((..._args: any[]) => {
    interceptFn(action);
    // Return a resolved promise matching the expected signature
    if (returnValue !== undefined) return Promise.resolve(returnValue);
    return Promise.resolve({ success: false, error: 'Demo mode' });
  }) as unknown as T;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface DemoProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps children in demo mode.
 *
 * **Technical approach — Direct store override:**
 *
 * Both `useScheduleStore` and `useAuthStore` are global Zustand singletons.
 * Components read from them via hooks (`useScheduleStore()`). We:
 *
 * 1. Snapshot the current store state on mount.
 * 2. Replace store state with mock data (employees, shifts, settings, etc.).
 * 3. Replace every write method (addShift, updateShift, deleteShift,
 *    publishWeekDraft, etc.) with an interceptor that shows the signup modal.
 * 4. Leave read-only methods and UI-navigation methods untouched so the
 *    user can freely switch views, dates, toggle sections, etc.
 * 5. Restore the original state on unmount so navigating away from /demo
 *    returns the app to its normal state.
 *
 * This avoids forking components, creating parallel stores, or using React
 * context to shadow Zustand — the simplest approach with zero changes to
 * existing components.
 */
export function DemoProvider({ children }: DemoProviderProps) {
  const [interceptAction, setInterceptAction] = useState<string | null>(null);

  const intercept = useCallback((action: string) => {
    setInterceptAction(action);
  }, []);

  const closeModal = useCallback(() => {
    setInterceptAction(null);
  }, []);

  // Track originals so we can restore on unmount
  const scheduleOriginals = useRef<Record<string, any> | null>(null);
  const authOriginals = useRef<Record<string, any> | null>(null);

  useEffect(() => {
    // -----------------------------------------------------------------------
    // 1. Snapshot originals
    // -----------------------------------------------------------------------
    const scheduleState = useScheduleStore.getState();
    const authState = useAuthStore.getState();

    scheduleOriginals.current = { ...scheduleState };
    authOriginals.current = { ...authState };

    // -----------------------------------------------------------------------
    // 2. Build intercepted write methods for the schedule store
    // -----------------------------------------------------------------------
    const i = (action: string) => intercept(action);

    const scheduleOverrides: Record<string, any> = {
      // -- Data state --
      employees: DEMO_DATA.employees,
      shifts: DEMO_DATA.shifts,
      timeOffRequests: DEMO_DATA.timeOffRequests,
      blockedDayRequests: DEMO_DATA.blockedDayRequests,
      businessHours: DEMO_DATA.businessHours,
      coreHours: DEMO_DATA.coreHours,
      scheduleViewSettings: DEMO_DATA.scheduleViewSettings,
      locations: DEMO_DATA.locations,
      dropRequests: DEMO_DATA.dropRequests,
      chatMessages: DEMO_DATA.chatMessages,
      isHydrated: true,

      // -- UI defaults --
      selectedDate: new Date(),
      viewMode: 'day' as const,
      scheduleMode: 'published' as const,
      selectedSections: ['kitchen', 'front', 'bar', 'management'],
      selectedEmployeeIds: DEMO_DATA.employees.map((e) => e.id),
      workingTodayOnly: false,
      modalType: null,
      modalData: null,
      toast: null,
      shiftLoadCounts: {
        total: DEMO_DATA.shifts.length,
        visible: DEMO_DATA.shifts.length,
      },

      // -- No-op the Supabase data loaders --
      loadRestaurantData: async () => {},
      loadCoreHours: async () => {},
      hydrate: () => {},

      // -- Intercept all write/mutation operations --
      addShift: makeInterceptor('add a shift', i),
      updateShift: makeInterceptor('edit a shift', i),
      deleteShift: makeInterceptor('delete a shift', i),
      publishWeekDraft: makeInterceptor('publish the schedule', i),
      publishDraftRange: makeInterceptor('publish the schedule', i),
      seedDraftWeekFromPublished: makeInterceptor('seed a draft week', i, {
        seeded: false,
        insertedCount: 0,
        skippedCount: 0,
        sourceCount: 0,
        error: 'Demo mode',
      }),
      copyPreviousDayIntoDraft: makeInterceptor('copy shifts', i),
      saveCoreHours: makeInterceptor('save core hours', i),
      addTimeOffRequest: makeInterceptor('request time off', i),
      reviewTimeOffRequest: makeInterceptor('review a time-off request', i),
      cancelTimeOffRequest: makeInterceptor('cancel a time-off request', i),
      submitBlockedDayRequest: makeInterceptor('block a day', i),
      reviewBlockedDayRequest: makeInterceptor('review a blocked day', i),
      cancelBlockedDayRequest: makeInterceptor('cancel a blocked day', i),
      createImmediateBlockedDay: makeInterceptor('create a blocked day', i),
      updateBlockedDay: makeInterceptor('update a blocked day', i),
      deleteBlockedDay: makeInterceptor('delete a blocked day', i),
      createBlockedPeriod: makeInterceptor('block a period', i),
      deleteBlockedPeriod: makeInterceptor('remove a blocked period', i),
      createDropRequest: () => i('drop a shift'),
      acceptDropRequest: makeInterceptor('accept a shift pickup', i),
      cancelDropRequest: () => i('cancel a drop request'),
      sendChatMessage: () => i('send a message'),

      // -- Keep read & navigation methods from the real store --
      // (they don't need interception — they only modify local state)
    };

    useScheduleStore.setState(scheduleOverrides);

    // -----------------------------------------------------------------------
    // 3. Override auth store with demo user
    // -----------------------------------------------------------------------
    const authOverrides: Record<string, any> = {
      currentUser: DEMO_DATA.currentUser,
      userProfiles: [DEMO_DATA.currentUser],
      accessibleRestaurants: DEMO_DATA.accessibleRestaurants,
      pendingInvitations: [],
      isInitialized: true,
      activeRestaurantId: DEMO_DATA.orgId,
      activeRestaurantCode: DEMO_DATA.restaurant.restaurantCode,
      subscriptionStatus: 'active' as const,
      subscriptionDetails: null,

      // No-op auth operations
      init: async () => {},
      signIn: async () => ({ error: 'Demo mode' }),
      signOut: async () => {},
      refreshProfile: async () => {},
      refreshInvitations: async () => {},
      fetchSubscriptionStatus: async () => {},
      setActiveOrganization: () => {},
      clearActiveOrganization: () => {},
      updateProfile: async () => {
        i('update your profile');
        return { success: false, error: 'Demo mode' };
      },
    };

    useAuthStore.setState(authOverrides);

    // -----------------------------------------------------------------------
    // 4. Restore originals on unmount
    // -----------------------------------------------------------------------
    return () => {
      if (scheduleOriginals.current) {
        useScheduleStore.setState(scheduleOriginals.current);
      }
      if (authOriginals.current) {
        useAuthStore.setState(authOriginals.current);
      }
    };
  }, [intercept]);

  const contextValue: DemoContextValue = { isDemo: true, intercept };

  return (
    <DemoContext.Provider value={contextValue}>
      {children}
      <DemoInterceptModal
        isOpen={interceptAction !== null}
        action={interceptAction ?? undefined}
        onClose={closeModal}
      />
    </DemoContext.Provider>
  );
}
