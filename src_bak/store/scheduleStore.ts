import { create } from 'zustand';

function normalizeShifts(shifts: Shift[]): Shift[] {
  // Merge overlapping OR back-to-back shifts per employee+date
  const groups = new Map<string, Shift[]>();

  for (const s of shifts) {
    const key = `${s.employeeId}__${s.date}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const out: Shift[] = [];
  for (const arr of groups.values()) {
    const sorted = [...arr].sort((a, b) => (a.startHour - b.startHour) || (a.endHour - b.endHour));
    let cur = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const nxt = sorted[i];

      // overlap or touch: nxt.startHour <= cur.endHour
      if (nxt.startHour <= cur.endHour) {
        cur = {
          ...cur,
          // keep first id; extend end
          endHour: Math.max(cur.endHour, nxt.endHour),
        } as Shift;
      } else {
        out.push(cur);
        cur = nxt;
      }
    }
    if (cur) out.push(cur);
  }

  return out;
}
import { Employee, Shift, Role } from '@/types';
import { mockEmployees, mockShifts } from '@/data/mockData';

type ViewMode = 'day' | 'week';

interface ScheduleState {
  // Data
  employees: Employee[];
  shifts: Shift[];
  
  // UI State
  selectedDate: Date;
  viewMode: ViewMode;
  selectedRoles: Role[];
  selectedEmployeeIds: string[];
  hoveredShiftId: string | null;
  editingShiftId: string | null;
  
  // Actions
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleRole: (role: Role) => void;
  toggleEmployee: (employeeId: string) => void;
  selectAllEmployees: () => void;
  deselectAllEmployees: () => void;
  setHoveredShift: (shiftId: string | null) => void;
  setEditingShift: (shiftId: string | null) => void;
  
  // Shift CRUD
  addShift: (shift: Omit<Shift, 'id'>) => void;
  updateShift: (shiftId: string, updates: Partial<Shift>) => void;
  deleteShift: (shiftId: string) => void;
  
  // Employee CRUD
  addEmployee: (employee: Omit<Employee, 'id'>) => void;
  updateEmployee: (employeeId: string, updates: Partial<Employee>) => void;
  deleteEmployee: (employeeId: string) => void;
  
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
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  // Initial data
  employees: mockEmployees,
  shifts: normalizeShifts(mockShifts),
  
  // Initial UI state
  selectedDate: new Date(),
  viewMode: 'day',
  selectedRoles: ['kitchen', 'front', 'bar', 'management'],
  selectedEmployeeIds: mockEmployees.map(e => e.id),
  hoveredShiftId: null,
  editingShiftId: null,
  
  // Actions
  setSelectedDate: (date) => set({ selectedDate: date }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  toggleRole: (role) => set((state) => {
    const isSelected = state.selectedRoles.includes(role);
    const newRoles = isSelected
      ? state.selectedRoles.filter(r => r !== role)
      : [...state.selectedRoles, role];
    
    // Update selected employees based on roles
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
  
  deselectAllEmployees: () => set({ selectedEmployeeIds: mockEmployees.map(e => e.id) }),
  
  setHoveredShift: (shiftId) => set({ hoveredShiftId: shiftId }),
  
  setEditingShift: (shiftId) => set({ editingShiftId: shiftId }),
  
  // Shift CRUD
  addShift: (shift) => set((state) => ({
    shifts: [...state.shifts, { ...shift, id: `shift-${Date.now()}` }],
  })),
  
  updateShift: (shiftId, updates) => set((state) => ({
    shifts: normalizeShifts(
      state.shifts.map((shift) =>
        shift.id === shiftId ? ({ ...shift, ...updates } as Shift) : shift
      )
    ),
  })),
  
  deleteShift: (shiftId) => set((state) => ({
    shifts: normalizeShifts(state.shifts.filter((shift) => shift.id !== shiftId)),
  })),
  
  // Employee CRUD
  addEmployee: (employee) => set((state) => {
    const newEmployee = { ...employee, id: `emp-${Date.now()}` };
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
    shifts: normalizeShifts(state.shifts.filter(s => s.employeeId !== employeeId)),
    selectedEmployeeIds: state.selectedEmployeeIds.filter(id => id !== employeeId),
  })),
  
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

    const roles = state.selectedRoles.length
      ? state.selectedRoles
      : (['kitchen', 'front', 'bar', 'management'] as Role[]);

    const ids = state.selectedEmployeeIds.length
      ? state.selectedEmployeeIds
      : state.employees.map(e => e.id);

    return state.employees.filter(e => roles.includes(e.role) && ids.includes(e.id));
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
}));






