'use client';

import { create } from 'zustand';
import {
  Employee,
  Shift,
  Section,
  TimeOffRequest,
  DropShiftRequest,
  ChatMessage,
  TimeOffStatus,
  DropRequestStatus,
  JOB_OPTIONS,
} from '../types';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from '../utils/storage';
import { generateId, shiftsOverlap } from '../utils/timeUtils';
import { supabase } from '../lib/supabase/client';
import { getUserRole, isManagerRole } from '../utils/role';
import { normalizeUserRow } from '../utils/userMapper';
import { useAuthStore } from './authStore';

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

function isValidJob(value: unknown): value is string {
  if (!value) return false;
  return JOB_OPTIONS.includes(String(value) as (typeof JOB_OPTIONS)[number]);
}

type ViewMode = 'day' | 'week';
type ModalType =
  | 'addShift'
  | 'editShift'
  | 'addEmployee'
  | 'editEmployee'
  | 'timeOffRequest'
  | 'blockedPeriod'
  | 'timeOffReview'
  | 'dropShift'
  | null;

interface ScheduleState {
  employees: Employee[];
  shifts: Shift[];
  timeOffRequests: TimeOffRequest[];
  dropRequests: DropShiftRequest[];
  chatMessages: ChatMessage[];

  selectedDate: Date;
  viewMode: ViewMode;
  selectedSections: Section[];
  selectedEmployeeIds: string[];
  hoveredShiftId: string | null;

  modalType: ModalType;
  modalData: any;

  toast: { message: string; type: 'success' | 'error' } | null;
  isHydrated: boolean;
  shiftLoadCounts: { total: number; visible: number };

  hydrate: () => void;
  loadRestaurantData: (restaurantId: string | null) => Promise<void>;
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSection: (section: Section) => void;
  setSectionSelectedForRestaurant: (section: Section, selected: boolean, restaurantId: string | null) => void;
  toggleEmployee: (employeeId: string) => void;
  selectAllEmployeesForRestaurant: (restaurantId: string | null) => void;
  deselectAllEmployees: () => void;
  setHoveredShift: (shiftId: string | null) => void;
  applyRestaurantScope: (restaurantId: string | null) => void;

  openModal: (type: ModalType, data?: any) => void;
  closeModal: () => void;

  showToast: (message: string, type: 'success' | 'error') => void;
  clearToast: () => void;

  getEmployeeById: (id: string) => Employee | undefined;

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

  createBlockedPeriod: (employeeId: string, startDate: string, endDate: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  deleteBlockedPeriod: (blockId: string) => Promise<{ success: boolean; error?: string }>;
  getBlockedShiftsForEmployee: (employeeId: string) => Shift[];
  hasBlockedShiftOnDate: (employeeId: string, date: string) => boolean;

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
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  employees: [],
  shifts: [],
  timeOffRequests: [],
  dropRequests: [],
  chatMessages: [],

  selectedDate: new Date(),
  viewMode: 'day',
  selectedSections: ['kitchen', 'front', 'bar', 'management'],
  selectedEmployeeIds: [],
  hoveredShiftId: null,

  modalType: null,
  modalData: null,

  toast: null,
  isHydrated: false,
  shiftLoadCounts: { total: 0, visible: 0 },

  hydrate: () => {
    const dropRequests = loadFromStorage<DropShiftRequest[]>(STORAGE_KEYS.DROP_REQUESTS, []);
    const chatMessages = loadFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, []);

    set({
      timeOffRequests: [],
      dropRequests,
      chatMessages,
      isHydrated: true,
    });
  },

  loadRestaurantData: async (restaurantId) => {
    if (!restaurantId) {
      set({ employees: [], shifts: [], selectedEmployeeIds: [], timeOffRequests: [], shiftLoadCounts: { total: 0, visible: 0 } });
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
      set({ employees: [], shifts: [], selectedEmployeeIds: [], timeOffRequests: [], shiftLoadCounts: { total: 0, visible: 0 } });
      return;
    }

    let employees: Employee[] = (userData || []).map((row) => {
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
      };
    });

    if (currentRole === 'EMPLOYEE' && currentUser?.id) {
      employees = employees.filter((emp) => emp.id === currentUser.id);
    }

    let shiftQuery = supabase
      .from('shifts')
      .select('id,organization_id,user_id,shift_date,start_time,end_time,notes,is_blocked,job')
      .eq('organization_id', restaurantId);

    if (currentRole === 'EMPLOYEE' && currentUser?.id) {
      shiftQuery = shiftQuery.eq('user_id', currentUser.id);
    }

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

    set({
      employees,
      shifts,
      selectedEmployeeIds: employees.map((e) => e.id),
      timeOffRequests,
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

    const sectionEmployees = state.employees.filter(
      (e) => e.section === section && e.restaurantId === restaurantId
    );
    const sectionEmployeeIds = sectionEmployees.map((e) => e.id);

    let newSelectedIds: string[] = [];
    let newSections: Section[] = [];

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

  selectAllEmployeesForRestaurant: (restaurantId) => set((state) => {
    if (!restaurantId) return { selectedEmployeeIds: [] };
    return {
      selectedEmployeeIds: state.employees
        .filter((e) => e.restaurantId === restaurantId && state.selectedSections.includes(e.section))
        .map((e) => e.id),
    };
  }),

  deselectAllEmployees: () => set({ selectedEmployeeIds: [] }),
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
      })
      .select('id,organization_id,user_id,shift_date,start_time,end_time,notes,is_blocked,job')
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
    };

    const newShifts = [...state.shifts, newShift];
    set({ shifts: newShifts });
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

    const updatedShift = { ...shift, ...updates };

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
    const { error } = await (supabase as any)
      .from('shifts')
      .update({
        organization_id: updatedShift.restaurantId,
        user_id: updatedShift.employeeId,
        shift_date: updatedShift.date,
        start_time: formatTimeFromDecimal(updatedShift.startHour),
        end_time: formatTimeFromDecimal(updatedShift.endHour),
        notes: updatedShift.notes ?? null,
        is_blocked: false,
        job: safeJob,
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    const newShifts = state.shifts.map((s) => (s.id === id ? updatedShift : s));
    set({ shifts: newShifts });
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
    const insertPayload = {
      organization_id: request.organizationId,
      user_id: request.employeeId,
      requester_auth_user_id: request.requesterAuthUserId,
      start_date: request.startDate,
      end_date: request.endDate,
      reason: request.reason ?? null,
      status: 'PENDING',
    };

    let insertData: Record<string, any> | null = null;
    let error: { message: string } | null = null;

    const primaryResult = await (supabase as any)
      .from('time_off_requests')
      .insert(insertPayload)
      .select('*')
      .single();

    if (!primaryResult.error) {
      insertData = primaryResult.data;
    } else if (primaryResult.error.message?.toLowerCase().includes('requester_auth_user_id')) {
      const { requester_auth_user_id, ...fallbackPayload } = insertPayload;
      const fallbackResult = await (supabase as any)
        .from('time_off_requests')
        .insert({ ...fallbackPayload, auth_user_id: request.requesterAuthUserId })
        .select('*')
        .single();
      if (!fallbackResult.error) {
        insertData = fallbackResult.data;
      } else if (fallbackResult.error.message?.toLowerCase().includes('auth_user_id')) {
        const secondFallbackResult = await (supabase as any)
          .from('time_off_requests')
          .insert({ ...fallbackPayload, requester_user_id: request.requesterAuthUserId })
          .select('*')
          .single();
        insertData = secondFallbackResult.data;
        error = secondFallbackResult.error;
      } else {
        error = fallbackResult.error;
      }
    } else {
      error = primaryResult.error;
    }

    if (error || !insertData) {
      return { success: false, error: error?.message ?? 'Failed to submit request' };
    }

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
    const { data, error } = await (supabase as any)
      .from('time_off_requests')
      .update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        manager_note: managerNote ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id,status,reviewed_by,reviewed_at,manager_note,updated_at')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Unable to update request' };
    }

    set((state) => ({
      timeOffRequests: state.timeOffRequests.map((req) =>
        req.id === id
          ? {
              ...req,
              status: String(data.status ?? status).toUpperCase() as TimeOffStatus,
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
    const { data, error } = await (supabase as any)
      .from('time_off_requests')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id,status,updated_at')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Unable to cancel request' };
    }

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

  createBlockedPeriod: async (employeeId, startDate, endDate, reason) => {
    const state = get();
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { success: false, error: "You don't have permission to block out days." };
    }
    if (!reason || !reason.trim()) {
      return { success: false, error: 'Reason is required for blocked days.' };
    }
    const employee = state.employees.find((emp) => emp.id === employeeId);
    if (!employee?.restaurantId) {
      return { success: false, error: 'Restaurant not assigned for this employee' };
    }

    const days: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { success: false, error: 'Invalid date range' };
    }

    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      days.push(dt.toISOString().split('T')[0]);
    }

    const { data, error } = await (supabase as any)
      .from('shifts')
      .insert(
        days.map((date) => ({
          organization_id: employee.restaurantId,
          user_id: employeeId,
          shift_date: date,
          start_time: formatTimeFromDecimal(0),
          end_time: formatTimeFromDecimal(23.99),
          notes: `[BLOCKED] ${reason.trim()}`,
          is_blocked: true,
        }))
      )
      .select('id,organization_id,user_id,shift_date,start_time,end_time,notes,is_blocked');

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Unable to block out dates' };
    }

    const newShifts: Shift[] = (data || []).map((row: any) => ({
      id: row.id,
      employeeId: row.user_id,
      restaurantId: row.organization_id,
      date: row.shift_date,
      startHour: parseTimeToDecimal(row.start_time),
      endHour: parseTimeToDecimal(row.end_time),
      notes: row.notes ?? undefined,
      isBlocked: Boolean(row.is_blocked),
    }));

    set({ shifts: [...state.shifts, ...newShifts] });
    return { success: true };
  },

  deleteBlockedPeriod: async (blockId) => {
    const state = get();
    const currentUser = useAuthStore.getState().currentUser;
    if (!isManagerRole(currentUser?.role)) {
      return { success: false, error: "You don't have permission to remove blocked days." };
    }
    const block = state.shifts.find((shift) => shift.id === blockId);
    if (!block || !block.isBlocked) {
      return { success: false, error: 'Blocked entry not found.' };
    }
    const { error } = await (supabase as any)
      .from('shifts')
      .delete()
      .eq('id', blockId)
      .eq('is_blocked', true);
    if (error) {
      return { success: false, error: error.message };
    }
    set({ shifts: state.shifts.filter((shift) => shift.id !== blockId) });
    return { success: true };
  },

  getBlockedShiftsForEmployee: (employeeId) =>
    get().shifts.filter((shift) => shift.employeeId === employeeId && shift.isBlocked),

  hasBlockedShiftOnDate: (employeeId, date) =>
    get().shifts.some((shift) => shift.employeeId === employeeId && shift.date === date && shift.isBlocked),

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

  goToToday: () => set({ selectedDate: new Date() }),

  goToPrevious: () => set((state) => {
    const newDate = new Date(state.selectedDate);
    newDate.setDate(newDate.getDate() - (state.viewMode === 'day' ? 1 : 7));
    return { selectedDate: newDate };
  }),

  goToNext: () => set((state) => {
    const newDate = new Date(state.selectedDate);
    newDate.setDate(newDate.getDate() + (state.viewMode === 'day' ? 1 : 7));
    return { selectedDate: newDate };
  }),

  getFilteredEmployeesForRestaurant: (restaurantId) => {
    const state = get();
    if (!restaurantId) return [];
    return state.employees.filter(
      (e) =>
        e.restaurantId === restaurantId &&
        state.selectedSections.includes(e.section) &&
        state.selectedEmployeeIds.includes(e.id)
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
}));
