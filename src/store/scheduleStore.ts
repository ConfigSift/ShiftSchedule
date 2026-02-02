'use client';

import { create } from 'zustand';
import {
  Employee,
  Shift,
  TimeOffRequest,
  BlockedDayRequest,
  BlockedDayStatus,
  BusinessHour,
  Location,
  DropShiftRequest,
  ChatMessage,
  TimeOffStatus,
  DropRequestStatus,
  JOB_OPTIONS,
  ScheduleViewSettings,
  ScheduleHourMode,
} from '../types';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from '../utils/storage';
import { generateId, shiftsOverlap } from '../utils/timeUtils';
import { supabase } from '../lib/supabase/client';
import { getUserRole, isManagerRole } from '../utils/role';
import { normalizeUserRow } from '../utils/userMapper';
import { useAuthStore } from './authStore';
import { apiFetch } from '../lib/apiClient';

function parseTimeToDecimal(value: string | number | null): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const text = String(value);
  if (text.includes(':')) {
    const [hours, minutes = '0'] = text.split(':');
    const hour = Number(hours);
    const minute = Number(minutes);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
    return hour + minute / 60;
  }
  const asNumber = Number(text);
  return Number.isNaN(asNumber) ? 0 : asNumber;
}

function formatTimeFromDecimal(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const hours = Math.floor(safe);
  const minutes = Math.round((safe - hours) * 60);
  const paddedHours = String(Math.max(0, Math.min(23, hours))).padStart(2, '0');
  const paddedMinutes = String(Math.max(0, Math.min(59, minutes))).padStart(2, '0');
  return `${paddedHours}:${paddedMinutes}:00`;
}

const DEBUG_SHIFT_SAVE = false;

function clampForEditShift(startHour: number, endHour: number) {
  const minHour = 0;
  const maxHour = 24;
  const nextStart = Math.max(minHour, Math.min(maxHour, startHour));
  const nextEnd = Math.max(minHour, Math.min(maxHour, endHour));
  return { startHour: nextStart, endHour: nextEnd };
}

function clampForNewShift(startHour: number, endHour: number) {
  // New shift constraints are enforced elsewhere (business hours, overlap checks).
  const minHour = 0;
  const maxHour = 24;
  const nextStart = Math.max(minHour, Math.min(maxHour, startHour));
  const nextEnd = Math.max(minHour, Math.min(maxHour, endHour));
  return { startHour: nextStart, endHour: nextEnd };
}

function isValidJob(value: unknown): value is string {
  if (!value) return false;
  return JOB_OPTIONS.includes(String(value) as (typeof JOB_OPTIONS)[number]);
}

// Convert Date to YYYY-MM-DD string using LOCAL timezone (not UTC)
// This ensures consistent date comparison with shift_date values
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type ViewMode = 'day' | 'week' | 'month';
type ModalType =
  | 'addShift'
  | 'editShift'
  | 'addEmployee'
  | 'editEmployee'
  | 'timeOffRequest'
  | 'blockedDayRequest'
  | 'blockedPeriod'
  | 'timeOffReview'
  | 'dropShift'
  | 'copySchedule'
  | null;

interface ScheduleState {
  employees: Employee[];
  shifts: Shift[];
  timeOffRequests: TimeOffRequest[];
  blockedDayRequests: BlockedDayRequest[];
  businessHours: BusinessHour[];
  scheduleViewSettings: ScheduleViewSettings | null;
  locations: Location[];
  dropRequests: DropShiftRequest[];
  chatMessages: ChatMessage[];

  selectedDate: Date;
  viewMode: ViewMode;
  selectedSections: string[];
  selectedEmployeeIds: string[];
  workingTodayOnly: boolean;
  hoveredShiftId: string | null;

  modalType: ModalType;
  modalData: any;

  toast: { message: string; type: 'success' | 'error' } | null;
  isHydrated: boolean;
  shiftLoadCounts: { total: number; visible: number };
  dateNavDirection: 'prev' | 'next' | null;
  dateNavKey: number;

  hydrate: () => void;
  loadRestaurantData: (restaurantId: string | null) => Promise<void>;
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSection: (section: string) => void;
  setSectionSelectedForRestaurant: (section: string, selected: boolean, restaurantId: string | null) => void;
  toggleEmployee: (employeeId: string) => void;
  setSelectedEmployeeIds: (ids: string[]) => void;
  selectAllEmployeesForRestaurant: (restaurantId: string | null) => void;
  deselectAllEmployees: () => void;
  toggleWorkingTodayOnly: () => void;
  getWorkingEmployeeIdsForDate: (date: Date) => string[];
  setHoveredShift: (shiftId: string | null) => void;
  applyRestaurantScope: (restaurantId: string | null) => void;

  openModal: (type: ModalType, data?: any) => void;
  closeModal: () => void;

  showToast: (message: string, type: 'success' | 'error') => void;
  clearToast: () => void;

  getEmployeeById: (id: string) => Employee | undefined;
  setLocations: (locations: Location[]) => void;
  getLocationById: (id: string) => Location | undefined;

  addShift: (
    shift: Omit<Shift, 'id'>,
    options?: { allowTimeOffOverride?: boolean; allowBlockedOverride?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  updateShift: (
    id: string,
    updates: Partial<Shift>,
    options?: { allowTimeOffOverride?: boolean; allowBlockedOverride?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  deleteShift: (id: string) => Promise<{ success: boolean; error?: string }>;

  addTimeOffRequest: (request: {
    employeeId: string;
    requesterAuthUserId: string;
    organizationId: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  reviewTimeOffRequest: (id: string, status: TimeOffStatus, reviewerId: string, managerNote?: string) => Promise<{ success: boolean; error?: string }>;
  cancelTimeOffRequest: (id: string) => Promise<{ success: boolean; error?: string }>;
  getTimeOffForDate: (employeeId: string, date: string) => TimeOffRequest | undefined;
  hasApprovedTimeOff: (employeeId: string, date: string) => boolean;

  submitBlockedDayRequest: (request: {
    organizationId: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) => Promise<{ success: boolean; error?: string }>;
  reviewBlockedDayRequest: (id: string, status: BlockedDayStatus, managerNote?: string) => Promise<{ success: boolean; error?: string }>;
  cancelBlockedDayRequest: (id: string) => Promise<{ success: boolean; error?: string }>;
  createImmediateBlockedDay: (data: {
    organizationId: string;
    userId?: string | null;
    scope: 'ORG_BLACKOUT' | 'EMPLOYEE';
    startDate: string;
    endDate: string;
    reason: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateBlockedDay: (data: {
    id: string;
    organizationId: string;
    userId?: string | null;
    scope: 'ORG_BLACKOUT' | 'EMPLOYEE';
    startDate: string;
    endDate: string;
    reason: string;
    status?: BlockedDayStatus;
    managerNote?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  deleteBlockedDay: (id: string, organizationId: string) => Promise<{ success: boolean; error?: string }>;

  createBlockedPeriod: (employeeId: string, startDate: string, endDate: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  deleteBlockedPeriod: (blockId: string) => Promise<{ success: boolean; error?: string }>;
  getBlockedRequestsForEmployee: (employeeId: string) => BlockedDayRequest[];
  getOrgBlackoutDays: () => BlockedDayRequest[];
  hasBlockedShiftOnDate: (employeeId: string, date: string) => boolean;
  hasOrgBlackoutOnDate: (date: string) => boolean;

  createDropRequest: (shiftId: string, employeeId: string) => void;
  acceptDropRequest: (requestId: string, acceptingEmployeeId: string) => Promise<{ success: boolean; error?: string }>;
  cancelDropRequest: (requestId: string) => void;

  sendChatMessage: (senderId: string, text: string, type?: ChatMessage['type'], dropRequestId?: string) => void;

  goToToday: () => void;
  goToPrevious: () => void;
  goToNext: () => void;

  getFilteredEmployeesForRestaurant: (restaurantId: string | null) => Employee[];
  getEmployeesForRestaurant: (restaurantId: string | null) => Employee[];
  getShiftsForRestaurant: (restaurantId: string | null) => Shift[];
  getPendingTimeOffRequests: () => TimeOffRequest[];
  getOpenDropRequests: () => DropShiftRequest[];

  getEffectiveHourRange: (dayOfWeek?: number) => { startHour: number; endHour: number };
  setScheduleViewSettings: (settings: ScheduleViewSettings | null) => void;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  employees: [],
  shifts: [],
  timeOffRequests: [],
  blockedDayRequests: [],
  businessHours: [],
  scheduleViewSettings: null,
  locations: [],
  dropRequests: [],
  chatMessages: [],

  selectedDate: new Date(),
  viewMode: 'day',
  selectedSections: ['kitchen', 'front', 'bar', 'management'],
  selectedEmployeeIds: [],
  workingTodayOnly: true,
  hoveredShiftId: null,

  modalType: null,
  modalData: null,

  toast: null,
  isHydrated: false,
  shiftLoadCounts: { total: 0, visible: 0 },
  dateNavDirection: null,
  dateNavKey: 0,

  hydrate: () => {
    const dropRequests = loadFromStorage<DropShiftRequest[]>(STORAGE_KEYS.DROP_REQUESTS, []);
    const chatMessages = loadFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, []);

    set({
      timeOffRequests: [],
      blockedDayRequests: [],
      businessHours: [],
      scheduleViewSettings: null,
      dropRequests,
      chatMessages,
      isHydrated: true,
    });
  },

  loadRestaurantData: async (restaurantId) => {
    if (!restaurantId) {
      set({
        employees: [],
        shifts: [],
        selectedEmployeeIds: [],
        timeOffRequests: [],
        blockedDayRequests: [],
        businessHours: [],
        scheduleViewSettings: null,
        locations: [],
        shiftLoadCounts: { total: 0, visible: 0 },
      });
      return;
    }

    const currentUser = useAuthStore.getState().currentUser;
    const currentRole = getUserRole(currentUser?.role);

    const { data: userData, error: userError } = (await supabase
      .from('users')
      .select('*')
      .eq('organization_id', restaurantId)) as {
      data: Array<Record<string, any>> | null;
      error: { message: string } | null;
    };

    if (userError) {
      set({
        employees: [],
        shifts: [],
        selectedEmployeeIds: [],
        timeOffRequests: [],
        blockedDayRequests: [],
        businessHours: [],
        scheduleViewSettings: null,
        locations: [],
        shiftLoadCounts: { total: 0, visible: 0 },
      });
      return;
    }

    const employees: Employee[] = (userData || []).map((row) => {
      const normalized = normalizeUserRow(row);
      const profileRole = normalized.role;
      const section = profileRole === 'MANAGER' || profileRole === 'ADMIN' ? 'management' : 'front';

      return {
        id: normalized.id,
        name: normalized.fullName,
        section,
        userRole: profileRole,
        restaurantId,
        profile: {
          email: normalized.email ?? undefined,
          phone: normalized.phone ?? undefined,
        },
        isActive: true,
        jobs: normalized.jobs,
        hourlyPay: normalized.hourlyPay,
        jobPay: normalized.jobPay,
        email: normalized.email ?? undefined,
        phone: normalized.phone ?? undefined,
      };
    });

    const { data: locationData, error: locationError } = (await supabase
      .from('locations')
      .select('id,organization_id,name,sort_order,created_at')
      .eq('organization_id', restaurantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    const locations: Location[] = locationError
      ? []
      : (locationData || []).map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          name: row.name,
          sortOrder: Number(row.sort_order ?? 0),
          createdAt: row.created_at ?? new Date().toISOString(),
        }));

    let shiftQuery = supabase
      .from('shifts')
      .select('*')
      .eq('organization_id', restaurantId);

    const { data: shiftData, error: shiftError } = (await shiftQuery) as {
      data: Array<Record<string, any>> | null;
      error: { message: string } | null;
    };

    if (shiftError) {
      set({
        employees,
        shifts: [],
        selectedEmployeeIds: employees.map((e) => e.id),
        timeOffRequests: [],
        blockedDayRequests: [],
        businessHours: [],
        scheduleViewSettings: null,
        locations,
        shiftLoadCounts: { total: 0, visible: 0 },
      });
      return;
    }

    const shifts: Shift[] = (shiftData || []).map((row) => ({
      id: row.id,
      employeeId: row.user_id,
      restaurantId: row.organization_id,
      date: row.shift_date,
      startHour: parseTimeToDecimal(row.start_time),
      endHour: parseTimeToDecimal(row.end_time),
      notes: row.notes ?? undefined,
      isBlocked: Boolean(row.is_blocked),
      job: isValidJob(row.job) ? row.job : undefined,
      locationId: row.location_id ?? null,
      payRate: row.pay_rate != null ? Number(row.pay_rate) : undefined,
      paySource: row.pay_source ?? undefined,
    }));

    let timeOffData: Array<Record<string, any>> | null = null;
    let timeOffError: { message: string } | null = null;

    const baseTimeOffQuery = (supabase as any)
      .from('time_off_requests')
      .select('*')
      .eq('organization_id', restaurantId);

    if (currentRole === 'EMPLOYEE' && currentUser?.authUserId) {
      const primaryQuery = baseTimeOffQuery.eq('requester_auth_user_id', currentUser.authUserId);
      const primaryResult = (await primaryQuery) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };
      if (!primaryResult.error) {
        timeOffData = primaryResult.data;
      } else if (primaryResult.error.message?.toLowerCase().includes('requester_auth_user_id')) {
        const fallbackQuery = baseTimeOffQuery.eq('auth_user_id', currentUser.authUserId);
        const fallbackResult = (await fallbackQuery) as {
          data: Array<Record<string, any>> | null;
          error: { message: string } | null;
        };
        if (!fallbackResult.error) {
          timeOffData = fallbackResult.data;
        } else if (fallbackResult.error.message?.toLowerCase().includes('auth_user_id')) {
          const secondFallbackQuery = baseTimeOffQuery.eq('requester_user_id', currentUser.authUserId);
          const secondFallbackResult = (await secondFallbackQuery) as {
            data: Array<Record<string, any>> | null;
            error: { message: string } | null;
          };
          timeOffData = secondFallbackResult.data;
          timeOffError = secondFallbackResult.error;
        } else {
          timeOffError = fallbackResult.error;
        }
      } else {
        timeOffError = primaryResult.error;
      }
    } else {
      const result = (await baseTimeOffQuery) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };
      timeOffData = result.data;
      timeOffError = result.error;
    }

    const timeOffRequests: TimeOffRequest[] = timeOffError
      ? []
      : (timeOffData || []).map((row) => ({
          id: row.id,
          employeeId:
            row.user_id
            ?? row.requester_auth_user_id
            ?? row.auth_user_id
            ?? row.requester_user_id
            ?? '',
          organizationId: row.organization_id ?? undefined,
          startDate: row.start_date,
          endDate: row.end_date,
          reason: row.reason ?? row.note ?? undefined,
          status: String(row.status ?? 'PENDING').toUpperCase() as TimeOffStatus,
          createdAt: row.created_at,
          updatedAt: row.updated_at ?? undefined,
          reviewedBy: row.reviewed_by ?? undefined,
          reviewedAt: row.reviewed_at ?? undefined,
          managerNote: row.manager_note ?? undefined,
        }));

    const blockedQuery = (supabase as any)
      .from('blocked_day_requests')
      .select('*')
      .eq('organization_id', restaurantId);

    let blockedData: Array<Record<string, any>> | null = null;
    let blockedError: { message: string } | null = null;
    if (currentRole === 'EMPLOYEE' && currentUser?.authUserId) {
      const [ownResult, blackoutResult] = await Promise.all([
        blockedQuery.eq('requested_by_auth_user_id', currentUser.authUserId),
        (supabase as any)
          .from('blocked_day_requests')
          .select('*')
          .eq('organization_id', restaurantId)
          .eq('scope', 'ORG_BLACKOUT')
          .eq('status', 'APPROVED'),
      ]);
      const ownData = ownResult.data as Array<Record<string, any>> | null;
      const blackoutData = blackoutResult.data as Array<Record<string, any>> | null;
      blockedData = [...(ownData || []), ...(blackoutData || [])];
      blockedError = ownResult.error ?? blackoutResult.error;
    } else {
      const result = await blockedQuery;
      blockedData = result.data as Array<Record<string, any>> | null;
      blockedError = result.error as { message: string } | null;
    }

    const blockedDayRequests: BlockedDayRequest[] = blockedError
      ? []
      : (blockedData || []).map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          userId: row.user_id ?? undefined,
          scope: String(row.scope ?? 'EMPLOYEE').toUpperCase() === 'ORG_BLACKOUT' ? 'ORG_BLACKOUT' : 'EMPLOYEE',
          startDate: row.start_date,
          endDate: row.end_date,
          reason: row.reason ?? '',
          status: String(row.status ?? 'PENDING').toUpperCase() as BlockedDayStatus,
          managerNote: row.manager_note ?? undefined,
          requestedByAuthUserId: row.requested_by_auth_user_id ?? '',
          reviewedByAuthUserId: row.reviewed_by_auth_user_id ?? undefined,
          reviewedAt: row.reviewed_at ?? undefined,
          createdAt: row.created_at ?? new Date().toISOString(),
          updatedAt: row.updated_at ?? undefined,
        }));

    const { data: businessData, error: businessError } = (await (supabase as any)
      .from('business_hours')
      .select('*')
      .eq('organization_id', restaurantId)) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

    const businessHours: BusinessHour[] = businessError
      ? []
      : (businessData || []).map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          dayOfWeek: Number(row.day_of_week ?? 0),
          openTime: row.open_time ?? undefined,
          closeTime: row.close_time ?? undefined,
          enabled: Boolean(row.enabled),
        }));

    // Load schedule view settings
    const { data: settingsData, error: settingsError } = (await (supabase as any)
      .from('schedule_view_settings')
      .select('*')
      .eq('organization_id', restaurantId)
      .maybeSingle()) as {
        data: Record<string, any> | null;
        error: { message: string } | null;
      };

    const scheduleViewSettings: ScheduleViewSettings | null = settingsError || !settingsData
      ? null
      : {
          id: settingsData.id,
          organizationId: settingsData.organization_id,
          hourMode: (settingsData.hour_mode ?? 'full24') as ScheduleHourMode,
          customStartHour: Number(settingsData.custom_start_hour ?? 0),
          customEndHour: Number(settingsData.custom_end_hour ?? 24),
        };

    set({
      employees,
      shifts,
      selectedEmployeeIds: employees.map((e) => e.id),
      timeOffRequests,
      blockedDayRequests,
      businessHours,
      scheduleViewSettings,
      locations,
      shiftLoadCounts: {
        total: shiftData?.length ?? 0,
        visible: shifts.length,
      },
    });
  },

  setSelectedDate: (date) => set({ selectedDate: date }),
  setViewMode: (mode) => set({ viewMode: mode }),

  toggleSection: (section) => set((state) => {
    const isSelected = state.selectedSections.includes(section);
    const newSections = isSelected
      ? state.selectedSections.filter((s) => s !== section)
      : [...state.selectedSections, section];

    const sectionEmployees = state.employees.filter((e) => e.section === section);
    const sectionEmployeeIds = sectionEmployees.map((e) => e.id);

    let newSelectedIds: string[];
    if (isSelected) {
      newSelectedIds = state.selectedEmployeeIds.filter((id) => !sectionEmployeeIds.includes(id));
    } else {
      newSelectedIds = [...new Set([...state.selectedEmployeeIds, ...sectionEmployeeIds])];
    }

    return {
      selectedSections: newSections,
      selectedEmployeeIds: newSelectedIds,
    };
  }),

  setSectionSelectedForRestaurant: (section, selected, restaurantId) => set((state) => {
    if (!restaurantId) {
      return {
        selectedSections: selected
          ? [...state.selectedSections, section]
          : state.selectedSections.filter((s) => s !== section),
        selectedEmployeeIds: [],
      };
    }

    // Filter by jobs array (job titles like 'Server', 'Bartender') not legacy section field
    const sectionEmployees = state.employees.filter(
      (e) => e.jobs?.includes(section) && e.restaurantId === restaurantId && e.isActive
    );
    const sectionEmployeeIds = sectionEmployees.map((e) => e.id);

    let newSelectedIds: string[] = [];
    let newSections: string[] = [];

    if (selected) {
      newSelectedIds = [...new Set([...state.selectedEmployeeIds, ...sectionEmployeeIds])];
      newSections = state.selectedSections.includes(section)
        ? state.selectedSections
        : [...state.selectedSections, section];
    } else {
      newSelectedIds = state.selectedEmployeeIds.filter((id) => !sectionEmployeeIds.includes(id));
      newSections = state.selectedSections.filter((s) => s !== section);
    }

    return {
      selectedSections: newSections,
      selectedEmployeeIds: newSelectedIds,
    };
  }),

  toggleEmployee: (employeeId) => set((state) => ({
    selectedEmployeeIds: state.selectedEmployeeIds.includes(employeeId)
      ? state.selectedEmployeeIds.filter((id) => id !== employeeId)
      : [...state.selectedEmployeeIds, employeeId],
  })),

  setSelectedEmployeeIds: (ids) => set({ selectedEmployeeIds: ids }),

  selectAllEmployeesForRestaurant: (restaurantId) => set((state) => {
    if (!restaurantId) return { selectedEmployeeIds: [] };
    // Select all active employees in the restaurant (not filtered by legacy sections)
    return {
      selectedEmployeeIds: state.employees
        .filter((e) => e.restaurantId === restaurantId && e.isActive)
        .map((e) => e.id),
    };
  }),

  deselectAllEmployees: () => set({ selectedEmployeeIds: [] }),

  toggleWorkingTodayOnly: () => set((state) => ({ workingTodayOnly: !state.workingTodayOnly })),

  getWorkingEmployeeIdsForDate: (date) => {
    const state = get();
    const dateString = toLocalDateString(date);
    // Build a Set of employee IDs who have at least one non-blocked shift on this date
    const workingIds = new Set<string>();
    for (const shift of state.shifts) {
      if (shift.date === dateString && !shift.isBlocked) {
        workingIds.add(shift.employeeId);
      }
    }
    return Array.from(workingIds);
  },

  setHoveredShift: (shiftId) => set({ hoveredShiftId: shiftId }),

  applyRestaurantScope: (restaurantId) => set((state) => {
    if (!restaurantId) {
      return { selectedEmployeeIds: [] };
    }
    const scopedEmployees = state.employees.filter(
      (e) => e.restaurantId === restaurantId && state.selectedSections.includes(e.section)
    );
    return { selectedEmployeeIds: scopedEmployees.map((e) => e.id) };
  }),

  openModal: (type, data = null) => set({ modalType: type, modalData: data }),
  closeModal: () => set({ modalType: null, modalData: null }),

  showToast: (message, type) => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },
  clearToast: () => set({ toast: null }),

  getEmployeeById: (id) => get().employees.find((e) => e.id === id),
  setLocations: (locations) => set({ locations }),
  getLocationById: (id) => get().locations.find((location) => location.id === id),

  addShift: async (shift, options) => {
    const state = get();
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { success: false, error: "You don't have permission to modify shifts." };
    }
    const restaurantId = shift.restaurantId;
    if (!restaurantId) {
      return { success: false, error: 'Restaurant not assigned for this shift' };
    }

    if (state.hasApprovedTimeOff(shift.employeeId, shift.date) && !options?.allowTimeOffOverride) {
      return { success: false, error: 'Employee has approved time off on this date' };
    }

    if (state.hasBlockedShiftOnDate(shift.employeeId, shift.date) && !options?.allowBlockedOverride) {
      return { success: false, error: 'This employee is blocked out on that date' };
    }

    if (!isValidJob(shift.job)) {
      return { success: false, error: 'Job is required for this shift' };
    }

    const existingShifts = state.shifts.filter(
      (s) => s.employeeId === shift.employeeId && s.date === shift.date && !s.isBlocked
    );

    for (const existing of existingShifts) {
      if (shiftsOverlap(shift.startHour, shift.endHour, existing.startHour, existing.endHour)) {
        return { success: false, error: 'Shift overlaps with existing shift' };
      }
    }

    const safeJob = shift.job;
    const { data, error } = await (supabase as any)
      .from('shifts')
      .insert({
        organization_id: restaurantId,
        user_id: shift.employeeId,
        shift_date: shift.date,
        start_time: formatTimeFromDecimal(shift.startHour),
        end_time: formatTimeFromDecimal(shift.endHour),
        notes: shift.notes ?? null,
        is_blocked: false,
        job: safeJob,
        location_id: shift.locationId ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Failed to add shift' };
    }

    const newShift: Shift = {
      id: data.id,
      employeeId: data.user_id,
      restaurantId: data.organization_id,
      date: data.shift_date,
      startHour: parseTimeToDecimal(data.start_time),
      endHour: parseTimeToDecimal(data.end_time),
      notes: data.notes ?? undefined,
      isBlocked: Boolean(data.is_blocked),
      job: isValidJob(data.job) ? data.job : undefined,
      locationId: data.location_id ?? null,
      payRate: data.pay_rate != null ? Number(data.pay_rate) : undefined,
      paySource: data.pay_source ?? undefined,
    };

    // Immutable update: create new array with the new shift
    set({ shifts: [...state.shifts, newShift] });
    return { success: true };
  },

  updateShift: async (id, updates, options) => {
    const state = get();
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { success: false, error: "You don't have permission to modify shifts." };
    }
    const shift = state.shifts.find((s) => s.id === id);
    if (!shift) return { success: false, error: 'Shift not found' };
    if (shift.isBlocked) return { success: false, error: 'Blocked entries cannot be edited here' };

    const updateId = `${id}-${Date.now()}`;
    const updatedShift = { ...shift, ...updates };
    if (DEBUG_SHIFT_SAVE) {
      console.log('SHIFT_SAVE', {
        stage: 'input',
        updateId,
        shiftId: id,
        employeeId: updatedShift.employeeId,
        date: updatedShift.date,
        startMin: updatedShift.startHour * 60,
        endMin: updatedShift.endHour * 60,
      });
    }
    if (DEBUG_SHIFT_SAVE) {
      console.log('SAVE LAYER', {
        before: { start: updatedShift.startHour, end: updatedShift.endHour },
      });
    }
    const clampedEdit = clampForEditShift(updatedShift.startHour, updatedShift.endHour);
    updatedShift.startHour = clampedEdit.startHour;
    updatedShift.endHour = clampedEdit.endHour;

    if (DEBUG_SHIFT_SAVE) {
      console.log('SAVE LAYER', {
        afterClamp: { start: updatedShift.startHour, end: updatedShift.endHour },
        formatted: {
          start: formatTimeFromDecimal(updatedShift.startHour),
          end: formatTimeFromDecimal(updatedShift.endHour),
        },
      });
      console.log('SHIFT_SAVE', {
        stage: 'afterClamp',
        updateId,
        startMin: updatedShift.startHour * 60,
        endMin: updatedShift.endHour * 60,
      });
    }

    if (state.hasApprovedTimeOff(updatedShift.employeeId, updatedShift.date) && !options?.allowTimeOffOverride) {
      return { success: false, error: 'Employee has approved time off on this date' };
    }

    if (state.hasBlockedShiftOnDate(updatedShift.employeeId, updatedShift.date) && !options?.allowBlockedOverride) {
      return { success: false, error: 'This employee is blocked out on that date' };
    }

    const existingShifts = state.shifts.filter(
      (s) =>
        s.id !== id && s.employeeId === updatedShift.employeeId && s.date === updatedShift.date && !s.isBlocked
    );

    for (const existing of existingShifts) {
      if (shiftsOverlap(updatedShift.startHour, updatedShift.endHour, existing.startHour, existing.endHour)) {
        return { success: false, error: 'Shift overlaps with existing shift' };
      }
    }

    if (!isValidJob(updatedShift.job)) {
      return { success: false, error: 'Job is required for this shift' };
    }
    const safeJob = updatedShift.job;
    const payload = {
        organization_id: updatedShift.restaurantId,
        user_id: updatedShift.employeeId,
        shift_date: updatedShift.date,
        start_time: formatTimeFromDecimal(updatedShift.startHour),
        end_time: formatTimeFromDecimal(updatedShift.endHour),
        notes: updatedShift.notes ?? null,
        is_blocked: false,
        job: safeJob,
        location_id: updatedShift.locationId ?? null,
      };

    if (DEBUG_SHIFT_SAVE) {
      console.log('SHIFT_SAVE', {
        stage: 'payload',
        updateId,
        payload,
      });
    }

    const { data: updatedRow, error } = await (supabase as any)
      .from('shifts')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (DEBUG_SHIFT_SAVE) {
      console.log('SHIFT_SAVE', {
        stage: 'response',
        updateId,
        row: updatedRow ?? null,
      });
    }

    // Build shift from DB response to get accurate pay_rate/pay_source from trigger
    const finalShift: Shift = {
      id: updatedRow.id,
      employeeId: updatedRow.user_id,
      restaurantId: updatedRow.organization_id,
      date: updatedRow.shift_date,
      startHour: parseTimeToDecimal(updatedRow.start_time),
      endHour: parseTimeToDecimal(updatedRow.end_time),
      notes: updatedRow.notes ?? undefined,
      isBlocked: Boolean(updatedRow.is_blocked),
      job: isValidJob(updatedRow.job) ? updatedRow.job : undefined,
      locationId: updatedRow.location_id ?? null,
      payRate: updatedRow.pay_rate != null ? Number(updatedRow.pay_rate) : undefined,
      paySource: updatedRow.pay_source ?? undefined,
    };

    // Immutable update: create new array with the updated shift
    const newShifts = state.shifts.map((s) => (s.id === id ? finalShift : s));
    set({ shifts: newShifts });

    if (DEBUG_SHIFT_SAVE) {
      console.log('SAVE LAYER', {
        saved: { start: finalShift.startHour, end: finalShift.endHour },
      });
      console.log('SHIFT_SAVE', {
        stage: 'store',
        updateId,
        startMin: finalShift.startHour * 60,
        endMin: finalShift.endHour * 60,
        payRate: finalShift.payRate,
        paySource: finalShift.paySource,
      });
    }
    return { success: true };
  },

  deleteShift: async (id) => {
    const state = get();
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { success: false, error: "You don't have permission to modify shifts." };
    }
    const { error } = await (supabase as any).from('shifts').delete().eq('id', id);
    if (error) {
      return { success: false, error: error.message };
    }
    set({ shifts: state.shifts.filter((s) => s.id !== id) });
    return { success: true };
  },

  addTimeOffRequest: async (request) => {
    const state = get();
    if (!request.reason || !String(request.reason).trim()) {
      return { success: false, error: 'Reason is required for this request' };
    }
    if (get().hasOrgBlackoutOnDate(request.startDate) || get().hasOrgBlackoutOnDate(request.endDate)) {
      return { success: false, error: 'Time off is not allowed on blackout dates.' };
    }

    const result = await apiFetch<{ request: Record<string, any> }>('/api/time-off/request', {
      method: 'POST',
      json: {
        organizationId: request.organizationId,
        startDate: request.startDate,
        endDate: request.endDate,
        reason: request.reason,
      },
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Failed to submit request' };
    }

    const insertData = result.data.request;
    const newRequest: TimeOffRequest = {
      id: insertData.id,
      employeeId:
        insertData.user_id
        ?? insertData.requester_auth_user_id
        ?? insertData.auth_user_id
        ?? insertData.requester_user_id
        ?? '',
      organizationId: insertData.organization_id ?? undefined,
      startDate: insertData.start_date,
      endDate: insertData.end_date,
      reason: insertData.reason ?? insertData.note ?? undefined,
      status: String(insertData.status ?? 'PENDING').toUpperCase() as TimeOffStatus,
      createdAt: insertData.created_at,
      updatedAt: insertData.updated_at ?? undefined,
      reviewedBy: insertData.reviewed_by ?? undefined,
      reviewedAt: insertData.reviewed_at ?? undefined,
      managerNote: insertData.manager_note ?? undefined,
    };

    set({ timeOffRequests: [...state.timeOffRequests, newRequest] });
    return { success: true };
  },

  reviewTimeOffRequest: async (id, status, reviewerId, managerNote) => {
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
    const normalizedStatus = String(status || '').toUpperCase() as TimeOffStatus;

    const result = await apiFetch<{ request: Record<string, any> }>('/api/time-off/review', {
      method: 'POST',
      json: {
        id,
        organizationId,
        status: normalizedStatus,
        managerNote,
      },
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Unable to update request' };
    }

    const data = result.data.request;
    set((state) => ({
      timeOffRequests: state.timeOffRequests.map((req) =>
        req.id === id
          ? {
              ...req,
              status: String(data.status ?? normalizedStatus).toUpperCase() as TimeOffStatus,
              reviewedBy: data.reviewed_by ?? req.reviewedBy,
              reviewedAt: data.reviewed_at ?? req.reviewedAt,
              managerNote: data.manager_note ?? req.managerNote,
              updatedAt: data.updated_at ?? req.updatedAt,
            }
          : req
      ),
    }));
    return { success: true };
  },

  cancelTimeOffRequest: async (id) => {
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }

    const result = await apiFetch<{ request: Record<string, any> }>('/api/time-off/cancel', {
      method: 'POST',
      json: {
        id,
        organizationId,
      },
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Unable to cancel request' };
    }

    const data = result.data.request;
    set((state) => ({
      timeOffRequests: state.timeOffRequests.map((req) =>
        req.id === id
          ? {
              ...req,
              status: String(data.status ?? 'CANCELLED').toUpperCase() as TimeOffStatus,
              updatedAt: data.updated_at ?? req.updatedAt,
            }
          : req
      ),
    }));
    return { success: true };
  },

  getTimeOffForDate: (employeeId, date) =>
    get().timeOffRequests.find(
      (r) =>
        r.employeeId === employeeId &&
        r.status === 'APPROVED' &&
        date >= r.startDate &&
        date <= r.endDate
    ),

  hasApprovedTimeOff: (employeeId, date) =>
    get().timeOffRequests.some(
      (r) =>
        r.employeeId === employeeId &&
        r.status === 'APPROVED' &&
        date >= r.startDate &&
        date <= r.endDate
    ),

  submitBlockedDayRequest: async (request) => {
    const result = await apiFetch<{ request: Record<string, any> }>('/api/blocked-days/request', {
      method: 'POST',
      json: {
        organizationId: request.organizationId,
        startDate: request.startDate,
        endDate: request.endDate,
        reason: request.reason,
      },
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Failed to submit blocked day request' };
    }

    const row = result.data.request;
    const newRequest: BlockedDayRequest = {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id ?? undefined,
      scope: String(row.scope ?? 'EMPLOYEE').toUpperCase() === 'ORG_BLACKOUT' ? 'ORG_BLACKOUT' : 'EMPLOYEE',
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason ?? '',
      status: String(row.status ?? 'PENDING').toUpperCase() as BlockedDayStatus,
      managerNote: row.manager_note ?? undefined,
      requestedByAuthUserId: row.requested_by_auth_user_id ?? '',
      reviewedByAuthUserId: row.reviewed_by_auth_user_id ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? undefined,
    };

    set((state) => ({ blockedDayRequests: [...state.blockedDayRequests, newRequest] }));
    return { success: true };
  },

  reviewBlockedDayRequest: async (id, status, managerNote) => {
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
    const result = await apiFetch<{ request: Record<string, any> }>('/api/blocked-days/review', {
      method: 'POST',
      json: { id, organizationId, status, managerNote },
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Unable to update blocked day.' };
    }

    const data = result.data.request;
    set((state) => ({
      blockedDayRequests: state.blockedDayRequests.map((req) =>
        req.id === id
          ? {
              ...req,
              status: String(data.status ?? status).toUpperCase() as BlockedDayStatus,
              managerNote: data.manager_note ?? req.managerNote,
              reviewedByAuthUserId: data.reviewed_by_auth_user_id ?? req.reviewedByAuthUserId,
              reviewedAt: data.reviewed_at ?? req.reviewedAt,
              updatedAt: data.updated_at ?? req.updatedAt,
            }
          : req
      ),
    }));
    return { success: true };
  },

  cancelBlockedDayRequest: async (id) => {
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
    const result = await apiFetch<{ request: Record<string, any> }>('/api/blocked-days/cancel', {
      method: 'POST',
      json: { id, organizationId },
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Unable to cancel blocked day.' };
    }

    const data = result.data.request;
    set((state) => ({
      blockedDayRequests: state.blockedDayRequests.map((req) =>
        req.id === id
          ? {
              ...req,
              status: String(data.status ?? 'CANCELLED').toUpperCase() as BlockedDayStatus,
              updatedAt: data.updated_at ?? req.updatedAt,
            }
          : req
      ),
    }));
    return { success: true };
  },

  createImmediateBlockedDay: async (data) => {
    const result = await apiFetch<{ request: Record<string, any> }>('/api/blocked-days/create', {
      method: 'POST',
      json: data,
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Unable to create blocked day.' };
    }

    const row = result.data.request;
    const newRequest: BlockedDayRequest = {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id ?? undefined,
      scope: String(row.scope ?? 'EMPLOYEE').toUpperCase() === 'ORG_BLACKOUT' ? 'ORG_BLACKOUT' : 'EMPLOYEE',
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason ?? '',
      status: String(row.status ?? 'APPROVED').toUpperCase() as BlockedDayStatus,
      managerNote: row.manager_note ?? undefined,
      requestedByAuthUserId: row.requested_by_auth_user_id ?? '',
      reviewedByAuthUserId: row.reviewed_by_auth_user_id ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? undefined,
    };

    set((state) => ({ blockedDayRequests: [...state.blockedDayRequests, newRequest] }));
    return { success: true };
  },

  updateBlockedDay: async (data) => {
    const result = await apiFetch<{ request: Record<string, any> }>('/api/blocked-days/update', {
      method: 'POST',
      json: data,
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Unable to update blocked day.' };
    }

    const row = result.data.request;
    set((state) => ({
      blockedDayRequests: state.blockedDayRequests.map((req) =>
        req.id === data.id
          ? {
              ...req,
              scope: String(row.scope ?? req.scope).toUpperCase() === 'ORG_BLACKOUT' ? 'ORG_BLACKOUT' : 'EMPLOYEE',
              startDate: row.start_date ?? req.startDate,
              endDate: row.end_date ?? req.endDate,
              reason: row.reason ?? req.reason,
              status: String(row.status ?? req.status).toUpperCase() as BlockedDayStatus,
              managerNote: row.manager_note ?? req.managerNote,
              updatedAt: row.updated_at ?? req.updatedAt,
            }
          : req
      ),
    }));
    return { success: true };
  },

  deleteBlockedDay: async (id, organizationId) => {
    const result = await apiFetch('/api/blocked-days/delete', {
      method: 'POST',
      json: { id, organizationId },
    });

    if (!result.ok) {
      return { success: false, error: result.error ?? 'Unable to delete blocked day.' };
    }

    set((state) => ({
      blockedDayRequests: state.blockedDayRequests.filter((req) => req.id !== id),
    }));
    return { success: true };
  },

  createBlockedPeriod: async (employeeId, startDate, endDate, reason) => {
    const state = get();
    const currentUser = useAuthStore.getState().currentUser;
    const requesterRole = getUserRole(currentUser?.role);
    if (!isManagerRole(requesterRole)) {
      return { success: false, error: "You don't have permission to block out days." };
    }
    if (!reason || !reason.trim()) {
      return { success: false, error: 'Reason is required for blocked days.' };
    }
    const employee = state.employees.find((emp) => emp.id === employeeId);
    if (!employee?.restaurantId) {
      return { success: false, error: 'Restaurant not assigned for this employee' };
    }
    if (employee.userRole === 'ADMIN' && requesterRole === 'MANAGER') {
      return { success: false, error: 'Managers cannot block out admins.' };
    }

    return get().createImmediateBlockedDay({
      organizationId: employee.restaurantId,
      userId: employeeId,
      scope: 'EMPLOYEE',
      startDate,
      endDate,
      reason,
    });
  },

  deleteBlockedPeriod: async (blockId) => {
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
    return get().deleteBlockedDay(blockId, organizationId);
  },

  getBlockedRequestsForEmployee: (employeeId) =>
    get().blockedDayRequests.filter((req) => req.userId === employeeId),

  getOrgBlackoutDays: () =>
    get().blockedDayRequests.filter((req) => req.scope === 'ORG_BLACKOUT'),

  hasBlockedShiftOnDate: (employeeId, date) =>
    get().blockedDayRequests.some(
      (req) =>
        req.scope === 'EMPLOYEE' &&
        req.userId === employeeId &&
        req.status === 'APPROVED' &&
        date >= req.startDate &&
        date <= req.endDate
    ) || get().shifts.some((shift) => shift.employeeId === employeeId && shift.date === date && shift.isBlocked),

  hasOrgBlackoutOnDate: (date) =>
    get().blockedDayRequests.some(
      (req) =>
        req.scope === 'ORG_BLACKOUT' &&
        req.status === 'APPROVED' &&
        date >= req.startDate &&
        date <= req.endDate
    ),

  createDropRequest: (shiftId, employeeId) => {
    const state = get();
    const shift = state.shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    const newRequest: DropShiftRequest = {
      id: generateId('drop'),
      shiftId,
      fromEmployeeId: employeeId,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    const newRequests = [...state.dropRequests, newRequest];
    saveToStorage(STORAGE_KEYS.DROP_REQUESTS, newRequests);

    const employee = state.getEmployeeById(employeeId);
    const chatMessage: ChatMessage = {
      id: generateId('msg'),
      senderId: employeeId,
      createdAt: new Date().toISOString(),
      text: `${employee?.name || 'Someone'} is looking to drop their shift on ${shift.date} (${shift.startHour}:00 - ${shift.endHour}:00)`,
      type: 'drop_request',
      dropRequestId: newRequest.id,
    };

    const newMessages = [...state.chatMessages, chatMessage];
    saveToStorage(STORAGE_KEYS.CHAT_MESSAGES, newMessages);

    set({ dropRequests: newRequests, chatMessages: newMessages });
  },

  acceptDropRequest: async (requestId, acceptingEmployeeId) => {
    const state = get();
    const request = state.dropRequests.find((r) => r.id === requestId);
    if (!request || request.status !== 'open') {
      return { success: false, error: 'Request no longer available' };
    }

    const shift = state.shifts.find((s) => s.id === request.shiftId);
    if (!shift) {
      return { success: false, error: 'Shift not found' };
    }

    if (state.hasApprovedTimeOff(acceptingEmployeeId, shift.date)) {
      return { success: false, error: 'You have approved time off on this date' };
    }

    const existingShifts = state.shifts.filter(
      (s) => s.employeeId === acceptingEmployeeId && s.date === shift.date && s.id !== shift.id
    );

    for (const existing of existingShifts) {
      if (shiftsOverlap(shift.startHour, shift.endHour, existing.startHour, existing.endHour)) {
        return { success: false, error: 'You have a conflicting shift at this time' };
      }
    }

    const updateResult = await get().updateShift(shift.id, { employeeId: acceptingEmployeeId });
    if (!updateResult.success) {
      return updateResult;
    }

    const newRequests = state.dropRequests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status: 'accepted' as DropRequestStatus,
            acceptedByEmployeeId: acceptingEmployeeId,
            acceptedAt: new Date().toISOString(),
          }
        : r
    );

    saveToStorage(STORAGE_KEYS.DROP_REQUESTS, newRequests);

    const acceptor = state.getEmployeeById(acceptingEmployeeId);
    const original = state.getEmployeeById(request.fromEmployeeId);
    const chatMessage: ChatMessage = {
      id: generateId('msg'),
      senderId: 'system',
      createdAt: new Date().toISOString(),
      text: `OK ${acceptor?.name} accepted ${original?.name}'s shift on ${shift.date}`,
      type: 'system',
    };

    const newMessages = [...state.chatMessages, chatMessage];
    saveToStorage(STORAGE_KEYS.CHAT_MESSAGES, newMessages);

    set({ dropRequests: newRequests, chatMessages: newMessages });
    return { success: true };
  },

  cancelDropRequest: (requestId) => set((state) => {
    const newRequests = state.dropRequests.map((r) =>
      r.id === requestId ? { ...r, status: 'cancelled' as DropRequestStatus } : r
    );
    saveToStorage(STORAGE_KEYS.DROP_REQUESTS, newRequests);
    return { dropRequests: newRequests };
  }),

  sendChatMessage: (senderId, text, type = 'message', dropRequestId) => set((state) => {
    const newMessage: ChatMessage = {
      id: generateId('msg'),
      senderId,
      createdAt: new Date().toISOString(),
      text,
      type,
      dropRequestId,
    };
    const newMessages = [...state.chatMessages, newMessage];
    saveToStorage(STORAGE_KEYS.CHAT_MESSAGES, newMessages);
    return { chatMessages: newMessages };
  }),

  goToToday: () => set((state) => ({
    selectedDate: new Date(),
    dateNavDirection: null,
    dateNavKey: state.dateNavKey + 1,
  })),

  goToPrevious: () => set((state) => {
    const newDate = new Date(state.selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    return {
      selectedDate: newDate,
      dateNavDirection: 'prev',
      dateNavKey: state.dateNavKey + 1,
    };
  }),

  goToNext: () => set((state) => {
    const newDate = new Date(state.selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    return {
      selectedDate: newDate,
      dateNavDirection: 'next',
      dateNavKey: state.dateNavKey + 1,
    };
  }),

  getFilteredEmployeesForRestaurant: (restaurantId) => {
    const state = get();
    if (!restaurantId) return [];

    // When workingTodayOnly is enabled, compute working employee IDs for the selected date
    let effectiveSelectedIds = state.selectedEmployeeIds;
    if (state.workingTodayOnly) {
      const dateString = toLocalDateString(state.selectedDate);
      const workingIds = new Set<string>();
      for (const shift of state.shifts) {
        if (shift.date === dateString && !shift.isBlocked) {
          workingIds.add(shift.employeeId);
        }
      }
      // Intersection of selectedEmployeeIds and workingIds
      effectiveSelectedIds = state.selectedEmployeeIds.filter((id) => workingIds.has(id));
    }

    return state.employees.filter(
      (e) =>
        e.restaurantId === restaurantId &&
        state.selectedSections.includes(e.section) &&
        effectiveSelectedIds.includes(e.id)
    );
  },

  getEmployeesForRestaurant: (restaurantId) => {
    const state = get();
    if (!restaurantId) return [];
    return state.employees.filter((e) => e.restaurantId === restaurantId);
  },

  getShiftsForRestaurant: (restaurantId) => {
    const state = get();
    if (!restaurantId) return [];
    return state.shifts.filter((s) => s.restaurantId === restaurantId);
  },

  getPendingTimeOffRequests: () => get().timeOffRequests.filter((r) => r.status === 'PENDING'),
  getOpenDropRequests: () => get().dropRequests.filter((r) => r.status === 'open'),

  getEffectiveHourRange: (dayOfWeek?: number) => {
    const state = get();
    const settings = state.scheduleViewSettings;

    // Default to full 24 hours if no settings
    if (!settings) {
      return { startHour: 0, endHour: 24 };
    }

    switch (settings.hourMode) {
      case 'business': {
        // Find business hours for the given day or use a reasonable default
        const day = dayOfWeek ?? new Date().getDay();
        const hoursRow = state.businessHours.find((h) => h.dayOfWeek === day && h.enabled);
        if (hoursRow?.openTime && hoursRow?.closeTime) {
          const openHour = parseTimeToDecimal(hoursRow.openTime);
          const closeHour = parseTimeToDecimal(hoursRow.closeTime);
          if (closeHour > openHour) {
            // Add padding of 1 hour before and after
            return {
              startHour: Math.max(0, Math.floor(openHour) - 1),
              endHour: Math.min(24, Math.ceil(closeHour) + 1),
            };
          }
        }
        // Fallback if no valid business hours for that day
        // Find any enabled business hours to use as a guide
        const anyHours = state.businessHours.find((h) => h.enabled && h.openTime && h.closeTime);
        if (anyHours?.openTime && anyHours?.closeTime) {
          const openHour = parseTimeToDecimal(anyHours.openTime);
          const closeHour = parseTimeToDecimal(anyHours.closeTime);
          if (closeHour > openHour) {
            return {
              startHour: Math.max(0, Math.floor(openHour) - 1),
              endHour: Math.min(24, Math.ceil(closeHour) + 1),
            };
          }
        }
        // Final fallback: typical restaurant hours
        return { startHour: 6, endHour: 24 };
      }
      case 'custom':
        return {
          startHour: Math.max(0, Math.min(23, settings.customStartHour)),
          endHour: Math.max(1, Math.min(24, settings.customEndHour)),
        };
      case 'full24':
      default:
        return { startHour: 0, endHour: 24 };
    }
  },

  setScheduleViewSettings: (settings) => set({ scheduleViewSettings: settings }),
}));
