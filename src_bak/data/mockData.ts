import { Employee, Shift } from '@/types';

export const mockEmployees: Employee[] = [
  // Kitchen
  { id: 'emp-1', name: 'John Martinez', role: 'kitchen', color: '#f97316' },
  { id: 'emp-2', name: 'Maria Garcia', role: 'kitchen', color: '#f97316' },
  { id: 'emp-3', name: 'Carlos Ruiz', role: 'kitchen', color: '#f97316' },
  
  // Front of House
  { id: 'emp-4', name: 'Sarah Chen', role: 'front', color: '#3b82f6' },
  { id: 'emp-5', name: 'Mike Johnson', role: 'front', color: '#3b82f6' },
  { id: 'emp-6', name: 'Emily Davis', role: 'front', color: '#3b82f6' },
  { id: 'emp-7', name: 'Alex Thompson', role: 'front', color: '#3b82f6' },
  
  // Bar
  { id: 'emp-8', name: 'Lisa Park', role: 'bar', color: '#a855f7' },
  { id: 'emp-9', name: 'Tom Wilson', role: 'bar', color: '#a855f7' },
  
  // Management
  { id: 'emp-10', name: 'Rachel Green', role: 'management', color: '#10b981' },
];

// Helper to get today's date in YYYY-MM-DD format
const getDateString = (daysOffset: number = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
};

export const mockShifts: Shift[] = [
  // Today's shifts
  { id: 'shift-1', employeeId: 'emp-1', date: getDateString(0), startHour: 6, endHour: 14 },
  { id: 'shift-2', employeeId: 'emp-2', date: getDateString(0), startHour: 10, endHour: 18 },
  { id: 'shift-3', employeeId: 'emp-3', date: getDateString(0), startHour: 14, endHour: 22 },
  { id: 'shift-4', employeeId: 'emp-4', date: getDateString(0), startHour: 11, endHour: 19 },
  { id: 'shift-5', employeeId: 'emp-5', date: getDateString(0), startHour: 16, endHour: 23 },
  { id: 'shift-6', employeeId: 'emp-6', date: getDateString(0), startHour: 11, endHour: 15 },
  { id: 'shift-7', employeeId: 'emp-7', date: getDateString(0), startHour: 17, endHour: 23 },
  { id: 'shift-8', employeeId: 'emp-8', date: getDateString(0), startHour: 16, endHour: 24 },
  { id: 'shift-9', employeeId: 'emp-9', date: getDateString(0), startHour: 18, endHour: 24 },
  { id: 'shift-10', employeeId: 'emp-10', date: getDateString(0), startHour: 9, endHour: 17 },
  
  // Tomorrow's shifts
  { id: 'shift-11', employeeId: 'emp-1', date: getDateString(1), startHour: 6, endHour: 14 },
  { id: 'shift-12', employeeId: 'emp-2', date: getDateString(1), startHour: 14, endHour: 22 },
  { id: 'shift-13', employeeId: 'emp-4', date: getDateString(1), startHour: 10, endHour: 18 },
  { id: 'shift-14', employeeId: 'emp-5', date: getDateString(1), startHour: 11, endHour: 19 },
  { id: 'shift-15', employeeId: 'emp-8', date: getDateString(1), startHour: 17, endHour: 24 },
  
  // Day after tomorrow
  { id: 'shift-16', employeeId: 'emp-3', date: getDateString(2), startHour: 8, endHour: 16 },
  { id: 'shift-17', employeeId: 'emp-6', date: getDateString(2), startHour: 11, endHour: 19 },
  { id: 'shift-18', employeeId: 'emp-7', date: getDateString(2), startHour: 16, endHour: 23 },
  { id: 'shift-19', employeeId: 'emp-9', date: getDateString(2), startHour: 18, endHour: 24 },
];
