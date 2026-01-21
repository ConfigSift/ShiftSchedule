'use client';

import { create } from 'zustand';
import { Employee, Shift, Role, TimeOffRequest, BlockedPeriod, TimeOffStatus } from '../types';
import { mockEmployees, mockShifts, mockTimeOffRequests, mockBlockedPeriods } from '../data/mockData';

type ViewMode = 'day' | 'week';
type ModalType = 'addShift' | 'editShift' | 'addEmployee' | 'editEmployee' | 'employeeProfile' | 'timeOffRequest' | 'blockedPeriod' | null;

interface ScheduleState {
  // Data
  employees: Employee[];
  shifts: Shift[];
  timeOffRequests: TimeOffRequest[];
  blockedPeriods: BlockedPeriod[];
  
  // Current user (for employee view)
  currentUser: Employee | null;
  isManager: boolean;
  
  // UI State
  selectedDate: Date;
  viewMode: ViewMode;
  selectedRoles: Role[];
  selectedEmployeeIds: string[];
  hoveredShiftId: string | null;
  editingShiftId: string | null;
  
  // Modal State
  modalType: ModalType;
  modalData: any;
  
  // Drag State
  draggingShift: { shiftId: string; edge: 'start' | 'end' | 'move' } | null;
  
  // Actions
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleRole: (role: Role) => void;
  toggleEmployee: (employeeId: string) => void;
  selectAllEmployees: () => void;
  deselectAllEmployees: () => void;
  setHoveredShift: (shiftId: string | null) => void;
  setEditingShift: (shiftId: string | null) => void;
  
  // Modal Actions
  openModal: (type: ModalType, data?: any) => void;
  closeModal: () => void;
  
  // Drag Actions
  startDragging: (shiftId: string, edge: 'start' | 'end' | 'move') => void;
  stopDragging: () => void;
  
  // Shift CRUD
  addShift: (shift: Omit<Shift, 'id'>) => void;
  updateShift: (shiftId: string, updates: Partial<Shift>) => void;
  deleteShift: (shiftId: string) => void;
  
  // Employee CRUD
  addEmployee: (employee: Omit<Employee, 'id'>) => void;
  updateEmployee: (employeeId: string, updates: Partial<Employee>) => void;
  deleteEmployee: (employeeId: string) => void;
  
  // Time Off Requests
  addTimeOffRequest: (request: Omit<TimeOffRequest, 'id' | 'createdAt' | 'status'>) => void;
  updateTimeOffRequest: (requestId: string, status: TimeOffStatus, reviewNotes?: string) => void;
  deleteTimeOffRequest: (requestId: string) => void;
  
  // Blocked Periods
  addBlockedPeriod: (period: Omit<BlockedPeriod, 'id' | 'createdAt'>) => void;
  deleteBlockedPeriod: (periodId: string) => void;
  isDateBlocked: (date: string, hour?: number) => boolean;
  
  // Auth
  login: (pin: string) => boolean;
  logout: () => void;
  
  // Navigation
  goToToday: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  
  // Computed
  getFilteredEmployees: () => Employee[];
  getShiftsForDate: (date: string) => Shift[];
  getShiftsForEmployee: (employeeId: string, date: string) => Shift[];
  getTotalHoursForDate: (date: string) => number;
  getEmployeeById: (id: string) => Employee | undefined;
  getTimeOffRequestsForEmployee: (employeeId: string) => TimeOffRequest[];
  getPendingTimeOffRequests: () => TimeOffRequest[];
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  // Initial data
  employees: mockEmployees,
  shifts: mockShifts,
  timeOffRequests: mockTimeOffRequests,
  blockedPeriods: mockBlockedPeriods,
  
  // Current user
  currentUser: mockEmployees.find(e => e.role === 'management') || null, // Default to manager for demo
  isManager: true,
  
  // Initial UI state
  selectedDate: new Date(),
  viewMode: 'day',
  selectedRoles: ['kitchen', 'front', 'bar', 'management'],
  selectedEmployeeIds: mockEmployees.map(e => e.id),
  hoveredShiftId: null,
  editingShiftId: null,
  
  // Modal state
  modalType: null,
  modalData: null,
  
  // Drag state
  draggingShift: null,
  
  // Actions
  setSelectedDate: (date) => set({ selectedDate: date }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  toggleRole: (role) => set((state) => {
    const isSelected = state.selectedRoles.includes(role);
    const newRoles = isSelected
      ? state.selectedRoles.filter(r => r !== role)
      : [...state.selectedRoles, role];
    
    const employeesInRoles = state.employees
      .filter(e => newRoles.includes(e.role))
      .map(e => e.id);
    
    return {
      selectedRoles: newRoles,
      selectedEmployeeIds: state.selectedEmployeeIds.filter(id => 
        employeesInRoles.includes(id)
      ),
    };
  }),
  
  toggleEmployee: (employeeId) => set((state) => ({
    selectedEmployeeIds: state.selectedEmployeeIds.includes(employeeId)
      ? state.selectedEmployeeIds.filter(id => id !== employeeId)
      : [...state.selectedEmployeeIds, employeeId],
  })),
  
  selectAllEmployees: () => set((state) => ({
    selectedEmployeeIds: state.employees
      .filter(e => state.selectedRoles.includes(e.role))
      .map(e => e.id),
  })),
  
  deselectAllEmployees: () => set({ selectedEmployeeIds: [] }),
  
  setHoveredShift: (shiftId) => set({ hoveredShiftId: shiftId }),
  
  setEditingShift: (shiftId) => set({ editingShiftId: shiftId }),
  
  // Modal Actions
  openModal: (type, data = null) => set({ modalType: type, modalData: data }),
  closeModal: () => set({ modalType: null, modalData: null }),
  
  // Drag Actions
  startDragging: (shiftId, edge) => set({ draggingShift: { shiftId, edge } }),
  stopDragging: () => set({ draggingShift: null }),
  
  // Shift CRUD
  addShift: (shift) => set((state) => ({
    shifts: [...state.shifts, { ...shift, id: `shift-${Date.now()}` }],
  })),
  
  updateShift: (shiftId, updates) => set((state) => ({
    shifts: state.shifts.map(s => 
      s.id === shiftId ? { ...s, ...updates } : s
    ),
  })),
  
  deleteShift: (shiftId) => set((state) => ({
    shifts: state.shifts.filter(s => s.id !== shiftId),
  })),
  
  // Employee CRUD
  addEmployee: (employee) => set((state) => {
    const newEmployee = { ...employee, id: `emp-${Date.now()}` } as Employee;
    return {
      employees: [...state.employees, newEmployee],
      selectedEmployeeIds: [...state.selectedEmployeeIds, newEmployee.id],
    };
  }),
  
  updateEmployee: (employeeId, updates) => set((state) => ({
    employees: state.employees.map(e => 
      e.id === employeeId ? { ...e, ...updates } : e
    ),
  })),
  
  deleteEmployee: (employeeId) => set((state) => ({
    employees: state.employees.filter(e => e.id !== employeeId),
    shifts: state.shifts.filter(s => s.employeeId !== employeeId),
    selectedEmployeeIds: state.selectedEmployeeIds.filter(id => id !== employeeId),
  })),
  
  // Time Off Requests
  addTimeOffRequest: (request) => set((state) => ({
    timeOffRequests: [...state.timeOffRequests, {
      ...request,
      id: `tor-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      status: 'pending' as TimeOffStatus,
    }],
  })),
  
  updateTimeOffRequest: (requestId, status, reviewNotes) => set((state) => ({
    timeOffRequests: state.timeOffRequests.map(r =>
      r.id === requestId ? {
        ...r,
        status,
        reviewedBy: state.currentUser?.id,
        reviewedAt: new Date().toISOString().split('T')[0],
        reviewNotes,
      } : r
    ),
  })),
  
  deleteTimeOffRequest: (requestId) => set((state) => ({
    timeOffRequests: state.timeOffRequests.filter(r => r.id !== requestId),
  })),
  
  // Blocked Periods
  addBlockedPeriod: (period) => set((state) => ({
    blockedPeriods: [...state.blockedPeriods, {
      ...period,
      id: `bp-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    }],
  })),
  
  deleteBlockedPeriod: (periodId) => set((state) => ({
    blockedPeriods: state.blockedPeriods.filter(p => p.id !== periodId),
  })),
  
  isDateBlocked: (date, hour) => {
    const state = get();
    return state.blockedPeriods.some(period => {
      if (date < period.startDate || date > period.endDate) return false;
      if (hour !== undefined && period.startHour !== undefined && period.endHour !== undefined) {
        return hour >= period.startHour && hour < period.endHour;
      }
      return true;
    });
  },
  
  // Auth
  login: (pin) => {
    const state = get();
    const employee = state.employees.find(e => e.pin === pin);
    if (employee) {
      set({
        currentUser: employee,
        isManager: employee.role === 'management',
      });
      return true;
    }
    return false;
  },
  
  logout: () => set({ currentUser: null, isManager: false }),
  
  // Navigation
  goToToday: () => set({ selectedDate: new Date() }),
  
  goToPrevious: () => set((state) => {
    const newDate = new Date(state.selectedDate);
    if (state.viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    return { selectedDate: newDate };
  }),
  
  goToNext: () => set((state) => {
    const newDate = new Date(state.selectedDate);
    if (state.viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    return { selectedDate: newDate };
  }),
  
  // Computed
  getFilteredEmployees: () => {
    const state = get();
    return state.employees.filter(
      e => state.selectedRoles.includes(e.role) && 
           state.selectedEmployeeIds.includes(e.id)
    );
  },
  
  getShiftsForDate: (date) => {
    const state = get();
    return state.shifts.filter(s => s.date === date);
  },
  
  getShiftsForEmployee: (employeeId, date) => {
    const state = get();
    return state.shifts.filter(
      s => s.employeeId === employeeId && s.date === date
    );
  },
  
  getTotalHoursForDate: (date) => {
    const state = get();
    return state.shifts
      .filter(s => s.date === date)
      .reduce((total, shift) => total + (shift.endHour - shift.startHour), 0);
  },
  
  getEmployeeById: (id) => {
    return get().employees.find(e => e.id === id);
  },
  
  getTimeOffRequestsForEmployee: (employeeId) => {
    return get().timeOffRequests.filter(r => r.employeeId === employeeId);
  },
  
  getPendingTimeOffRequests: () => {
    return get().timeOffRequests.filter(r => r.status === 'pending');
  },
}));
