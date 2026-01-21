export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  color: string;
  avatar?: string;
  hireDate: string;
  hourlyRate: number;
  maxHoursPerWeek: number;
  isActive: boolean;
  pin?: string; // For simple login
}

export type Role = 'kitchen' | 'front' | 'bar' | 'management';

export interface Shift {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  startHour: number; // 0-24 decimal (e.g., 9.5 = 9:30am)
  endHour: number;
  notes?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
}

export type TimeOffStatus = 'pending' | 'approved' | 'denied';

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  reason: string;
  status: TimeOffStatus;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface BlockedPeriod {
  id: string;
  startDate: string;
  endDate: string;
  startHour?: number; // Optional - if not set, whole day is blocked
  endHour?: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface RoleConfig {
  id: Role;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const ROLES: Record<Role, RoleConfig> = {
  kitchen: {
    id: 'kitchen',
    label: 'Kitchen',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
    borderColor: 'rgba(249, 115, 22, 0.4)',
  },
  front: {
    id: 'front',
    label: 'Front of House',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  bar: {
    id: 'bar',
    label: 'Bar',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  management: {
    id: 'management',
    label: 'Management',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
};

export const HOURS_START = 6; // 6am
export const HOURS_END = 24; // 12am (midnight)
export const TOTAL_HOURS = HOURS_END - HOURS_START;
