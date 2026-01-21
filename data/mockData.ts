import type { Employee, Shift, Role } from "@/types";

export const mockEmployees: Employee[] = [
  // Kitchen
  { id: 'emp-1', name: 'John Martinez', role: 'kitchen' as Role, color: '#f97316' },
  { id: 'emp-2', name: 'Maria Garcia', role: 'kitchen' as Role, color: '#f97316' },
  { id: 'emp-3', name: 'Carlos Ruiz', role: 'kitchen' as Role, color: '#f97316' },

  // Front of House
  { id: 'emp-4', name: 'Sarah Chen', role: 'front' as Role, color: '#3b82f6' },
  { id: 'emp-5', name: 'Mike Johnson', role: 'front' as Role, color: '#3b82f6' },
  { id: 'emp-6', name: 'Emily Davis', role: 'front' as Role, color: '#3b82f6' },
  { id: 'emp-7', name: 'Alex Thompson', role: 'front' as Role, color: '#3b82f6' },

  // Bar
  { id: 'emp-8', name: 'Lisa Park', role: 'bar' as Role, color: '#a855f7' },
  { id: 'emp-9', name: 'Tom Wilson', role: 'bar' as Role, color: '#a855f7' },

  // Management
  { id: 'emp-10', name: 'Rachel Green', role: 'management' as Role, color: '#10b981' },
  // Kitchen (more)
  { id: 'emp-11', name: 'Ana Silva', role: 'kitchen' as Role, color: '#f97316' },
  { id: 'emp-12', name: 'Marco Rossi', role: 'kitchen' as Role, color: '#f97316' },
  { id: 'emp-13', name: 'Nina Patel', role: 'kitchen' as Role, color: '#f97316' },

  // Front of House (more)
  { id: 'emp-14', name: 'Jordan King', role: 'front' as Role, color: '#3b82f6' },
  { id: 'emp-15', name: 'Priya Nair', role: 'front' as Role, color: '#3b82f6' },
  { id: 'emp-16', name: 'Ben Carter', role: 'front' as Role, color: '#3b82f6' },
  { id: 'emp-17', name: 'Sofia Lopez', role: 'front' as Role, color: '#3b82f6' },

  // Bar (more)
  { id: 'emp-18', name: 'Chris Morgan', role: 'bar' as Role, color: '#a855f7' },
  { id: 'emp-19', name: 'Jasmine Wong', role: 'bar' as Role, color: '#a855f7' },

  // Management (more)
  { id: 'emp-20', name: 'David Kim', role: 'management' as Role, color: '#10b981' },
];

export const mockShifts: Shift[] = [
  { id: "shift-1", employeeId: "emp-1", date: "2026-01-21", startHour: 9, endHour: 17 } as unknown as Shift,
  { id: "shift-2", employeeId: "emp-2", date: "2026-01-21", startHour: 12, endHour: 20 } as unknown as Shift,
  { id: "shift-3", employeeId: "emp-3", date: "2026-01-22", startHour: 10, endHour: 18 } as unknown as Shift,
  // --- Added sample shifts (Jan 21) ---
  { id: 'shift-2',  employeeId: 'emp-2',  date: '2026-01-21', startHour: 7,  endHour: 15 } as unknown as Shift,
  { id: 'shift-3',  employeeId: 'emp-3',  date: '2026-01-21', startHour: 10, endHour: 18 } as unknown as Shift,
  { id: 'shift-4',  employeeId: 'emp-4',  date: '2026-01-21', startHour: 11, endHour: 19 } as unknown as Shift,
  { id: 'shift-5',  employeeId: 'emp-5',  date: '2026-01-21', startHour: 12, endHour: 20 } as unknown as Shift,
  { id: 'shift-6',  employeeId: 'emp-6',  date: '2026-01-21', startHour: 9,  endHour: 17 } as unknown as Shift,
  { id: 'shift-7',  employeeId: 'emp-7',  date: '2026-01-21', startHour: 14, endHour: 22 } as unknown as Shift,
  { id: 'shift-8',  employeeId: 'emp-8',  date: '2026-01-21', startHour: 16, endHour: 22 } as unknown as Shift,
  { id: 'shift-9',  employeeId: 'emp-9',  date: '2026-01-21', startHour: 17, endHour: 23 } as unknown as Shift,
  { id: 'shift-10', employeeId: 'emp-10', date: '2026-01-21', startHour: 10, endHour: 18 } as unknown as Shift,

  { id: 'shift-11', employeeId: 'emp-11', date: '2026-01-21', startHour: 6,  endHour: 14 } as unknown as Shift,
  { id: 'shift-12', employeeId: 'emp-12', date: '2026-01-21', startHour: 13, endHour: 21 } as unknown as Shift,
  { id: 'shift-13', employeeId: 'emp-13', date: '2026-01-21', startHour: 8,  endHour: 16 } as unknown as Shift,

  { id: 'shift-14', employeeId: 'emp-14', date: '2026-01-21', startHour: 8,  endHour: 16 } as unknown as Shift,
  { id: 'shift-15', employeeId: 'emp-15', date: '2026-01-21', startHour: 11, endHour: 19 } as unknown as Shift,
  { id: 'shift-16', employeeId: 'emp-16', date: '2026-01-21', startHour: 15, endHour: 23 } as unknown as Shift,
  { id: 'shift-17', employeeId: 'emp-17', date: '2026-01-21', startHour: 12, endHour: 20 } as unknown as Shift,

  { id: 'shift-18', employeeId: 'emp-18', date: '2026-01-21', startHour: 18, endHour: 23 } as unknown as Shift,
  { id: 'shift-19', employeeId: 'emp-19', date: '2026-01-21', startHour: 16, endHour: 22 } as unknown as Shift,
  { id: 'shift-20', employeeId: 'emp-20', date: '2026-01-21', startHour: 9,  endHour: 17 } as unknown as Shift,
];





