// Section type for organizing employees
export type Section = 'kitchen' | 'front' | 'bar' | 'management';

// User role for permissions
export type UserRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface EmployeeProfile {
  phone?: string;
  email?: string;
  notes?: string;
}

export interface Employee {
  id: string;
  name: string;
  section: Section;
  userRole: UserRole;
  restaurantId?: string;
  profile: EmployeeProfile;
  isActive: boolean;
  jobs?: string[];
}

export interface Restaurant {
  id: string;
  name: string;
  restaurantCode: string;
  createdAt: string;
  createdByUserId: string;
}

export interface UserProfile {
  id: string;
  authUserId: string;
  organizationId: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  role: UserRole;
  jobs: string[];
}

export interface Shift {
  id: string;
  employeeId: string;
  restaurantId: string;
  date: string; // YYYY-MM-DD
  startHour: number; // 0-24 decimal (e.g., 9.5 = 9:30am)
  endHour: number;
  notes?: string;
  isBlocked?: boolean;
  job?: string;
}

export type TimeOffStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  organizationId?: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: TimeOffStatus;
  createdAt: string;
  updatedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  managerNote?: string;
}

export interface BlockedPeriod {
  id: string;
  startDate: string;
  endDate: string;
  startHour?: number;
  endHour?: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export type DropRequestStatus = 'open' | 'accepted' | 'cancelled';

export interface DropShiftRequest {
  id: string;
  shiftId: string;
  fromEmployeeId: string;
  status: DropRequestStatus;
  createdAt: string;
  acceptedByEmployeeId?: string;
  acceptedAt?: string;
}

export type ChatMessageType = 'message' | 'drop_request' | 'system';

export interface ChatMessage {
  id: string;
  senderId: string;
  createdAt: string;
  text: string;
  type: ChatMessageType;
  dropRequestId?: string;
}

export interface SectionConfig {
  id: Section;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const SECTIONS: Record<Section, SectionConfig> = {
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

export const HOURS_START = 6;
export const HOURS_END = 24;
export const TOTAL_HOURS = HOURS_END - HOURS_START;

export const JOB_OPTIONS = [
  'Admin',
  'Bartender',
  'Bartender Training',
  'BOH Train',
  'Busser',
  'Cook',
  'Dishwasher',
  'FOH Train',
  'Food Run',
  'Food Runner',
  'Ghost Bar1',
  'Ghost Bar 2',
  'Host',
  'Manager',
  'Server',
  'Server Training',
] as const;
