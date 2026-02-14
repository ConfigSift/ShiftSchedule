'use client';

import { create } from 'zustand';
import {
  Employee,
  Shift,
  TimeOffRequest,
  BlockedDayRequest,
  BlockedDayStatus,
  BusinessHour,
  CoreHour,
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
import { generateId, shiftsOverlap, timeRangesOverlap, getWeekStart, getWeekRange } from '../utils/timeUtils';
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

function toDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEBUG_SHIFT_SAVE = false;

function clampForEditShift(startHour: number, endHour: number) {
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

type UnknownRow = Record<string, unknown>;

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  return typeof value === 'string' ? value : String(value);
}

function readNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : String(value);
}

function readNumber(value: unknown, fallback = 0): number {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : fallback;
}

function toShiftRow(row: UnknownRow, fallbackRestaurantId?: string): Shift {
  return {
    id: readString(row.id),
    employeeId: readString(row.user_id),
    restaurantId: readString(row.organization_id, fallbackRestaurantId ?? ''),
    date: readString(row.shift_date),
    startHour: parseTimeToDecimal(readNullableString(row.start_time)),
    endHour: parseTimeToDecimal(readNullableString(row.end_time)),
    notes: readOptionalString(row.notes),
    isBlocked: Boolean(row.is_blocked),
    job: isValidJob(row.job) ? row.job : undefined,
    locationId: readNullableString(row.location_id),
    payRate: row.pay_rate != null ? readNumber(row.pay_rate) : undefined,
    paySource: readOptionalString(row.pay_source),
    scheduleState: row.schedule_state === 'draft' ? 'draft' : 'published',
  };
}

function toTimeOffRow(row: UnknownRow): TimeOffRequest {
  return {
    id: readString(row.id),
    employeeId: readString(
      row.user_id
      ?? row.requester_auth_user_id
      ?? row.auth_user_id
      ?? row.requester_user_id
      ?? '',
    ),
    organizationId: readOptionalString(row.organization_id),
    startDate: readString(row.start_date),
    endDate: readString(row.end_date),
    reason: readOptionalString(row.reason ?? row.note),
    status: readString(row.status, 'PENDING').toUpperCase() as TimeOffStatus,
    createdAt: readString(row.created_at, new Date().toISOString()),
    updatedAt: readOptionalString(row.updated_at),
    reviewedBy: readOptionalString(row.reviewed_by),
    reviewedAt: readOptionalString(row.reviewed_at),
    managerNote: readOptionalString(row.manager_note),
  };
}

function toBlockedDayRow(row: UnknownRow): BlockedDayRequest {
  return {
    id: readString(row.id),
    organizationId: readString(row.organization_id),
    userId: readOptionalString(row.user_id),
    scope: readString(row.scope, 'EMPLOYEE').toUpperCase() === 'ORG_BLACKOUT' ? 'ORG_BLACKOUT' : 'EMPLOYEE',
    startDate: readString(row.start_date),
    endDate: readString(row.end_date),
    reason: readString(row.reason),
    status: readString(row.status, 'PENDING').toUpperCase() as BlockedDayStatus,
    managerNote: readOptionalString(row.manager_note),
    requestedByAuthUserId: readString(row.requested_by_auth_user_id),
    reviewedByAuthUserId: readOptionalString(row.reviewed_by_auth_user_id),
    reviewedAt: readOptionalString(row.reviewed_at),
    createdAt: readString(row.created_at, new Date().toISOString()),
    updatedAt: readOptionalString(row.updated_at),
  };
}

function toBusinessHourRow(row: UnknownRow): BusinessHour {
  return {
    id: readString(row.id),
    organizationId: readString(row.organization_id),
    dayOfWeek: readNumber(row.day_of_week),
    openTime: readOptionalString(row.open_time),
    closeTime: readOptionalString(row.close_time),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order != null ? readNumber(row.sort_order) : undefined,
  };
}

function toCoreHourRow(row: UnknownRow): CoreHour {
  return {
    id: readString(row.id),
    organizationId: readString(row.organization_id),
    dayOfWeek: readNumber(row.day_of_week),
    openTime: readOptionalString(row.open_time),
    closeTime: readOptionalString(row.close_time),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order != null ? readNumber(row.sort_order) : undefined,
  };
}

// Convert Date to YYYY-MM-DD string using LOCAL timezone (not UTC)
// This ensures consistent date comparison with shift_date values
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPastDate(dateStr: string): boolean {
  return dateStr < toLocalDateString(new Date());
}

function buildWorkingTodayKey(restaurantId: string | null, date: Date): string {
  return `${restaurantId ?? 'none'}:${toLocalDateString(date)}`;
}

function normalizeShiftNotes(notes?: string | null): string {
  if (!notes) return '';
  return String(notes).trim();
}

function buildShiftOverlayKey(shift: Shift): string {
  return [
    shift.restaurantId ?? '',
    shift.employeeId,
    shift.date,
    formatTimeFromDecimal(shift.startHour),
    formatTimeFromDecimal(shift.endHour),
    shift.job ?? '',
    normalizeShiftNotes(shift.notes),
  ].join('|');
}

function getEffectiveRole(
  restaurantId: string | null,
  accessibleRestaurants: Array<{ id: string; role: string }>,
  fallbackRole: unknown
): 'ADMIN' | 'MANAGER' | 'EMPLOYEE' {
  const matched = restaurantId
    ? accessibleRestaurants.find((restaurant) => restaurant.id === restaurantId)
    : undefined;
  const role = getUserRole(matched?.role ?? fallbackRole);
  return role === 'ADMIN' || role === 'MANAGER' ? role : 'EMPLOYEE';
}

type ViewMode = 'day' | 'week' | 'month';
type ScheduleMode = 'published' | 'draft';
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
  | 'reports'
  | null;

interface ScheduleState {
  employees: Employee[];
  shifts: Shift[];
  timeOffRequests: TimeOffRequest[];
  blockedDayRequests: BlockedDayRequest[];
  businessHours: BusinessHour[];
  coreHours: CoreHour[];
  scheduleViewSettings: ScheduleViewSettings | null;
  locations: Location[];
  dropRequests: DropShiftRequest[];
  chatMessages: ChatMessage[];

  selectedDate: Date;
  viewMode: ViewMode;
  continuousDays: boolean;
  scheduleMode: ScheduleMode;
  selectedSections: string[];
  selectedEmployeeIds: string[];
  workingTodayOnly: boolean;
  hoveredShiftId: string | null;
  lastAppliedWorkingTodayKey: string | null;

  modalType: ModalType;
  modalData: unknown;

  toast: { message: string; type: 'success' | 'error' } | null;
  isHydrated: boolean;
  shiftLoadCounts: { total: number; visible: number };
  dateNavDirection: 'prev' | 'next' | null;
  dateNavKey: number;

  hydrate: () => void;
  loadRestaurantData: (restaurantId: string | null) => Promise<void>;
  loadCoreHours: (restaurantId: string | null) => Promise<void>;
  saveCoreHours: (payload: {
    organizationId: string;
    hours: Array<{ dayOfWeek: number; openTime?: string | null; closeTime?: string | null; enabled: boolean }>;
  }) => Promise<{ success: boolean; error?: string }>;
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  setContinuousDays: (enabled: boolean) => void;
  setScheduleMode: (mode: ScheduleMode) => void;
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

  openModal: (type: ModalType, data?: unknown) => void;
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
  publishWeekDraft: (payload: {
    organizationId: string;
    weekStartDate: string;
    weekEndDate: string;
  }) => Promise<{ success: boolean; error?: string; deletedPublished?: number; promotedDrafts?: number; dedupedDrafts?: number }>;
  publishDraftRange: (payload: {
    startDate: string;
    endDate: string;
  }) => Promise<{ success: boolean; error?: string; publishedCount?: number; deletedCount?: number }>;
  seedDraftWeekFromPublished: (payload: {
    organizationId: string;
    weekStartDate: string;
    weekEndDate: string;
  }) => Promise<{
    seeded: boolean;
    insertedCount: number;
    skippedCount: number;
    sourceCount: number;
    error?: string;
  }>;
  copyPreviousDayIntoDraft: (selectedDate: Date) => Promise<{
    success: boolean;
    insertedCount?: number;
    skippedCount?: number;
    sourceCount?: number;
    error?: string;
  }>;

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
  getPendingBlockedDayRequests: () => BlockedDayRequest[];
  getOpenDropRequests: () => DropShiftRequest[];

  getEffectiveHourRange: (dayOfWeek?: number) => { startHour: number; endHour: number };
  setScheduleViewSettings: (settings: ScheduleViewSettings | null) => void;
}

async function ensureDraftWeekSeeded(
  getState: () => ScheduleState,
  organizationId: string,
  targetDate: string | Date
): Promise<{ ok: boolean; error?: string }> {
  const state = getState();
  if (state.scheduleMode !== 'draft') {
    return { ok: true };
  }
  if (!organizationId) {
    return { ok: true };
  }
  const weekStartDay = state.scheduleViewSettings?.weekStartDay ?? 'sunday';
  const baseDate =
    targetDate instanceof Date ? targetDate : new Date(`${String(targetDate)}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    return { ok: true };
  }
  const { start, end } = getWeekRange(baseDate, weekStartDay);
  const seedResult = await state.seedDraftWeekFromPublished({
    organizationId,
    weekStartDate: toDateYMD(start),
    weekEndDate: toDateYMD(end),
  });
  if (seedResult.error) {
    return { ok: false, error: seedResult.error };
  }
  return { ok: true };
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  employees: [],
  shifts: [],
  timeOffRequests: [],
  blockedDayRequests: [],
  businessHours: [],
  coreHours: [],
  scheduleViewSettings: null,
  locations: [],
  dropRequests: [],
  chatMessages: [],

  selectedDate: new Date(),
  viewMode: 'day',
  continuousDays: false,
  scheduleMode: 'published',
  selectedSections: ['kitchen', 'front', 'bar', 'management'],
  selectedEmployeeIds: [],
  workingTodayOnly: true,
  hoveredShiftId: null,
  lastAppliedWorkingTodayKey: null,

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
      coreHours: [],
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
        lastAppliedWorkingTodayKey: null,
        timeOffRequests: [],
        blockedDayRequests: [],
        businessHours: [],
        coreHours: [],
        scheduleViewSettings: null,
        locations: [],
        shiftLoadCounts: { total: 0, visible: 0 },
      });
      return;
    }

    const authState = useAuthStore.getState();
    const currentUser = authState.currentUser;
    const currentRole = getEffectiveRole(
      restaurantId,
      authState.accessibleRestaurants,
      currentUser?.role
    );

    const { data: userData, error: userError } = (await supabase
      .from('users')
      .select('*')
      .eq('organization_id', restaurantId)) as {
      data: Array<Record<string, unknown>> | null;
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
        coreHours: [],
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
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      };

    const locations: Location[] = locationError
      ? []
      : (locationData || []).map((row) => ({
          id: readString(row.id),
          organizationId: readString(row.organization_id),
          name: readString(row.name),
          sortOrder: readNumber(row.sort_order),
          createdAt: readString(row.created_at, new Date().toISOString()),
        }));

    let shiftQuery = supabase
      .from('shifts')
      .select('*')
      .eq('organization_id', restaurantId);

    if (currentRole === 'EMPLOYEE') {
      shiftQuery = shiftQuery.eq('schedule_state', 'published');
    } else {
      shiftQuery = shiftQuery.in('schedule_state', ['draft', 'published']);
    }

    const { data: shiftData, error: shiftError } = (await shiftQuery) as {
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    };

    if (shiftError) {
      set({
        employees,
        shifts: [],
        selectedEmployeeIds: [],
        lastAppliedWorkingTodayKey: buildWorkingTodayKey(restaurantId, get().selectedDate),
        timeOffRequests: [],
        blockedDayRequests: [],
        businessHours: [],
        coreHours: [],
        scheduleViewSettings: null,
        locations,
        shiftLoadCounts: { total: 0, visible: 0 },
      });
      return;
    }

    const shifts: Shift[] = (shiftData || []).map((row) => toShiftRow(row, restaurantId ?? undefined));

    let timeOffData: Array<Record<string, unknown>> | null = null;
    let timeOffError: { message: string } | null = null;

    const baseTimeOffQuery = supabase
      .from('time_off_requests')
      .select('*')
      .eq('organization_id', restaurantId);

    if (currentRole === 'EMPLOYEE' && currentUser?.authUserId) {
      const primaryQuery = baseTimeOffQuery.eq('requester_auth_user_id', currentUser.authUserId);
      const primaryResult = (await primaryQuery) as {
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      };
      if (!primaryResult.error) {
        timeOffData = primaryResult.data;
      } else if (primaryResult.error.message?.toLowerCase().includes('requester_auth_user_id')) {
        const fallbackQuery = baseTimeOffQuery.eq('auth_user_id', currentUser.authUserId);
        const fallbackResult = (await fallbackQuery) as {
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        };
        if (!fallbackResult.error) {
          timeOffData = fallbackResult.data;
        } else if (fallbackResult.error.message?.toLowerCase().includes('auth_user_id')) {
          const secondFallbackQuery = baseTimeOffQuery.eq('requester_user_id', currentUser.authUserId);
          const secondFallbackResult = (await secondFallbackQuery) as {
            data: Array<Record<string, unknown>> | null;
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
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      };
      timeOffData = result.data;
      timeOffError = result.error;
    }

    const timeOffRequests: TimeOffRequest[] = timeOffError
      ? []
      : (timeOffData || []).map(toTimeOffRow);

    const blockedQuery = supabase
      .from('blocked_day_requests')
      .select('*')
      .eq('organization_id', restaurantId);

    let blockedData: Array<Record<string, unknown>> | null = null;
    let blockedError: { message: string } | null = null;
    if (currentRole === 'EMPLOYEE' && currentUser?.authUserId) {
      const [ownResult, blackoutResult] = await Promise.all([
        blockedQuery.eq('requested_by_auth_user_id', currentUser.authUserId),
        supabase
          .from('blocked_day_requests')
          .select('*')
          .eq('organization_id', restaurantId)
          .eq('scope', 'ORG_BLACKOUT')
          .eq('status', 'APPROVED'),
      ]);
      const ownData = ownResult.data as Array<Record<string, unknown>> | null;
      const blackoutData = blackoutResult.data as Array<Record<string, unknown>> | null;
      blockedData = [...(ownData || []), ...(blackoutData || [])];
      blockedError = ownResult.error ?? blackoutResult.error;
    } else {
      const result = await blockedQuery;
      blockedData = result.data as Array<Record<string, unknown>> | null;
      blockedError = result.error as { message: string } | null;
    }

    const blockedDayRequests: BlockedDayRequest[] = blockedError
      ? []
      : (blockedData || []).map(toBlockedDayRow);

    const { data: businessData, error: businessError } = (await supabase
      .from('business_hour_ranges')
      .select('*')
      .eq('organization_id', restaurantId)) as {
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      };

    const businessHours: BusinessHour[] = businessError
      ? []
      : (businessData || [])
          .map(toBusinessHourRow)
          .sort((a, b) =>
            a.dayOfWeek === b.dayOfWeek
              ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
              : a.dayOfWeek - b.dayOfWeek
          );

    const { data: coreData, error: coreError } = (await supabase
      .from('core_hour_ranges')
      .select('*')
      .eq('organization_id', restaurantId)) as {
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      };

    const coreHours: CoreHour[] = coreError
      ? []
      : (coreData || [])
          .map(toCoreHourRow)
          .sort((a, b) =>
            a.dayOfWeek === b.dayOfWeek
              ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
              : a.dayOfWeek - b.dayOfWeek
          );

    // Load schedule view settings
    const { data: settingsData, error: settingsError } = (await supabase
      .from('schedule_view_settings')
      .select('*')
      .eq('organization_id', restaurantId)
      .maybeSingle()) as {
        data: Record<string, unknown> | null;
        error: { message: string } | null;
      };

    const scheduleViewSettings: ScheduleViewSettings | null = settingsError || !settingsData
      ? null
      : {
          id: readString(settingsData.id),
          organizationId: readString(settingsData.organization_id),
          hourMode: (settingsData.hour_mode ?? 'full24') as ScheduleHourMode,
          customStartHour: Number(settingsData.custom_start_hour ?? 0),
          customEndHour: Number(settingsData.custom_end_hour ?? 24),
          weekStartDay: (settingsData.week_start_day ?? 'sunday') === 'monday' ? 'monday' : 'sunday',
        };

    const selectedDate = get().selectedDate;
    const workingTodayKey = buildWorkingTodayKey(restaurantId, selectedDate);
    const workingIdsForDate = shifts
      .filter((shift) => shift.date === toLocalDateString(selectedDate) && !shift.isBlocked)
      .map((shift) => shift.employeeId);

    set({
      employees,
      shifts,
      selectedEmployeeIds: get().workingTodayOnly ? workingIdsForDate : employees.map((e) => e.id),
      lastAppliedWorkingTodayKey: get().workingTodayOnly ? workingTodayKey : null,
      timeOffRequests,
      blockedDayRequests,
      businessHours,
      coreHours,
      scheduleViewSettings,
      locations,
      shiftLoadCounts: {
        total: shiftData?.length ?? 0,
        visible: shifts.length,
      },
    });
  },
  loadCoreHours: async (restaurantId) => {
    if (!restaurantId) {
      set({ coreHours: [] });
      return;
    }
    const { data, error } = (await supabase
      .from('core_hour_ranges')
      .select('*')
      .eq('organization_id', restaurantId)) as {
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      };
    if (error) {
      set({ coreHours: [] });
      return;
    }
    const coreHours: CoreHour[] = (data || [])
      .map(toCoreHourRow)
      .sort((a, b) =>
        a.dayOfWeek === b.dayOfWeek
          ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
          : a.dayOfWeek - b.dayOfWeek
      );
    set({ coreHours });
  },
  saveCoreHours: async (payload) => {
    if (!payload.organizationId) {
      return { success: false, error: 'organizationId is required.' };
    }
    const result = await apiFetch('/api/core-hours/save', {
      method: 'POST',
      json: payload,
    });
    if (!result.ok) {
      return { success: false, error: result.error ?? 'Unable to save core hours.' };
    }
    await get().loadCoreHours(payload.organizationId);
    return { success: true };
  },

  setSelectedDate: (date) => set((state) => {
    if (!state.workingTodayOnly) {
      return { selectedDate: date };
    }
    const restaurantId = useAuthStore.getState().activeRestaurantId ?? null;
    const nextKey = buildWorkingTodayKey(restaurantId, date);
    if (state.lastAppliedWorkingTodayKey === nextKey) {
      return { selectedDate: date };
    }
    const workingIds = get().getWorkingEmployeeIdsForDate(date);
    return {
      selectedDate: date,
      selectedEmployeeIds: workingIds,
      lastAppliedWorkingTodayKey: nextKey,
    };
  }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setContinuousDays: (enabled) => set({ continuousDays: enabled }),
  setScheduleMode: (mode) => set({ scheduleMode: mode }),

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
    const eligibleEmployees = state.employees
      .filter((e) => e.restaurantId === restaurantId && e.isActive)
      .map((e) => e.id);
    return { selectedEmployeeIds: eligibleEmployees };
  }),

  deselectAllEmployees: () => set({ selectedEmployeeIds: [] }),

  toggleWorkingTodayOnly: () => set((state) => {
    const next = !state.workingTodayOnly;
    if (!next) {
      return { workingTodayOnly: next };
    }
    const workingIds = get().getWorkingEmployeeIdsForDate(state.selectedDate);
    const restaurantId = useAuthStore.getState().activeRestaurantId ?? null;
    const nextKey = buildWorkingTodayKey(restaurantId, state.selectedDate);
    return {
      workingTodayOnly: next,
      selectedEmployeeIds: workingIds,
      lastAppliedWorkingTodayKey: nextKey,
    };
  }),

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
      let state = get();
      const currentUser = useAuthStore.getState().currentUser;
      if (!isManagerRole(currentUser?.role)) {
        return { success: false, error: "You don't have permission to modify shifts." };
      }
      const restaurantId = shift.restaurantId;
      if (!restaurantId) {
        return { success: false, error: 'Restaurant not assigned for this shift' };
      }
      const rawShiftDate = shift.date as unknown;
      const shiftDateValue =
        typeof rawShiftDate === 'object' && rawShiftDate instanceof Date
          ? toLocalDateString(rawShiftDate)
          : String(shift.date || toDateYMD(state.selectedDate)).trim();
      if (isPastDate(shiftDateValue)) {
        return { success: false, error: "Past schedules can't be edited." };
      }
      const seedResult = await ensureDraftWeekSeeded(get, restaurantId, shiftDateValue);
      if (!seedResult.ok) {
        return { success: false, error: seedResult.error ?? 'Unable to prepare draft week' };
      }
      state = get();

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
      if (timeRangesOverlap(shift.startHour, shift.endHour, existing.startHour, existing.endHour)) {
        return { success: false, error: 'Shift overlaps with existing shift' };
      }
    }

    const safeJob = shift.job;
    const shiftDate = shiftDateValue;
    const shouldDraft = state.scheduleMode === 'draft' || isManagerRole(currentUser?.role);
    const nextScheduleState = shouldDraft ? 'draft' : 'published';

    const result = await apiFetch<{ shift: Record<string, unknown> }>('/api/shifts', {
      method: 'POST',
      json: {
        organizationId: restaurantId,
        employeeId: shift.employeeId,
        date: shiftDate,
        startHour: shift.startHour,
        endHour: shift.endHour,
        notes: shift.notes ?? null,
        job: safeJob,
        locationId: shift.locationId ?? null,
        scheduleState: nextScheduleState,
      },
    });

    if (!result.ok || !result.data?.shift) {
      return { success: false, error: result.error ?? 'Failed to add shift' };
    }

    const newShift = toShiftRow(result.data.shift, restaurantId);

    set({ shifts: [...state.shifts, newShift] });
    return { success: true };
  },

    updateShift: async (id, updates, options) => {
      let state = get();
      const currentUser = useAuthStore.getState().currentUser;
      if (!isManagerRole(currentUser?.role)) {
        return { success: false, error: "You don't have permission to modify shifts." };
      }
      let shift = state.shifts.find((s) => s.id === id);
      if (!shift) return { success: false, error: 'Shift not found' };
      if (isPastDate(shift.date)) {
        return { success: false, error: "Past schedules can't be edited." };
      }
      const targetDate = updates.date ?? shift.date;
      const targetDateUnknown = targetDate as unknown;
      const targetDateValue =
        typeof targetDateUnknown === 'object' && targetDateUnknown instanceof Date
          ? toLocalDateString(targetDateUnknown)
          : String(targetDate).trim();
      if (isPastDate(targetDateValue)) {
        return { success: false, error: "Past schedules can't be edited." };
      }
      const targetRestaurantId = updates.restaurantId ?? shift.restaurantId;
      const seedResult = await ensureDraftWeekSeeded(get, targetRestaurantId, targetDate);
      if (!seedResult.ok) {
        return { success: false, error: seedResult.error ?? 'Unable to prepare draft week' };
      }
      state = get();
      shift = state.shifts.find((s) => s.id === id);
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

    const excludeId = String(id);
    const existingShifts = state.shifts.filter(
      (s) =>
        s.id !== id &&
        s.employeeId === updatedShift.employeeId &&
        s.date === updatedShift.date &&
        !s.isBlocked
    );

    for (const existing of existingShifts) {
      if (
        timeRangesOverlap(updatedShift.startHour, updatedShift.endHour, existing.startHour, existing.endHour, {
          excludeId,
          compareId: String(existing.id),
        })
      ) {
        return { success: false, error: 'Shift overlaps with existing shift' };
      }
    }

    if (!isValidJob(updatedShift.job)) {
      return { success: false, error: 'Job is required for this shift' };
    }
    const safeJob = updatedShift.job;
    const nextScheduleState = shift.scheduleState === 'published' ? 'draft' : shift.scheduleState;
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

    const result = await apiFetch<{ shift: Record<string, unknown> }>('/api/shifts', {
      method: 'POST',
      json: {
        id,
        organizationId: updatedShift.restaurantId,
        employeeId: updatedShift.employeeId,
        date: updatedShift.date,
        startHour: updatedShift.startHour,
        endHour: updatedShift.endHour,
        notes: updatedShift.notes ?? null,
        job: safeJob,
        locationId: updatedShift.locationId ?? null,
        scheduleState: nextScheduleState,
      },
    });

    if (!result.ok || !result.data?.shift) {
      return { success: false, error: result.error ?? 'Failed to update shift' };
    }

    const updatedRow = result.data.shift;

    if (DEBUG_SHIFT_SAVE) {
      console.log('SHIFT_SAVE', {
        stage: 'response',
        updateId,
        row: updatedRow ?? null,
      });
    }

    // Build shift from DB response to get accurate pay_rate/pay_source from trigger
    const finalShift = toShiftRow(updatedRow, updatedShift.restaurantId);

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
      let state = get();
      const currentUser = useAuthStore.getState().currentUser;
      if (!isManagerRole(currentUser?.role)) {
        return { success: false, error: "You don't have permission to modify shifts." };
      }

      let shift = state.shifts.find((s) => s.id === id);
      if (!shift) {
        return { success: false, error: 'Shift not found' };
      }
      if (isPastDate(shift.date)) {
        return { success: false, error: "Past schedules can't be edited." };
      }

      const warnBlockedDelete = (targetShift: Shift) => {
        if (process.env.NODE_ENV !== 'production') {
           
          console.warn('[shift-delete] blocked-day creation prevented', {
            employeeId: targetShift.employeeId,
            date: targetShift.date,
          });
        }
      };

      if (state.scheduleMode === 'draft') {
        const seedResult = await ensureDraftWeekSeeded(get, shift.restaurantId, shift.date);
        if (!seedResult.ok) {
          return { success: false, error: seedResult.error ?? 'Unable to prepare draft week' };
        }
        state = get();
        shift = state.shifts.find((s) => s.id === id);
        if (!shift) {
          return { success: false, error: 'Shift not found' };
        }
        const buildKey = (s: Shift) =>
          [
            s.employeeId,
            s.date,
            s.startHour.toFixed(4),
            s.endHour.toFixed(4),
            s.job ?? '',
            s.notes ?? '',
            s.locationId ?? '',
          ].join('|');

        const targetKey = buildKey(shift);
        const existingDraft = state.shifts.find(
          (s) => s.scheduleState === 'draft' && buildKey(s) === targetKey
        );
        const shiftForDelete = shift;

        const markDraftBlocked = async (draftId: string) => {
          warnBlockedDelete(shiftForDelete);
          const { error: updateError } = await supabase
            .from('shifts')
            .update({ is_blocked: true })
            .eq('id', draftId);

          if (updateError) {
            return { success: false, error: updateError.message };
          }

          set({
            shifts: state.shifts.map((s) =>
              s.id === draftId ? { ...s, isBlocked: true, scheduleState: 'draft' } : s
            ),
          });
          return { success: true };
        };

        if (shift.scheduleState === 'draft') {
          return markDraftBlocked(shift.id);
        }

        if (existingDraft) {
          return markDraftBlocked(existingDraft.id);
        }

        warnBlockedDelete(shift);
        const { data: insertedRow, error: insertError } = await supabase
          .from('shifts')
          .insert({
            organization_id: shift.restaurantId,
            user_id: shift.employeeId,
            shift_date: shift.date,
            start_time: formatTimeFromDecimal(shift.startHour),
            end_time: formatTimeFromDecimal(shift.endHour),
            notes: shift.notes ?? null,
            is_blocked: true,
            schedule_state: 'draft',
            job: shift.job ?? null,
            location_id: shift.locationId ?? null,
          })
          .select('*')
          .single();

        if (insertError || !insertedRow) {
          return { success: false, error: insertError?.message ?? 'Failed to remove shift' };
        }

        const newShift = toShiftRow(insertedRow, shift.restaurantId);

        set({ shifts: [...state.shifts, newShift] });
        return { success: true };
      }

      const { error } = await supabase.from('shifts').delete().eq('id', id);
      if (error) {
        return { success: false, error: error.message };
      }
      set({ shifts: state.shifts.filter((s) => s.id !== id) });
      return { success: true };
    },

  publishWeekDraft: async ({ organizationId, weekStartDate, weekEndDate }) => {
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { success: false, error: "You don't have permission to publish schedules." };
    }
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
      const { data: draftRows, error: draftError } = await supabase
        .from('shifts')
        .select('id,user_id,shift_date,start_time,end_time,job,notes,is_blocked')
        .eq('organization_id', organizationId)
        .eq('schedule_state', 'draft')
        .gte('shift_date', weekStartDate)
        .lte('shift_date', weekEndDate);

      if (draftError) {
        return { success: false, error: draftError.message };
      }
      if (!draftRows || draftRows.length === 0) {
        return { success: false, error: 'No draft shifts to publish for this week.' };
      }

    const activeDraftRows = (draftRows ?? []).filter((row: Record<string, unknown>) => !row.is_blocked);
    const blockedDraftRows = (draftRows ?? []).filter((row: Record<string, unknown>) => row.is_blocked);

    if (blockedDraftRows.length > 0 && process.env.NODE_ENV !== 'production') {
      blockedDraftRows.forEach((row: Record<string, unknown>) => {
         
        console.warn('[publish-week] blocked-day creation prevented', {
          employeeId: row.user_id ?? 'unknown',
          date: row.shift_date ?? 'unknown',
        });
      });
    }

    const seen = new Set<string>();
    const dupIds: string[] = [];
    (activeDraftRows ?? []).forEach((row: Record<string, unknown>) => {
      const key = [
        row.user_id ?? '',
        row.shift_date ?? '',
        row.start_time ?? '',
        row.end_time ?? '',
        row.job ?? '',
        row.notes ?? '',
      ].join('|');
      if (seen.has(key)) {
        dupIds.push(readString(row.id));
      } else {
        seen.add(key);
      }
    });

    if (dupIds.length > 0) {
      const { error: dedupeError } = await supabase
        .from('shifts')
        .delete()
        .in('id', dupIds);
      if (dedupeError) {
        return { success: false, error: dedupeError.message };
      }
    }

    if (blockedDraftRows.length > 0) {
      const blockedIds = blockedDraftRows
        .map((row: Record<string, unknown>) => readString(row.id))
        .filter(Boolean);
      if (blockedIds.length > 0) {
        const { error: blockedDeleteError } = await supabase
          .from('shifts')
          .delete()
          .in('id', blockedIds);
        if (blockedDeleteError) {
          return { success: false, error: blockedDeleteError.message };
        }
      }
    }

    const { data: deletedRows, error: deletePublishedError } = await supabase
      .from('shifts')
      .delete()
      .eq('organization_id', organizationId)
      .eq('schedule_state', 'published')
      .gte('shift_date', weekStartDate)
      .lte('shift_date', weekEndDate)
      .select('id');

    if (deletePublishedError) {
      return { success: false, error: deletePublishedError.message };
    }

    const { data: promotedRows, error: promoteError } = await supabase
      .from('shifts')
      .update({ schedule_state: 'published' })
      .eq('organization_id', organizationId)
      .eq('schedule_state', 'draft')
      .eq('is_blocked', false)
      .gte('shift_date', weekStartDate)
      .lte('shift_date', weekEndDate)
      .select('id');

    if (promoteError) {
      return { success: false, error: promoteError.message };
    }

    await get().loadRestaurantData(organizationId);
    return {
      success: true,
      deletedPublished: deletedRows?.length ?? 0,
      promotedDrafts: promotedRows?.length ?? 0,
      dedupedDrafts: dupIds.length,
    };
  },

  publishDraftRange: async ({ startDate, endDate }) => {
    const authState = useAuthStore.getState();
    const organizationId = authState.activeRestaurantId;
    if (!organizationId) {
      get().showToast('Select a restaurant first.', 'error');
      return { success: false, error: 'Organization not selected.' };
    }

    const currentRole = getEffectiveRole(
      organizationId,
      authState.accessibleRestaurants,
      authState.currentUser?.role
    );
    if (currentRole === 'EMPLOYEE') {
      get().showToast("You don't have permission to publish schedules.", 'error');
      return { success: false, error: "You don't have permission to publish schedules." };
    }

    const { data: draftRows, error: draftError } = await supabase
      .from('shifts')
      .select('id,organization_id,user_id,shift_date,start_time,end_time,notes,job,is_blocked,schedule_state,location_id,pay_rate,pay_source')
      .eq('organization_id', organizationId)
      .eq('schedule_state', 'draft')
      .gte('shift_date', startDate)
      .lte('shift_date', endDate);

    if (draftError) {
      get().showToast(draftError.message ?? 'Unable to load draft shifts.', 'error');
      return { success: false, error: draftError.message };
    }
    if (!draftRows || draftRows.length === 0) {
      get().showToast('No draft shifts to publish for this range.', 'error');
      return { success: false, error: 'No draft shifts to publish for this range.' };
    }

    const { data: publishedRows, error: publishedError } = await supabase
      .from('shifts')
      .select('id,organization_id,user_id,shift_date,start_time,end_time,notes,job,is_blocked,schedule_state,location_id,pay_rate,pay_source')
      .eq('organization_id', organizationId)
      .eq('schedule_state', 'published')
      .gte('shift_date', startDate)
      .lte('shift_date', endDate);

    if (publishedError) {
      get().showToast(publishedError.message ?? 'Unable to load published shifts.', 'error');
      return { success: false, error: publishedError.message };
    }

    const buildShiftFromRow = (row: Record<string, unknown>): Shift =>
      toShiftRow(row, organizationId);

    const publishedByKey = new Map<string, Record<string, unknown>>();
    (publishedRows ?? []).forEach((row: Record<string, unknown>) => {
      const key = buildShiftOverlayKey(buildShiftFromRow(row));
      if (!publishedByKey.has(key)) {
        publishedByKey.set(key, row);
      }
    });

    let deletedCount = 0;
    let publishedCount = 0;

    for (const row of draftRows ?? []) {
      const draftShift = buildShiftFromRow(row);
      const key = buildShiftOverlayKey(draftShift);
      const publishedMatch = publishedByKey.get(key);

      if (draftShift.isBlocked) {
        if (publishedMatch?.id) {
          const { error: deletePublishedError } = await supabase
            .from('shifts')
            .delete()
            .eq('id', publishedMatch.id);
          if (deletePublishedError) {
            get().showToast(deletePublishedError.message ?? 'Unable to publish shifts.', 'error');
            return { success: false, error: deletePublishedError.message };
          }
          deletedCount += 1;
          publishedByKey.delete(key);
        }

        const { error: deleteDraftError } = await supabase
          .from('shifts')
          .delete()
          .eq('id', readString(row.id));
        if (deleteDraftError) {
          get().showToast(deleteDraftError.message ?? 'Unable to publish shifts.', 'error');
          return { success: false, error: deleteDraftError.message };
        }
        deletedCount += 1;
        continue;
      }

      if (publishedMatch?.id) {
        const { error: deletePublishedError } = await supabase
          .from('shifts')
          .delete()
          .eq('id', publishedMatch.id);
        if (deletePublishedError) {
          get().showToast(deletePublishedError.message ?? 'Unable to publish shifts.', 'error');
          return { success: false, error: deletePublishedError.message };
        }
        deletedCount += 1;
        publishedByKey.delete(key);
      }

      const { error: updateError } = await supabase
        .from('shifts')
        .update({ schedule_state: 'published' })
        .eq('id', readString(row.id));
      if (updateError) {
        get().showToast(updateError.message ?? 'Unable to publish shifts.', 'error');
        return { success: false, error: updateError.message };
      }
      publishedCount += 1;
    }

    return { success: true, deletedCount, publishedCount };
  },

  seedDraftWeekFromPublished: async ({ organizationId, weekStartDate, weekEndDate }) => {
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { seeded: false, insertedCount: 0, skippedCount: 0, sourceCount: 0, error: "You don't have permission to modify schedules." };
    }
    if (!organizationId) {
      return { seeded: false, insertedCount: 0, skippedCount: 0, sourceCount: 0, error: 'Organization not selected.' };
    }

    const { data: existingDrafts, error: draftError } = await supabase
      .from('shifts')
      .select('user_id,start_time,end_time,location_id')
      .eq('organization_id', organizationId)
      .eq('schedule_state', 'draft')
      .gte('shift_date', weekStartDate)
      .lte('shift_date', weekEndDate);

    if (draftError) {
      return { seeded: false, insertedCount: 0, skippedCount: 0, sourceCount: 0, error: draftError.message };
    }

    if ((existingDrafts ?? []).length > 0) {
      return { seeded: false, insertedCount: 0, skippedCount: 0, sourceCount: (existingDrafts ?? []).length };
    }

    const { data: publishedShifts, error: publishedError } = await supabase
      .from('shifts')
      .select('user_id,shift_date,start_time,end_time,notes,is_blocked,job,location_id')
      .eq('organization_id', organizationId)
      .eq('schedule_state', 'published')
      .gte('shift_date', weekStartDate)
      .lte('shift_date', weekEndDate);

    if (publishedError) {
      return { seeded: false, insertedCount: 0, skippedCount: 0, sourceCount: 0, error: publishedError.message };
    }

    if (!publishedShifts || publishedShifts.length === 0) {
      return { seeded: false, insertedCount: 0, skippedCount: 0, sourceCount: 0 };
    }

    const publishedShiftRows = (publishedShifts ?? []) as UnknownRow[];
    const inserts = publishedShiftRows.map((shift) => ({
      organization_id: organizationId,
      user_id: readString(shift.user_id),
      shift_date: readString(shift.shift_date),
      start_time: readString(shift.start_time),
      end_time: readString(shift.end_time),
      notes: shift.notes ?? null,
      is_blocked: shift.is_blocked ?? false,
      schedule_state: 'draft',
      job: shift.job ?? null,
      location_id: shift.location_id ?? null,
    }));

    const { error: insertError } = await supabase.from('shifts').insert(inserts);
    if (insertError) {
      return { seeded: false, insertedCount: 0, skippedCount: 0, sourceCount: publishedShiftRows.length, error: insertError.message };
    }

    await get().loadRestaurantData(organizationId);
    return { seeded: true, insertedCount: inserts.length, skippedCount: 0, sourceCount: publishedShiftRows.length };
  },

  copyPreviousDayIntoDraft: async (selectedDate) => {
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { success: false, error: "You don't have permission to modify schedules." };
    }
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
    const targetDate = toLocalDateString(selectedDate);
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const sourceDate = toLocalDateString(prevDate);

    const result = await apiFetch<{ insertedCount: number; skippedCount: number; sourceCount: number }>(
      '/api/shifts/copy-day',
      {
        method: 'POST',
        json: {
          organizationId,
          sourceDate,
          targetDate,
          targetScheduleState: 'draft',
          sourceScheduleState: 'published',
        },
      }
    );

    if (!result.ok) {
      return { success: false, error: result.error ?? 'Unable to copy previous day.' };
    }

    const insertedCount = Number(result.data?.insertedCount ?? 0);
    const skippedCount = Number(result.data?.skippedCount ?? 0);
    const sourceCount = Number(result.data?.sourceCount ?? 0);

    if (sourceCount > 0) {
      await get().loadRestaurantData(organizationId);
    }

    return { success: true, insertedCount, skippedCount, sourceCount };
  },

  addTimeOffRequest: async (request) => {
    const state = get();
    if (!request.reason || !String(request.reason).trim()) {
      return { success: false, error: 'Reason is required for this request' };
    }
    if (get().hasOrgBlackoutOnDate(request.startDate) || get().hasOrgBlackoutOnDate(request.endDate)) {
      return { success: false, error: 'Time off is not allowed on blackout dates.' };
    }

    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/time-off/request', {
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

    const newRequest = toTimeOffRow(result.data.request);

    set({ timeOffRequests: [...state.timeOffRequests, newRequest] });
    return { success: true };
  },

  reviewTimeOffRequest: async (id, status, reviewerId, managerNote) => {
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
    const normalizedStatus = String(status || '').toUpperCase() as TimeOffStatus;

    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/time-off/review', {
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
              reviewedBy: readOptionalString(data.reviewed_by) ?? req.reviewedBy,
              reviewedAt: readOptionalString(data.reviewed_at) ?? req.reviewedAt,
              managerNote: readOptionalString(data.manager_note) ?? req.managerNote,
              updatedAt: readOptionalString(data.updated_at) ?? req.updatedAt,
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

    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/time-off/cancel', {
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
              updatedAt: readOptionalString(data.updated_at) ?? req.updatedAt,
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
    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/blocked-days/request', {
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

    const newRequest = toBlockedDayRow(result.data.request);

    set((state) => ({ blockedDayRequests: [...state.blockedDayRequests, newRequest] }));
    return { success: true };
  },

  reviewBlockedDayRequest: async (id, status, managerNote) => {
    const organizationId = useAuthStore.getState().activeRestaurantId;
    if (!organizationId) {
      return { success: false, error: 'Organization not selected.' };
    }
    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/blocked-days/review', {
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
              managerNote: readOptionalString(data.manager_note) ?? req.managerNote,
              reviewedByAuthUserId: readOptionalString(data.reviewed_by_auth_user_id) ?? req.reviewedByAuthUserId,
              reviewedAt: readOptionalString(data.reviewed_at) ?? req.reviewedAt,
              updatedAt: readOptionalString(data.updated_at) ?? req.updatedAt,
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
    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/blocked-days/cancel', {
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
              updatedAt: readOptionalString(data.updated_at) ?? req.updatedAt,
            }
          : req
      ),
    }));
    return { success: true };
  },

  createImmediateBlockedDay: async (data) => {
    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/blocked-days/create', {
      method: 'POST',
      json: data,
    });

    if (!result.ok || !result.data?.request) {
      return { success: false, error: result.error ?? 'Unable to create blocked day.' };
    }

    const newRequest = toBlockedDayRow(result.data.request);

    set((state) => ({ blockedDayRequests: [...state.blockedDayRequests, newRequest] }));
    return { success: true };
  },

  updateBlockedDay: async (data) => {
    const result = await apiFetch<{ request: Record<string, unknown> }>('/api/blocked-days/update', {
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
              startDate: readString(row.start_date, req.startDate),
              endDate: readString(row.end_date, req.endDate),
              reason: readString(row.reason, req.reason),
              status: String(row.status ?? req.status).toUpperCase() as BlockedDayStatus,
              managerNote: readOptionalString(row.manager_note) ?? req.managerNote,
              updatedAt: readOptionalString(row.updated_at) ?? req.updatedAt,
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

  hasBlockedShiftOnDate: (employeeId, date) => {
      const state = get();
      const hasBlockedRequest = state.blockedDayRequests.some(
        (req) =>
          req.scope === 'EMPLOYEE' &&
          req.userId === employeeId &&
          req.status === 'APPROVED' &&
          date >= req.startDate &&
          date <= req.endDate
      );
      if (hasBlockedRequest) {
        return true;
      }
      return false;
    },

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
    if (state.viewMode === 'week') {
      const weekStartDay = state.scheduleViewSettings?.weekStartDay ?? 'sunday';
      const weekStart = getWeekStart(state.selectedDate, weekStartDay);
      weekStart.setDate(weekStart.getDate() - 7);
      return {
        selectedDate: weekStart,
        dateNavDirection: 'prev',
        dateNavKey: state.dateNavKey + 1,
      };
    }
    const newDate = new Date(state.selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    return {
      selectedDate: newDate,
      dateNavDirection: 'prev',
      dateNavKey: state.dateNavKey + 1,
    };
  }),

  goToNext: () => set((state) => {
    if (state.viewMode === 'week') {
      const weekStartDay = state.scheduleViewSettings?.weekStartDay ?? 'sunday';
      const weekStart = getWeekStart(state.selectedDate, weekStartDay);
      weekStart.setDate(weekStart.getDate() + 7);
      return {
        selectedDate: weekStart,
        dateNavDirection: 'next',
        dateNavKey: state.dateNavKey + 1,
      };
    }
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

    const scopedEmployees = state.employees.filter(
      (e) => e.restaurantId === restaurantId && state.selectedSections.includes(e.section)
    );

    if (state.selectedEmployeeIds.length > 0) {
      const selectedSet = new Set(state.selectedEmployeeIds);
      return scopedEmployees.filter((e) => selectedSet.has(e.id));
    }

    if (state.workingTodayOnly) {
      const workingIds = new Set(get().getWorkingEmployeeIdsForDate(state.selectedDate));
      return scopedEmployees.filter((e) => workingIds.has(e.id));
    }

    return scopedEmployees;
  },

  getEmployeesForRestaurant: (restaurantId) => {
    const state = get();
    if (!restaurantId) return [];
    return state.employees.filter((e) => e.restaurantId === restaurantId);
  },

  getShiftsForRestaurant: (restaurantId) => {
    const state = get();
    if (!restaurantId) return [];
    const scoped = state.shifts.filter((s) => s.restaurantId === restaurantId);
    const authState = useAuthStore.getState();
    const currentRole = getEffectiveRole(
      restaurantId,
      authState.accessibleRestaurants,
      authState.currentUser?.role
    );
    if (currentRole === 'EMPLOYEE') {
      return scoped.filter((shift) => shift.scheduleState === 'published');
    }

    const result: Array<Shift | null> = [];
    const indexByKey = new Map<string, number>();
    scoped.forEach((shift) => {
      if (shift.scheduleState !== 'published') return;
      const key = buildShiftOverlayKey(shift);
      if (indexByKey.has(key)) return;
      indexByKey.set(key, result.length);
      result.push(shift);
    });

    scoped.forEach((shift) => {
      if (shift.scheduleState !== 'draft') return;
      const key = buildShiftOverlayKey(shift);
      if (shift.isBlocked) {
        const existingIndex = indexByKey.get(key);
        const existing = existingIndex !== undefined ? result[existingIndex] : undefined;
        if (existingIndex !== undefined && existing && existing.scheduleState !== 'draft') {
          result[existingIndex] = null;
          indexByKey.delete(key);
        }
        return;
      }
      const existingIndex = indexByKey.get(key);
      if (existingIndex !== undefined) {
        result[existingIndex] = shift;
        return;
      }
      result.push(shift);
      indexByKey.set(key, result.length - 1);
    });

    return result.filter((shift): shift is Shift => Boolean(shift));
  },

  getPendingTimeOffRequests: () => get().timeOffRequests.filter((r) => r.status === 'PENDING'),
  getPendingBlockedDayRequests: () => get().blockedDayRequests.filter((r) => r.status === 'PENDING'),
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
        const dayRanges = state.businessHours.filter(
          (h) => h.dayOfWeek === day && h.enabled && h.openTime && h.closeTime
        );
        if (dayRanges.length > 0) {
          const starts = dayRanges.map((h) => parseTimeToDecimal(h.openTime ?? null));
          const ends = dayRanges.map((h) => parseTimeToDecimal(h.closeTime ?? null));
          const openHour = Math.min(...starts);
          const closeHour = Math.max(...ends);
          if (closeHour > openHour) {
            // Add padding of 3 hours before and after
            return {
              startHour: Math.max(0, Math.floor(openHour) - 3),
              endHour: Math.min(24, Math.ceil(closeHour) + 3),
            };
          }
        }
        // Fallback if no valid business hours for that day
        // Find any enabled business hours to use as a guide
        const anyRanges = state.businessHours.filter((h) => h.enabled && h.openTime && h.closeTime);
        if (anyRanges.length > 0) {
          const starts = anyRanges.map((h) => parseTimeToDecimal(h.openTime ?? null));
          const ends = anyRanges.map((h) => parseTimeToDecimal(h.closeTime ?? null));
          const openHour = Math.min(...starts);
          const closeHour = Math.max(...ends);
          if (closeHour > openHour) {
            return {
              startHour: Math.max(0, Math.floor(openHour) - 3),
              endHour: Math.min(24, Math.ceil(closeHour) + 3),
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

