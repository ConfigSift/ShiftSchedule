import { Employee, Shift, TimeOffRequest, BlockedPeriod } from '../types';

export const mockEmployees: Employee[] = [
  // Kitchen
  { 
    id: 'emp-1', 
    name: 'John Martinez', 
    email: 'john.m@restaurant.com',
    phone: '555-0101',
    role: 'kitchen', 
    color: '#f97316',
    hireDate: '2023-03-15',
    hourlyRate: 18,
    maxHoursPerWeek: 40,
    isActive: true,
    pin: '1234',
  },
  { 
    id: 'emp-2', 
    name: 'Maria Garcia', 
    email: 'maria.g@restaurant.com',
    phone: '555-0102',
    role: 'kitchen', 
    color: '#f97316',
    hireDate: '2022-08-01',
    hourlyRate: 20,
    maxHoursPerWeek: 40,
    isActive: true,
    pin: '2345',
  },
  { 
    id: 'emp-3', 
    name: 'Carlos Ruiz', 
    email: 'carlos.r@restaurant.com',
    phone: '555-0103',
    role: 'kitchen', 
    color: '#f97316',
    hireDate: '2024-01-10',
    hourlyRate: 16,
    maxHoursPerWeek: 32,
    isActive: true,
    pin: '3456',
  },
  
  // Front of House
  { 
    id: 'emp-4', 
    name: 'Sarah Chen', 
    email: 'sarah.c@restaurant.com',
    phone: '555-0104',
    role: 'front', 
    color: '#3b82f6',
    hireDate: '2023-06-20',
    hourlyRate: 15,
    maxHoursPerWeek: 40,
    isActive: true,
    pin: '4567',
  },
  { 
    id: 'emp-5', 
    name: 'Mike Johnson', 
    email: 'mike.j@restaurant.com',
    phone: '555-0105',
    role: 'front', 
    color: '#3b82f6',
    hireDate: '2023-09-01',
    hourlyRate: 15,
    maxHoursPerWeek: 35,
    isActive: true,
    pin: '5678',
  },
  { 
    id: 'emp-6', 
    name: 'Emily Davis', 
    email: 'emily.d@restaurant.com',
    phone: '555-0106',
    role: 'front', 
    color: '#3b82f6',
    hireDate: '2024-02-14',
    hourlyRate: 14,
    maxHoursPerWeek: 25,
    isActive: true,
    pin: '6789',
  },
  { 
    id: 'emp-7', 
    name: 'Alex Thompson', 
    email: 'alex.t@restaurant.com',
    phone: '555-0107',
    role: 'front', 
    color: '#3b82f6',
    hireDate: '2023-11-30',
    hourlyRate: 15,
    maxHoursPerWeek: 40,
    isActive: true,
    pin: '7890',
  },
  
  // Bar
  { 
    id: 'emp-8', 
    name: 'Lisa Park', 
    email: 'lisa.p@restaurant.com',
    phone: '555-0108',
    role: 'bar', 
    color: '#a855f7',
    hireDate: '2022-05-10',
    hourlyRate: 17,
    maxHoursPerWeek: 40,
    isActive: true,
    pin: '8901',
  },
  { 
    id: 'emp-9', 
    name: 'Tom Wilson', 
    email: 'tom.w@restaurant.com',
    phone: '555-0109',
    role: 'bar', 
    color: '#a855f7',
    hireDate: '2023-07-22',
    hourlyRate: 16,
    maxHoursPerWeek: 35,
    isActive: true,
    pin: '9012',
  },
  
  // Management
  { 
    id: 'emp-10', 
    name: 'Rachel Green', 
    email: 'rachel.g@restaurant.com',
    phone: '555-0110',
    role: 'management', 
    color: '#10b981',
    hireDate: '2021-01-15',
    hourlyRate: 28,
    maxHoursPerWeek: 45,
    isActive: true,
    pin: '0000',
  },
];

// Helper to get today's date in YYYY-MM-DD format
const getDateString = (daysOffset: number = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
};

export const mockShifts: Shift[] = [
  // Today's shifts
  { id: 'shift-1', employeeId: 'emp-1', date: getDateString(0), startHour: 6, endHour: 14, status: 'scheduled' },
  { id: 'shift-2', employeeId: 'emp-2', date: getDateString(0), startHour: 10, endHour: 18, status: 'scheduled' },
  { id: 'shift-3', employeeId: 'emp-3', date: getDateString(0), startHour: 14, endHour: 22, status: 'scheduled' },
  { id: 'shift-4', employeeId: 'emp-4', date: getDateString(0), startHour: 11, endHour: 19, status: 'scheduled' },
  { id: 'shift-5', employeeId: 'emp-5', date: getDateString(0), startHour: 16, endHour: 23, status: 'scheduled' },
  { id: 'shift-6', employeeId: 'emp-6', date: getDateString(0), startHour: 11, endHour: 15, status: 'scheduled' },
  { id: 'shift-7', employeeId: 'emp-7', date: getDateString(0), startHour: 17, endHour: 23, status: 'scheduled' },
  { id: 'shift-8', employeeId: 'emp-8', date: getDateString(0), startHour: 16, endHour: 24, status: 'scheduled' },
  { id: 'shift-9', employeeId: 'emp-9', date: getDateString(0), startHour: 18, endHour: 24, status: 'scheduled' },
  { id: 'shift-10', employeeId: 'emp-10', date: getDateString(0), startHour: 9, endHour: 17, status: 'scheduled' },
  
  // Tomorrow's shifts
  { id: 'shift-11', employeeId: 'emp-1', date: getDateString(1), startHour: 6, endHour: 14, status: 'scheduled' },
  { id: 'shift-12', employeeId: 'emp-2', date: getDateString(1), startHour: 14, endHour: 22, status: 'scheduled' },
  { id: 'shift-13', employeeId: 'emp-4', date: getDateString(1), startHour: 10, endHour: 18, status: 'scheduled' },
  { id: 'shift-14', employeeId: 'emp-5', date: getDateString(1), startHour: 11, endHour: 19, status: 'scheduled' },
  { id: 'shift-15', employeeId: 'emp-8', date: getDateString(1), startHour: 17, endHour: 24, status: 'scheduled' },
  
  // Day after tomorrow
  { id: 'shift-16', employeeId: 'emp-3', date: getDateString(2), startHour: 8, endHour: 16, status: 'scheduled' },
  { id: 'shift-17', employeeId: 'emp-6', date: getDateString(2), startHour: 11, endHour: 19, status: 'scheduled' },
  { id: 'shift-18', employeeId: 'emp-7', date: getDateString(2), startHour: 16, endHour: 23, status: 'scheduled' },
  { id: 'shift-19', employeeId: 'emp-9', date: getDateString(2), startHour: 18, endHour: 24, status: 'scheduled' },
];

export const mockTimeOffRequests: TimeOffRequest[] = [
  {
    id: 'tor-1',
    employeeId: 'emp-4',
    startDate: getDateString(7),
    endDate: getDateString(9),
    reason: 'Family vacation',
    status: 'pending',
    createdAt: getDateString(-2),
  },
  {
    id: 'tor-2',
    employeeId: 'emp-2',
    startDate: getDateString(14),
    endDate: getDateString(14),
    reason: 'Doctor appointment',
    status: 'approved',
    createdAt: getDateString(-5),
    reviewedBy: 'emp-10',
    reviewedAt: getDateString(-4),
  },
];

export const mockBlockedPeriods: BlockedPeriod[] = [
  {
    id: 'bp-1',
    startDate: getDateString(30), // Block Valentine's Day (example)
    endDate: getDateString(30),
    reason: "Valentine's Day - All hands on deck",
    createdBy: 'emp-10',
    createdAt: getDateString(-10),
  },
];
