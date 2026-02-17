'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { DEMO_DATA } from './mockData';
import { DemoInterceptModal } from './DemoInterceptModal';
import type { Shift } from '../types';

interface DemoContextValue {
  isDemo: true;
  intercept: (action: string) => void;
  resetDemo: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemoContext() {
  return useContext(DemoContext);
}

type ScheduleStoreState = ReturnType<typeof useScheduleStore.getState>;
type AuthStoreState = ReturnType<typeof useAuthStore.getState>;

type DemoSnapshot = {
  employees: ScheduleStoreState['employees'];
  shifts: ScheduleStoreState['shifts'];
  timeOffRequests: ScheduleStoreState['timeOffRequests'];
  blockedDayRequests: ScheduleStoreState['blockedDayRequests'];
  businessHours: ScheduleStoreState['businessHours'];
  coreHours: ScheduleStoreState['coreHours'];
  scheduleViewSettings: ScheduleStoreState['scheduleViewSettings'];
  locations: ScheduleStoreState['locations'];
  dropRequests: ScheduleStoreState['dropRequests'];
  chatMessages: ScheduleStoreState['chatMessages'];
  selectedDate: string;
  viewMode: ScheduleStoreState['viewMode'];
  continuousDays: ScheduleStoreState['continuousDays'];
  scheduleMode: ScheduleStoreState['scheduleMode'];
  selectedSections: ScheduleStoreState['selectedSections'];
  selectedEmployeeIds: ScheduleStoreState['selectedEmployeeIds'];
  workingTodayOnly: ScheduleStoreState['workingTodayOnly'];
};

type PersistedPayload = {
  updatedAt: number;
  state: DemoSnapshot;
};

const DEMO_SESSION_ID_KEY = 'crewshyft_demo_session_id';
const DEMO_TTL_MS = 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 250;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSeedSnapshot(): DemoSnapshot {
  return {
    employees: cloneJson(DEMO_DATA.employees),
    shifts: cloneJson(DEMO_DATA.shifts),
    timeOffRequests: cloneJson(DEMO_DATA.timeOffRequests),
    blockedDayRequests: cloneJson(DEMO_DATA.blockedDayRequests),
    businessHours: cloneJson(DEMO_DATA.businessHours),
    coreHours: cloneJson(DEMO_DATA.coreHours),
    scheduleViewSettings: cloneJson(DEMO_DATA.scheduleViewSettings),
    locations: cloneJson(DEMO_DATA.locations),
    dropRequests: cloneJson(DEMO_DATA.dropRequests),
    chatMessages: cloneJson(DEMO_DATA.chatMessages),
    selectedDate: new Date().toISOString(),
    viewMode: 'day',
    continuousDays: false,
    scheduleMode: 'published',
    selectedSections: ['kitchen', 'front', 'bar', 'management'],
    selectedEmployeeIds: cloneJson(DEMO_DATA.employees.map((employee) => employee.id)),
    workingTodayOnly: false,
  };
}

function getStoreKey(sessionId: string) {
  return `crewshyft_demo:${sessionId}:state`;
}

function ensureSessionId() {
  const existing = sessionStorage.getItem(DEMO_SESSION_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(DEMO_SESSION_ID_KEY, generated);
  return generated;
}

function readSnapshotFromStorage(storeKey: string): DemoSnapshot | null {
  const raw = sessionStorage.getItem(storeKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedPayload;
    if (!parsed?.state || typeof parsed.updatedAt !== 'number') return null;
    if (Date.now() - parsed.updatedAt > DEMO_TTL_MS) {
      sessionStorage.removeItem(storeKey);
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}

function getShiftLoadCounts(shifts: Shift[]) {
  return {
    total: shifts.length,
    visible: shifts.length,
  };
}

function normalizeDemoShifts(shifts: Shift[]): Shift[] {
  return shifts.map((shift) => ({
    ...shift,
    swapStatus: shift.swapStatus ?? 'none',
  }));
}

function createDemoShiftId() {
  return `demo-shift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shiftRangeKey(shift: Shift) {
  return [
    shift.employeeId,
    shift.date,
    shift.startHour,
    shift.endHour,
    shift.job ?? '',
    shift.locationId ?? '',
    shift.notes ?? '',
  ].join('|');
}

function resolveShiftPayRate(
  state: ScheduleStoreState,
  shift: Pick<Shift, 'employeeId' | 'job' | 'payRate'>,
) {
  if (typeof shift.payRate === 'number') return shift.payRate;
  const employee = state.employees.find((item) => item.id === shift.employeeId);
  if (!employee) return undefined;
  if (shift.job && employee.jobPay && typeof employee.jobPay[shift.job] === 'number') {
    return employee.jobPay[shift.job];
  }
  return employee.hourlyPay;
}

function makeInterceptor(action: string, interceptFn: (action: string) => void) {
  return async (): Promise<{ success: boolean; error?: string }> => {
    interceptFn(action);
    return { success: false, error: 'Demo mode' };
  };
}

interface DemoProviderProps {
  children: React.ReactNode;
}

export function DemoProvider({ children }: DemoProviderProps) {
  const [interceptAction, setInterceptAction] = useState<string | null>(null);

  const scheduleOriginals = useRef<ScheduleStoreState | null>(null);
  const authOriginals = useRef<AuthStoreState | null>(null);
  const storeKeyRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const restoringRef = useRef(false);

  const intercept = useCallback((action: string) => {
    setInterceptAction(action);
  }, []);

  const closeModal = useCallback(() => {
    setInterceptAction(null);
  }, []);

  const applySnapshotToStore = useCallback((snapshot: DemoSnapshot) => {
    const selectedDate = new Date(snapshot.selectedDate);
    useScheduleStore.setState({
      employees: cloneJson(snapshot.employees),
      shifts: normalizeDemoShifts(cloneJson(snapshot.shifts)),
      timeOffRequests: cloneJson(snapshot.timeOffRequests),
      blockedDayRequests: cloneJson(snapshot.blockedDayRequests),
      businessHours: cloneJson(snapshot.businessHours),
      coreHours: cloneJson(snapshot.coreHours),
      scheduleViewSettings: cloneJson(snapshot.scheduleViewSettings),
      locations: cloneJson(snapshot.locations),
      dropRequests: cloneJson(snapshot.dropRequests),
      chatMessages: cloneJson(snapshot.chatMessages),
      selectedDate: Number.isNaN(selectedDate.getTime()) ? new Date() : selectedDate,
      viewMode: snapshot.viewMode,
      continuousDays: Boolean(snapshot.continuousDays),
      scheduleMode: snapshot.scheduleMode,
      selectedSections: cloneJson(snapshot.selectedSections),
      selectedEmployeeIds: cloneJson(snapshot.selectedEmployeeIds),
      workingTodayOnly: Boolean(snapshot.workingTodayOnly),
      modalType: null,
      modalData: null,
      toast: null,
      shiftLoadCounts: getShiftLoadCounts(snapshot.shifts),
      isHydrated: true,
      lastAppliedWorkingTodayKey: null,
    });
  }, []);

  const persistNow = useCallback(() => {
    const storeKey = storeKeyRef.current;
    if (!storeKey) return;
    const state = useScheduleStore.getState();
    const snapshot: DemoSnapshot = {
      employees: cloneJson(state.employees),
      shifts: cloneJson(state.shifts),
      timeOffRequests: cloneJson(state.timeOffRequests),
      blockedDayRequests: cloneJson(state.blockedDayRequests),
      businessHours: cloneJson(state.businessHours),
      coreHours: cloneJson(state.coreHours),
      scheduleViewSettings: cloneJson(state.scheduleViewSettings),
      locations: cloneJson(state.locations),
      dropRequests: cloneJson(state.dropRequests),
      chatMessages: cloneJson(state.chatMessages),
      selectedDate: state.selectedDate.toISOString(),
      viewMode: state.viewMode,
      continuousDays: state.continuousDays,
      scheduleMode: state.scheduleMode,
      selectedSections: cloneJson(state.selectedSections),
      selectedEmployeeIds: cloneJson(state.selectedEmployeeIds),
      workingTodayOnly: state.workingTodayOnly,
    };
    const payload: PersistedPayload = {
      updatedAt: Date.now(),
      state: snapshot,
    };
    sessionStorage.setItem(storeKey, JSON.stringify(payload));
  }, []);

  const resetDemo = useCallback(() => {
    if (typeof window === 'undefined') return;
    const sessionId = ensureSessionId();
    const storeKey = getStoreKey(sessionId);
    storeKeyRef.current = storeKey;
    sessionStorage.removeItem(storeKey);
    const seed = createSeedSnapshot();
    applySnapshotToStore(seed);
    persistNow();
    useScheduleStore.getState().showToast('Demo reset complete.', 'success');
  }, [applySnapshotToStore, persistNow]);

  useEffect(() => {
    const scheduleState = useScheduleStore.getState();
    const authState = useAuthStore.getState();
    scheduleOriginals.current = { ...scheduleState };
    authOriginals.current = { ...authState };

    const sessionId = ensureSessionId();
    const storeKey = getStoreKey(sessionId);
    storeKeyRef.current = storeKey;

    const hydratedSnapshot = readSnapshotFromStorage(storeKey) ?? createSeedSnapshot();

    const interceptOnly = (action: string) => intercept(action);

    const scheduleOverrides: Partial<ScheduleStoreState> = {
      loadRestaurantData: async () => {},
      loadCoreHours: async () => {},
      hydrate: () => {},

      addShift: async (shift) => {
        if (!shift.employeeId || !shift.date || shift.startHour >= shift.endHour) {
          return { success: false, error: 'Invalid shift values.' };
        }

        const state = useScheduleStore.getState();
        const nextShift: Shift = {
          ...shift,
          id: createDemoShiftId(),
          scheduleState: shift.scheduleState ?? (state.scheduleMode === 'draft' ? 'draft' : 'published'),
          payRate: resolveShiftPayRate(state, shift),
          swapStatus: 'none',
        };
        const nextShifts = [...state.shifts, nextShift];
        useScheduleStore.setState({
          shifts: nextShifts,
          shiftLoadCounts: getShiftLoadCounts(nextShifts),
        });
        return { success: true };
      },

      updateShift: async (id, updates) => {
        const state = useScheduleStore.getState();
        const target = state.shifts.find((item) => item.id === id);
        if (!target) {
          return { success: false, error: 'Shift not found.' };
        }

        const nextScheduleState =
          updates.scheduleState ??
          (state.scheduleMode === 'draft' ? 'draft' : target.scheduleState ?? 'published');

        const merged: Shift = {
          ...target,
          ...updates,
          scheduleState: nextScheduleState,
          swapStatus: updates.swapStatus ?? target.swapStatus ?? 'none',
        };
        merged.payRate = resolveShiftPayRate(state, merged);

        const nextShifts = state.shifts.map((item) => (item.id === id ? merged : item));
        useScheduleStore.setState({
          shifts: nextShifts,
          shiftLoadCounts: getShiftLoadCounts(nextShifts),
        });
        return { success: true };
      },

      deleteShift: async (id) => {
        const state = useScheduleStore.getState();
        const target = state.shifts.find((item) => item.id === id);
        if (!target) {
          return { success: false, error: 'Shift not found.' };
        }

        if (state.scheduleMode === 'draft' && target.scheduleState !== 'draft') {
          const nextShifts = state.shifts.map((item) =>
            item.id === id
              ? {
                  ...item,
                  scheduleState: 'draft' as const,
                  isBlocked: true,
                }
              : item,
          );
          useScheduleStore.setState({
            shifts: nextShifts,
            shiftLoadCounts: getShiftLoadCounts(nextShifts),
          });
          return { success: true };
        }

        const nextShifts = state.shifts.filter((item) => item.id !== id);
        useScheduleStore.setState({
          shifts: nextShifts,
          shiftLoadCounts: getShiftLoadCounts(nextShifts),
        });
        return { success: true };
      },

      publishWeekDraft: async ({ weekStartDate, weekEndDate }) => {
        const result = await useScheduleStore.getState().publishDraftRange({
          startDate: weekStartDate,
          endDate: weekEndDate,
        });
        return {
          success: result.success,
          error: result.error,
          deletedPublished: result.deletedCount,
          promotedDrafts: result.publishedCount,
          dedupedDrafts: 0,
        };
      },

      publishDraftRange: async ({ startDate, endDate }) => {
        const state = useScheduleStore.getState();
        const inRange = state.shifts.filter(
          (shift) => shift.date >= startDate && shift.date <= endDate,
        );
        const outsideRange = state.shifts.filter(
          (shift) => shift.date < startDate || shift.date > endDate,
        );

        const publishedBase = inRange.filter((shift) => shift.scheduleState !== 'draft');
        const draftRows = inRange.filter((shift) => shift.scheduleState === 'draft');
        const nextPublished = [...publishedBase];
        let deletedCount = 0;
        let publishedCount = 0;

        draftRows.forEach((draft) => {
          const key = shiftRangeKey(draft);
          const publishedIndex = nextPublished.findIndex((candidate) => shiftRangeKey(candidate) === key);
          if (publishedIndex !== -1) {
            nextPublished.splice(publishedIndex, 1);
            deletedCount += 1;
          }

          if (draft.isBlocked) {
            return;
          }

          nextPublished.push({
            ...draft,
            scheduleState: 'published',
            isBlocked: false,
            swapStatus: draft.swapStatus ?? 'none',
          });
          publishedCount += 1;
        });

        const nextShifts = [...outsideRange, ...nextPublished];
        useScheduleStore.setState({
          shifts: nextShifts,
          shiftLoadCounts: getShiftLoadCounts(nextShifts),
        });

        return { success: true, publishedCount, deletedCount };
      },

      seedDraftWeekFromPublished: async ({ weekStartDate, weekEndDate }) => {
        const state = useScheduleStore.getState();
        const source = state.shifts.filter(
          (shift) =>
            shift.scheduleState === 'published' &&
            shift.date >= weekStartDate &&
            shift.date <= weekEndDate &&
            !shift.isBlocked,
        );
        const existingDraftKeys = new Set(
          state.shifts
            .filter(
              (shift) =>
                shift.scheduleState === 'draft' &&
                shift.date >= weekStartDate &&
                shift.date <= weekEndDate,
            )
            .map((shift) => shiftRangeKey(shift)),
        );

        const draftRows = source
          .filter((shift) => !existingDraftKeys.has(shiftRangeKey(shift)))
          .map((shift) => ({
            ...shift,
            id: createDemoShiftId(),
            scheduleState: 'draft' as const,
            swapStatus: shift.swapStatus ?? 'none',
          }));

        if (draftRows.length) {
          const nextShifts = [...state.shifts, ...draftRows];
          useScheduleStore.setState({
            shifts: nextShifts,
            shiftLoadCounts: getShiftLoadCounts(nextShifts),
          });
        }

        return {
          seeded: draftRows.length > 0,
          insertedCount: draftRows.length,
          skippedCount: source.length - draftRows.length,
          sourceCount: source.length,
        };
      },

      copyPreviousDayIntoDraft: async (selectedDate) => {
        const state = useScheduleStore.getState();
        const targetDate = new Date(selectedDate);
        targetDate.setHours(0, 0, 0, 0);
        const sourceDate = new Date(targetDate);
        sourceDate.setDate(sourceDate.getDate() - 1);

        const targetYmd = targetDate.toISOString().slice(0, 10);
        const sourceYmd = sourceDate.toISOString().slice(0, 10);

        const sourceRows = state.shifts.filter(
          (shift) => shift.scheduleState === 'published' && shift.date === sourceYmd && !shift.isBlocked,
        );
        if (sourceRows.length === 0) {
          return { success: true, insertedCount: 0, skippedCount: 0, sourceCount: 0 };
        }

        const targetKeys = new Set(
          state.shifts
            .filter((shift) => shift.date === targetYmd && !shift.isBlocked)
            .map((shift) => shiftRangeKey(shift)),
        );

        const insertedRows: Shift[] = [];
        sourceRows.forEach((shift) => {
          const key = shiftRangeKey({ ...shift, date: targetYmd });
          if (targetKeys.has(key)) return;
          insertedRows.push({
            ...shift,
            id: createDemoShiftId(),
            date: targetYmd,
            scheduleState: 'draft',
            swapStatus: shift.swapStatus ?? 'none',
          });
          targetKeys.add(key);
        });

        if (insertedRows.length > 0) {
          const nextShifts = [...state.shifts, ...insertedRows];
          useScheduleStore.setState({
            shifts: nextShifts,
            shiftLoadCounts: getShiftLoadCounts(nextShifts),
          });
        }

        return {
          success: true,
          insertedCount: insertedRows.length,
          skippedCount: sourceRows.length - insertedRows.length,
          sourceCount: sourceRows.length,
        };
      },

      saveCoreHours: async (payload) => {
        const toTime = (value: string | null | undefined, fallback: string) => {
          const normalized = String(value ?? '').trim();
          if (!normalized) return fallback;
          if (normalized.length === 5) return `${normalized}:00`;
          return normalized;
        };

        const currentState = useScheduleStore.getState();
        const existingByDay = new Map(currentState.coreHours.map((row) => [row.dayOfWeek, row]));
        const updatedCoreHours = payload.hours.map((hour) => {
          const existing = existingByDay.get(hour.dayOfWeek);
          return {
            id: existing?.id ?? `demo-core-${hour.dayOfWeek}`,
            organizationId: payload.organizationId,
            dayOfWeek: hour.dayOfWeek,
            openTime: toTime(hour.openTime, existing?.openTime ?? '11:00:00'),
            closeTime: toTime(hour.closeTime, existing?.closeTime ?? '22:00:00'),
            enabled: Boolean(hour.enabled),
            sortOrder: existing?.sortOrder ?? hour.dayOfWeek,
          };
        });

        useScheduleStore.setState({ coreHours: updatedCoreHours });
        return { success: true };
      },
      addTimeOffRequest: async (request) => {
        const now = new Date().toISOString();
        const newRequest = {
          id: `demo-to-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          employeeId: request.employeeId,
          organizationId: request.organizationId,
          startDate: request.startDate,
          endDate: request.endDate,
          reason: request.reason?.trim() || '',
          status: 'PENDING' as const,
          createdAt: now,
        };
        useScheduleStore.setState((state) => ({
          timeOffRequests: [...state.timeOffRequests, newRequest],
        }));
        return { success: true };
      },
      reviewTimeOffRequest: async (id, status, reviewerId, managerNote) => {
        const now = new Date().toISOString();
        const state = useScheduleStore.getState();
        const exists = state.timeOffRequests.some((request) => request.id === id);
        if (!exists) return { success: false, error: 'Request not found.' };

        useScheduleStore.setState((current) => ({
          timeOffRequests: current.timeOffRequests.map((request) =>
            request.id === id
              ? {
                  ...request,
                  status,
                  reviewedBy: reviewerId,
                  reviewedAt: now,
                  managerNote: managerNote?.trim() || undefined,
                  updatedAt: now,
                }
              : request,
          ),
        }));
        return { success: true };
      },
      cancelTimeOffRequest: async (id) => {
        const now = new Date().toISOString();
        const state = useScheduleStore.getState();
        const exists = state.timeOffRequests.some((request) => request.id === id);
        if (!exists) return { success: false, error: 'Request not found.' };
        useScheduleStore.setState((current) => ({
          timeOffRequests: current.timeOffRequests.map((request) =>
            request.id === id
              ? {
                  ...request,
                  status: 'CANCELED',
                  canceledAt: now,
                  updatedAt: now,
                }
              : request,
          ),
        }));
        return { success: true };
      },
      submitBlockedDayRequest: makeInterceptor('block a day', interceptOnly),
      reviewBlockedDayRequest: makeInterceptor('review a blocked day', interceptOnly),
      cancelBlockedDayRequest: makeInterceptor('cancel a blocked day', interceptOnly),
      createImmediateBlockedDay: makeInterceptor('create a blocked day', interceptOnly),
      updateBlockedDay: makeInterceptor('update a blocked day', interceptOnly),
      deleteBlockedDay: makeInterceptor('delete a blocked day', interceptOnly),
      createBlockedPeriod: makeInterceptor('block a period', interceptOnly),
      deleteBlockedPeriod: makeInterceptor('remove a blocked period', interceptOnly),
      createDropRequest: (shiftId, employeeId) => {
        const state = useScheduleStore.getState();
        const shift = state.shifts.find((item) => item.id === shiftId);
        if (!shift) return;
        const alreadyOpen = state.dropRequests.some(
          (request) => request.shiftId === shiftId && request.status === 'open',
        );
        if (alreadyOpen) return;

        const nextRequest = {
          id: `demo-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          shiftId,
          fromEmployeeId: employeeId,
          status: 'open' as const,
          createdAt: new Date().toISOString(),
        };
        useScheduleStore.setState((current) => ({
          dropRequests: [...current.dropRequests, nextRequest],
          shifts: current.shifts.map((item) =>
            item.id === shiftId
              ? {
                  ...item,
                  swapStatus: 'offered',
                }
              : item,
          ),
        }));
      },
      acceptDropRequest: async (requestId, acceptingEmployeeId) => {
        const now = new Date().toISOString();
        const state = useScheduleStore.getState();
        const request = state.dropRequests.find((item) => item.id === requestId);
        if (!request || request.status !== 'open') {
          return { success: false, error: 'Request no longer available.' };
        }
        const shift = state.shifts.find((item) => item.id === request.shiftId);
        if (!shift) {
          return { success: false, error: 'Shift not found.' };
        }

        useScheduleStore.setState((current) => ({
          dropRequests: current.dropRequests.map((item) => {
            if (item.id === requestId) {
              return {
                ...item,
                status: 'accepted',
                acceptedByEmployeeId: acceptingEmployeeId,
                acceptedAt: now,
              };
            }
            if (item.shiftId === request.shiftId && item.status === 'open') {
              return {
                ...item,
                status: 'cancelled',
              };
            }
            return item;
          }),
          shifts: current.shifts.map((item) =>
            item.id === request.shiftId
              ? {
                  ...item,
                  employeeId: acceptingEmployeeId,
                  swapStatus: 'claimed',
                }
              : item,
          ),
        }));
        return { success: true };
      },
      cancelDropRequest: (requestId) => {
        const state = useScheduleStore.getState();
        const target = state.dropRequests.find((item) => item.id === requestId);
        if (!target) return;

        useScheduleStore.setState((current) => {
          const nextDropRequests = current.dropRequests.map((item) =>
            item.id === requestId ? { ...item, status: 'cancelled' as const } : item,
          );
          const hasOpenForShift = nextDropRequests.some(
            (item) => item.shiftId === target.shiftId && item.status === 'open',
          );
          return {
            dropRequests: nextDropRequests,
            shifts: current.shifts.map((item) =>
              item.id === target.shiftId
                ? {
                    ...item,
                    swapStatus: hasOpenForShift ? 'offered' : 'none',
                  }
                : item,
            ),
          };
        });
      },
      sendChatMessage: (senderId, text, type = 'message', dropRequestId) => {
        const nextMessage = {
          id: `demo-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          senderId,
          createdAt: new Date().toISOString(),
          text,
          type,
          dropRequestId,
        };
        useScheduleStore.setState((state) => ({
          chatMessages: [...state.chatMessages, nextMessage],
        }));
      },
    };

    useScheduleStore.setState(scheduleOverrides);
    applySnapshotToStore(hydratedSnapshot);

    const authOverrides: Partial<AuthStoreState> = {
      currentUser: cloneJson(DEMO_DATA.currentUser),
      userProfiles: [cloneJson(DEMO_DATA.currentUser)],
      accessibleRestaurants: cloneJson(DEMO_DATA.accessibleRestaurants),
      pendingInvitations: [],
      isInitialized: true,
      activeRestaurantId: DEMO_DATA.orgId,
      activeRestaurantCode: DEMO_DATA.restaurant.restaurantCode,
      subscriptionStatus: 'active',
      subscriptionDetails: null,

      init: async () => {},
      signIn: async () => ({ error: 'Demo mode' }),
      signOut: async () => {},
      refreshProfile: async () => {},
      refreshInvitations: async () => {},
      fetchSubscriptionStatus: async () => {},
      setActiveOrganization: () => {},
      clearActiveOrganization: () => {},
      updateProfile: async () => {
        interceptOnly('update your profile');
        return { success: false, error: 'Demo mode' };
      },
    };
    useAuthStore.setState(authOverrides);

    const unsubscribe = useScheduleStore.subscribe(() => {
      if (restoringRef.current) return;
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        persistNow();
      }, PERSIST_DEBOUNCE_MS);
    });

    persistNow();

    return () => {
      unsubscribe();
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      restoringRef.current = true;
      if (scheduleOriginals.current) {
        useScheduleStore.setState(scheduleOriginals.current);
      }
      if (authOriginals.current) {
        useAuthStore.setState(authOriginals.current);
      }
      restoringRef.current = false;
    };
  }, [applySnapshotToStore, intercept, persistNow]);

  const contextValue: DemoContextValue = {
    isDemo: true,
    intercept,
    resetDemo,
  };

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
