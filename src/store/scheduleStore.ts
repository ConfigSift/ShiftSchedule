'use client';

import { create } from 'zustand';
import { 
  Employee, 
  Shift, 
  Section, 
  TimeOffRequest, 
  BlockedPeriod,
  DropShiftRequest,
  ChatMessage,
  TimeOffStatus,
  DropRequestStatus,
} from '../types';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from '../utils/storage';
import { generateId, datesOverlap, shiftsOverlap, hashPin } from '../utils/timeUtils';

type ViewMode = 'day' | 'week';
type ModalType = 
  | 'addShift' 
  | 'editShift' 
  | 'addEmployee' 
  | 'editEmployee' 
  | 'employeeProfile'
  | 'timeOffRequest'
  | 'blockedPeriod'
  | 'timeOffReview'
  | 'dropShift'
  | null;

interface ScheduleState {
  // Data
  employees: Employee[];
  shifts: Shift[];
  timeOffRequests: TimeOffRequest[];
  blockedPeriods: BlockedPeriod[];
  dropRequests: DropShiftRequest[];
  chatMessages: ChatMessage[];
  
  // UI State
  selectedDate: Date;
  viewMode: ViewMode;
  selectedSections: Section[];
  selectedEmployeeIds: string[];
  hoveredShiftId: string | null;
  
  // Modal State
  modalType: ModalType;
  modalData: any;
  
  // Toast
  toast: { message: string; type: 'success' | 'error' } | null;
  
  // Initialization
  isHydrated: boolean;
  
  // Actions
  hydrate: () => void;
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSection: (section: Section) => void;
  setSectionSelected: (section: Section, selected: boolean) => void;
  toggleEmployee: (employeeId: string) => void;
  selectAllEmployees: () => void;
  deselectAllEmployees: () => void;
  setHoveredShift: (shiftId: string | null) => void;
  
  // Modal
  openModal: (type: ModalType, data?: any) => void;
  closeModal: () => void;
  
  // Toast
  showToast: (message: string, type: 'success' | 'error') => void;
  clearToast: () => void;
  
  // Employee CRUD
  addEmployee: (employee: Omit<Employee, 'id' | 'createdAt'>) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  updateEmployeePin: (id: string, newPin: string) => Promise<void>;
  deleteEmployee: (id: string) => void;
  getEmployeeById: (id: string) => Employee | undefined;
  
  // Shift CRUD
  addShift: (shift: Omit<Shift, 'id'>) => { success: boolean; error?: string };
  updateShift: (id: string, updates: Partial<Shift>) => { success: boolean; error?: string };
  deleteShift: (id: string) => void;
  
  // Time Off
  addTimeOffRequest: (request: Omit<TimeOffRequest, 'id' | 'createdAt' | 'status'>) => void;
  reviewTimeOffRequest: (id: string, status: TimeOffStatus, reviewerId: string) => void;
  getTimeOffForDate: (employeeId: string, date: string) => TimeOffRequest | undefined;
  hasApprovedTimeOff: (employeeId: string, date: string) => boolean;
  
  // Blocked Periods (Manager only)
  addBlockedPeriod: (period: Omit<BlockedPeriod, 'id' | 'createdAt'>) => void;
  deleteBlockedPeriod: (id: string) => void;
  isDateBlocked: (date: string) => boolean;
  
  // Drop Shift Requests
  createDropRequest: (shiftId: string, employeeId: string) => void;
  acceptDropRequest: (requestId: string, acceptingEmployeeId: string) => { success: boolean; error?: string };
  cancelDropRequest: (requestId: string) => void;
  
  // Chat
  sendChatMessage: (senderId: string, text: string, type?: ChatMessage['type'], dropRequestId?: string) => void;
  
  // Navigation
  goToToday: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  
  // Computed
  getFilteredEmployees: () => Employee[];
  getPendingTimeOffRequests: () => TimeOffRequest[];
  getOpenDropRequests: () => DropShiftRequest[];
}

const initialEmployees: Employee[] = [];
const initialShifts: Shift[] = [];

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  // Initial data
  employees: initialEmployees,
  shifts: initialShifts,
  timeOffRequests: [],
  blockedPeriods: [],
  dropRequests: [],
  chatMessages: [],
  
  // UI State
  selectedDate: new Date(),
  viewMode: 'day',
  selectedSections: ['kitchen', 'front', 'bar', 'management'],
  selectedEmployeeIds: [],
  hoveredShiftId: null,
  
  // Modal
  modalType: null,
  modalData: null,
  
  // Toast
  toast: null,
  
  // Hydration
  isHydrated: false,
  
  hydrate: () => {
    const employees = loadFromStorage<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
    const shifts = loadFromStorage<Shift[]>(STORAGE_KEYS.SHIFTS, []);
    const timeOffRequests = loadFromStorage<TimeOffRequest[]>(STORAGE_KEYS.TIME_OFF_REQUESTS, []);
    const blockedPeriods = loadFromStorage<BlockedPeriod[]>(STORAGE_KEYS.BLOCKED_PERIODS, []);
    const dropRequests = loadFromStorage<DropShiftRequest[]>(STORAGE_KEYS.DROP_REQUESTS, []);
    const chatMessages = loadFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, []);
    
    set({
      employees,
      shifts,
      timeOffRequests,
      blockedPeriods,
      dropRequests,
      chatMessages,
      selectedEmployeeIds: employees.map(e => e.id),
      isHydrated: true,
    });
  },
  
  // UI Actions
  setSelectedDate: (date) => set({ selectedDate: date }),
  setViewMode: (mode) => set({ viewMode: mode }),
  
  toggleSection: (section) => set((state) => {
    const isSelected = state.selectedSections.includes(section);
    const newSections = isSelected
      ? state.selectedSections.filter(s => s !== section)
      : [...state.selectedSections, section];
    
    // Get all employees in the toggled section
    const sectionEmployees = state.employees.filter(e => e.section === section);
    const sectionEmployeeIds = sectionEmployees.map(e => e.id);
    
    let newSelectedIds: string[];
    if (isSelected) {
      // Removing section: remove all employees from that section
      newSelectedIds = state.selectedEmployeeIds.filter(id => !sectionEmployeeIds.includes(id));
    } else {
      // Adding section: add all employees from that section
      newSelectedIds = [...new Set([...state.selectedEmployeeIds, ...sectionEmployeeIds])];
    }
    
    return {
      selectedSections: newSections,
      selectedEmployeeIds: newSelectedIds,
    };
  }),
  
  setSectionSelected: (section, selected) => set((state) => {
    const sectionEmployees = state.employees.filter(e => e.section === section);
    const sectionEmployeeIds = sectionEmployees.map(e => e.id);
    
    let newSelectedIds: string[];
    let newSections: Section[];
    
    if (selected) {
      newSelectedIds = [...new Set([...state.selectedEmployeeIds, ...sectionEmployeeIds])];
      newSections = state.selectedSections.includes(section) 
        ? state.selectedSections 
        : [...state.selectedSections, section];
    } else {
      newSelectedIds = state.selectedEmployeeIds.filter(id => !sectionEmployeeIds.includes(id));
      newSections = state.selectedSections.filter(s => s !== section);
    }
    
    return {
      selectedSections: newSections,
      selectedEmployeeIds: newSelectedIds,
    };
  }),
  
  toggleEmployee: (employeeId) => set((state) => ({
    selectedEmployeeIds: state.selectedEmployeeIds.includes(employeeId)
      ? state.selectedEmployeeIds.filter(id => id !== employeeId)
      : [...state.selectedEmployeeIds, employeeId],
  })),
  
  selectAllEmployees: () => set((state) => ({
    selectedEmployeeIds: state.employees
      .filter(e => state.selectedSections.includes(e.section) && e.isActive)
      .map(e => e.id),
  })),
  
  deselectAllEmployees: () => set({ selectedEmployeeIds: [] }),
  
  setHoveredShift: (shiftId) => set({ hoveredShiftId: shiftId }),
  
  // Modal
  openModal: (type, data = null) => set({ modalType: type, modalData: data }),
  closeModal: () => set({ modalType: null, modalData: null }),
  
  // Toast
  showToast: (message, type) => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },
  clearToast: () => set({ toast: null }),
  
  // Employee CRUD
  addEmployee: (employee) => {
    const newEmployee: Employee = {
      ...employee,
      id: generateId('emp'),
      createdAt: new Date().toISOString(),
    };
    
    set((state) => {
      const newEmployees = [...state.employees, newEmployee];
      saveToStorage(STORAGE_KEYS.EMPLOYEES, newEmployees);
      return {
        employees: newEmployees,
        selectedEmployeeIds: [...state.selectedEmployeeIds, newEmployee.id],
      };
    });
  },
  
  updateEmployee: (id, updates) => set((state) => {
    const newEmployees = state.employees.map(e => 
      e.id === id ? { ...e, ...updates } : e
    );
    saveToStorage(STORAGE_KEYS.EMPLOYEES, newEmployees);
    return { employees: newEmployees };
  }),
  
  updateEmployeePin: async (id, newPin) => {
    const pinHash = await hashPin(newPin);
    set((state) => {
      const newEmployees = state.employees.map(e => 
        e.id === id ? { ...e, pinHash } : e
      );
      saveToStorage(STORAGE_KEYS.EMPLOYEES, newEmployees);
      return { employees: newEmployees };
    });
  },
  
  deleteEmployee: (id) => set((state) => {
    const newEmployees = state.employees.filter(e => e.id !== id);
    const newShifts = state.shifts.filter(s => s.employeeId !== id);
    saveToStorage(STORAGE_KEYS.EMPLOYEES, newEmployees);
    saveToStorage(STORAGE_KEYS.SHIFTS, newShifts);
    return {
      employees: newEmployees,
      shifts: newShifts,
      selectedEmployeeIds: state.selectedEmployeeIds.filter(eid => eid !== id),
    };
  }),
  
  getEmployeeById: (id) => get().employees.find(e => e.id === id),
  
  // Shift CRUD
  addShift: (shift) => {
    const state = get();
    
    // Check if employee has approved time off
    if (state.hasApprovedTimeOff(shift.employeeId, shift.date)) {
      return { success: false, error: 'Employee has approved time off on this date' };
    }
    
    // Check for overlapping shifts
    const existingShifts = state.shifts.filter(
      s => s.employeeId === shift.employeeId && s.date === shift.date
    );
    
    for (const existing of existingShifts) {
      if (shiftsOverlap(shift.startHour, shift.endHour, existing.startHour, existing.endHour)) {
        return { success: false, error: 'Shift overlaps with existing shift' };
      }
    }
    
    const newShift: Shift = {
      ...shift,
      id: generateId('shift'),
    };
    
    const newShifts = [...state.shifts, newShift];
    saveToStorage(STORAGE_KEYS.SHIFTS, newShifts);
    set({ shifts: newShifts });
    
    return { success: true };
  },
  
  updateShift: (id, updates) => {
    const state = get();
    const shift = state.shifts.find(s => s.id === id);
    if (!shift) return { success: false, error: 'Shift not found' };
    
    const updatedShift = { ...shift, ...updates };
    
    // Check time off if date or employee changed
    if (state.hasApprovedTimeOff(updatedShift.employeeId, updatedShift.date)) {
      return { success: false, error: 'Employee has approved time off on this date' };
    }
    
    // Check for overlapping shifts (excluding current shift)
    const existingShifts = state.shifts.filter(
      s => s.id !== id && s.employeeId === updatedShift.employeeId && s.date === updatedShift.date
    );
    
    for (const existing of existingShifts) {
      if (shiftsOverlap(updatedShift.startHour, updatedShift.endHour, existing.startHour, existing.endHour)) {
        return { success: false, error: 'Shift overlaps with existing shift' };
      }
    }
    
    const newShifts = state.shifts.map(s => s.id === id ? updatedShift : s);
    saveToStorage(STORAGE_KEYS.SHIFTS, newShifts);
    set({ shifts: newShifts });
    
    return { success: true };
  },
  
  deleteShift: (id) => set((state) => {
    const newShifts = state.shifts.filter(s => s.id !== id);
    saveToStorage(STORAGE_KEYS.SHIFTS, newShifts);
    return { shifts: newShifts };
  }),
  
  // Time Off
  addTimeOffRequest: (request) => set((state) => {
    const newRequest: TimeOffRequest = {
      ...request,
      id: generateId('tor'),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const newRequests = [...state.timeOffRequests, newRequest];
    saveToStorage(STORAGE_KEYS.TIME_OFF_REQUESTS, newRequests);
    return { timeOffRequests: newRequests };
  }),
  
  reviewTimeOffRequest: (id, status, reviewerId) => set((state) => {
    const newRequests = state.timeOffRequests.map(r =>
      r.id === id ? { 
        ...r, 
        status, 
        reviewedBy: reviewerId,
        reviewedAt: new Date().toISOString(),
      } : r
    );
    saveToStorage(STORAGE_KEYS.TIME_OFF_REQUESTS, newRequests);
    return { timeOffRequests: newRequests };
  }),
  
  getTimeOffForDate: (employeeId, date) => {
    return get().timeOffRequests.find(r =>
      r.employeeId === employeeId &&
      r.status === 'approved' &&
      date >= r.startDate &&
      date <= r.endDate
    );
  },
  
  hasApprovedTimeOff: (employeeId, date) => {
    return get().timeOffRequests.some(r =>
      r.employeeId === employeeId &&
      r.status === 'approved' &&
      date >= r.startDate &&
      date <= r.endDate
    );
  },
  
  // Blocked Periods
  addBlockedPeriod: (period) => set((state) => {
    const newPeriod: BlockedPeriod = {
      ...period,
      id: generateId('bp'),
      createdAt: new Date().toISOString(),
    };
    const newPeriods = [...state.blockedPeriods, newPeriod];
    saveToStorage(STORAGE_KEYS.BLOCKED_PERIODS, newPeriods);
    return { blockedPeriods: newPeriods };
  }),
  
  deleteBlockedPeriod: (id) => set((state) => {
    const newPeriods = state.blockedPeriods.filter(p => p.id !== id);
    saveToStorage(STORAGE_KEYS.BLOCKED_PERIODS, newPeriods);
    return { blockedPeriods: newPeriods };
  }),
  
  isDateBlocked: (date) => {
    return get().blockedPeriods.some(p =>
      date >= p.startDate && date <= p.endDate
    );
  },
  
  // Drop Shift Requests
  createDropRequest: (shiftId, employeeId) => {
    const state = get();
    const shift = state.shifts.find(s => s.id === shiftId);
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
    
    // Also post to chat
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
  
  acceptDropRequest: (requestId, acceptingEmployeeId) => {
    const state = get();
    const request = state.dropRequests.find(r => r.id === requestId);
    if (!request || request.status !== 'open') {
      return { success: false, error: 'Request no longer available' };
    }
    
    const shift = state.shifts.find(s => s.id === request.shiftId);
    if (!shift) {
      return { success: false, error: 'Shift not found' };
    }
    
    // Check if accepting employee has approved time off
    if (state.hasApprovedTimeOff(acceptingEmployeeId, shift.date)) {
      return { success: false, error: 'You have approved time off on this date' };
    }
    
    // Check for overlapping shifts
    const existingShifts = state.shifts.filter(
      s => s.employeeId === acceptingEmployeeId && s.date === shift.date && s.id !== shift.id
    );
    
    for (const existing of existingShifts) {
      if (shiftsOverlap(shift.startHour, shift.endHour, existing.startHour, existing.endHour)) {
        return { success: false, error: 'You have a conflicting shift at this time' };
      }
    }
    
    // Update the shift to the new employee
    const newShifts = state.shifts.map(s =>
      s.id === shift.id ? { ...s, employeeId: acceptingEmployeeId } : s
    );
    
    // Update the drop request
    const newRequests = state.dropRequests.map(r =>
      r.id === requestId ? {
        ...r,
        status: 'accepted' as DropRequestStatus,
        acceptedByEmployeeId: acceptingEmployeeId,
        acceptedAt: new Date().toISOString(),
      } : r
    );
    
    saveToStorage(STORAGE_KEYS.SHIFTS, newShifts);
    saveToStorage(STORAGE_KEYS.DROP_REQUESTS, newRequests);
    
    // Post confirmation to chat
    const acceptor = state.getEmployeeById(acceptingEmployeeId);
    const original = state.getEmployeeById(request.fromEmployeeId);
    const chatMessage: ChatMessage = {
      id: generateId('msg'),
      senderId: 'system',
      createdAt: new Date().toISOString(),
      text: `✓ ${acceptor?.name} accepted ${original?.name}'s shift on ${shift.date}`,
      type: 'system',
    };
    
    const newMessages = [...state.chatMessages, chatMessage];
    saveToStorage(STORAGE_KEYS.CHAT_MESSAGES, newMessages);
    
    set({ shifts: newShifts, dropRequests: newRequests, chatMessages: newMessages });
    
    return { success: true };
  },
  
  cancelDropRequest: (requestId) => set((state) => {
    const newRequests = state.dropRequests.map(r =>
      r.id === requestId ? { ...r, status: 'cancelled' as DropRequestStatus } : r
    );
    saveToStorage(STORAGE_KEYS.DROP_REQUESTS, newRequests);
    return { dropRequests: newRequests };
  }),
  
  // Chat
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
  
  // Navigation
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
  
  // Computed
  getFilteredEmployees: () => {
    const state = get();
    return state.employees.filter(e =>
      e.isActive &&
      state.selectedSections.includes(e.section) &&
      state.selectedEmployeeIds.includes(e.id)
    );
  },
  
  getPendingTimeOffRequests: () => {
    return get().timeOffRequests.filter(r => r.status === 'pending');
  },
  
  getOpenDropRequests: () => {
    return get().dropRequests.filter(r => r.status === 'open');
  },
}));
