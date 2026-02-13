/**
 * Mock data for the CrewShyft interactive demo.
 *
 * Uses the real TypeScript interfaces from the codebase so the existing
 * schedule components can consume this data without any type mismatches.
 */

import type {
  Employee,
  Shift,
  TimeOffRequest,
  BlockedDayRequest,
  BusinessHour,
  CoreHour,
  Location,
  ScheduleViewSettings,
  UserProfile,
  Restaurant,
  DropShiftRequest,
  ChatMessage,
  Section,
  UserRole,
} from '../types';

// ---------------------------------------------------------------------------
// Stable IDs (deterministic so they don't change across hot-reloads)
// ---------------------------------------------------------------------------

const ORG_ID = 'demo-org-001';
const LOCATION_ID = 'demo-loc-001';
const AUTH_USER_ID = 'demo-auth-admin';

function eid(n: number): string {
  return `demo-emp-${String(n).padStart(3, '0')}`;
}

function sid(n: number): string {
  return `demo-shift-${String(n).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Date helpers — always relative to "today" so the demo stays current
// ---------------------------------------------------------------------------

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns Monday of the current week */
function getCurrentWeekMonday(): Date {
  const d = today();
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // distance to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ---------------------------------------------------------------------------
// Organization / Location / Settings
// ---------------------------------------------------------------------------

export const DEMO_RESTAURANT: Restaurant = {
  id: ORG_ID,
  name: 'Coastal Kitchen',
  restaurantCode: 'COASTALDEMO',
  createdAt: '2024-06-01T00:00:00Z',
  createdByUserId: AUTH_USER_ID,
};

export const DEMO_LOCATION: Location = {
  id: LOCATION_ID,
  organizationId: ORG_ID,
  name: 'Main Dining',
  sortOrder: 0,
  createdAt: '2024-06-01T00:00:00Z',
};

export const DEMO_SCHEDULE_VIEW_SETTINGS: ScheduleViewSettings = {
  id: 'demo-svs-001',
  organizationId: ORG_ID,
  hourMode: 'business',
  customStartHour: 9,
  customEndHour: 24,
  weekStartDay: 'monday',
};

// ---------------------------------------------------------------------------
// Business & Core Hours (restaurant open 10 AM – 11 PM, Mon-Sun)
// ---------------------------------------------------------------------------

function makeBizHour(dayOfWeek: number): BusinessHour {
  return {
    id: `demo-bh-${dayOfWeek}`,
    organizationId: ORG_ID,
    dayOfWeek,
    openTime: '10:00:00',
    closeTime: '23:00:00',
    enabled: true,
    sortOrder: dayOfWeek,
  };
}

export const DEMO_BUSINESS_HOURS: BusinessHour[] = Array.from({ length: 7 }, (_, i) =>
  makeBizHour(i),
);

function makeCoreHour(dayOfWeek: number): CoreHour {
  return {
    id: `demo-ch-${dayOfWeek}`,
    organizationId: ORG_ID,
    dayOfWeek,
    openTime: '11:00:00',
    closeTime: '22:00:00',
    enabled: true,
    sortOrder: dayOfWeek,
  };
}

export const DEMO_CORE_HOURS: CoreHour[] = Array.from({ length: 7 }, (_, i) =>
  makeCoreHour(i),
);

// ---------------------------------------------------------------------------
// Employees (20 total)
// ---------------------------------------------------------------------------

interface EmployeeSeed {
  index: number;
  name: string;
  role: UserRole;
  section: Section;
  jobs: string[];
  hourlyPay: number;
  phone: string;
  email: string;
}

const EMPLOYEE_SEEDS: EmployeeSeed[] = [
  // Managers (3)
  { index: 1,  name: 'Alex Rivera',     role: 'ADMIN',    section: 'management', jobs: ['Manager'],           hourlyPay: 28, phone: '555-0101', email: 'alex@coastalkitchen.demo' },
  { index: 2,  name: 'Jordan Kim',      role: 'MANAGER',  section: 'management', jobs: ['Manager'],           hourlyPay: 25, phone: '555-0102', email: 'jordan@coastalkitchen.demo' },
  { index: 3,  name: 'Sam Patel',       role: 'MANAGER',  section: 'management', jobs: ['Manager'],           hourlyPay: 25, phone: '555-0103', email: 'sam@coastalkitchen.demo' },
  // Servers (6)
  { index: 4,  name: 'Maya Johnson',    role: 'EMPLOYEE', section: 'front',      jobs: ['Server'],            hourlyPay: 15, phone: '555-0104', email: 'maya@coastalkitchen.demo' },
  { index: 5,  name: 'Ethan Brooks',    role: 'EMPLOYEE', section: 'front',      jobs: ['Server'],            hourlyPay: 15, phone: '555-0105', email: 'ethan@coastalkitchen.demo' },
  { index: 6,  name: 'Sophia Martinez', role: 'EMPLOYEE', section: 'front',      jobs: ['Server'],            hourlyPay: 15, phone: '555-0106', email: 'sophia@coastalkitchen.demo' },
  { index: 7,  name: 'Liam O\'Brien',   role: 'EMPLOYEE', section: 'front',      jobs: ['Server'],            hourlyPay: 14, phone: '555-0107', email: 'liam@coastalkitchen.demo' },
  { index: 8,  name: 'Olivia Chen',     role: 'EMPLOYEE', section: 'front',      jobs: ['Server', 'Host'],    hourlyPay: 15, phone: '555-0108', email: 'olivia@coastalkitchen.demo' },
  { index: 9,  name: 'Noah Williams',   role: 'EMPLOYEE', section: 'front',      jobs: ['Server'],            hourlyPay: 14, phone: '555-0109', email: 'noah@coastalkitchen.demo' },
  // Bartenders (3)
  { index: 10, name: 'Ava Thompson',    role: 'EMPLOYEE', section: 'bar',        jobs: ['Bartender'],         hourlyPay: 18, phone: '555-0110', email: 'ava@coastalkitchen.demo' },
  { index: 11, name: 'Lucas Garcia',    role: 'EMPLOYEE', section: 'bar',        jobs: ['Bartender'],         hourlyPay: 18, phone: '555-0111', email: 'lucas@coastalkitchen.demo' },
  { index: 12, name: 'Isabella Nguyen', role: 'EMPLOYEE', section: 'bar',        jobs: ['Bartender'],         hourlyPay: 17, phone: '555-0112', email: 'isabella@coastalkitchen.demo' },
  // Hosts (3)
  { index: 13, name: 'Mason Davis',     role: 'EMPLOYEE', section: 'front',      jobs: ['Host'],              hourlyPay: 13, phone: '555-0113', email: 'mason@coastalkitchen.demo' },
  { index: 14, name: 'Emma Wilson',     role: 'EMPLOYEE', section: 'front',      jobs: ['Host'],              hourlyPay: 13, phone: '555-0114', email: 'emma@coastalkitchen.demo' },
  { index: 15, name: 'Aiden Taylor',    role: 'EMPLOYEE', section: 'front',      jobs: ['Host', 'Busser'],    hourlyPay: 13, phone: '555-0115', email: 'aiden@coastalkitchen.demo' },
  // Bussers (2)
  { index: 16, name: 'Chloe Anderson',  role: 'EMPLOYEE', section: 'front',      jobs: ['Busser'],            hourlyPay: 12, phone: '555-0116', email: 'chloe@coastalkitchen.demo' },
  { index: 17, name: 'James Lee',       role: 'EMPLOYEE', section: 'front',      jobs: ['Busser'],            hourlyPay: 12, phone: '555-0117', email: 'james@coastalkitchen.demo' },
  // Dishwashers (2)
  { index: 18, name: 'Daniel Clark',    role: 'EMPLOYEE', section: 'kitchen',    jobs: ['Dishwasher'],        hourlyPay: 14, phone: '555-0118', email: 'daniel@coastalkitchen.demo' },
  { index: 19, name: 'Mia Robinson',    role: 'EMPLOYEE', section: 'kitchen',    jobs: ['Dishwasher'],        hourlyPay: 14, phone: '555-0119', email: 'mia@coastalkitchen.demo' },
  // Cooks (3)
  { index: 20, name: 'William Harris',  role: 'EMPLOYEE', section: 'kitchen',    jobs: ['Cook'],              hourlyPay: 19, phone: '555-0120', email: 'william@coastalkitchen.demo' },
  { index: 21, name: 'Charlotte Lopez', role: 'EMPLOYEE', section: 'kitchen',    jobs: ['Cook'],              hourlyPay: 19, phone: '555-0121', email: 'charlotte@coastalkitchen.demo' },
  { index: 22, name: 'Benjamin Wright', role: 'EMPLOYEE', section: 'kitchen',    jobs: ['Cook'],              hourlyPay: 18, phone: '555-0122', email: 'benjamin@coastalkitchen.demo' },
];

function seedToEmployee(s: EmployeeSeed): Employee {
  return {
    id: eid(s.index),
    name: s.name,
    section: s.section,
    userRole: s.role,
    restaurantId: ORG_ID,
    profile: { phone: s.phone, email: s.email },
    isActive: true,
    jobs: s.jobs,
    hourlyPay: s.hourlyPay,
    email: s.email,
    phone: s.phone,
    employeeNumber: s.index,
  };
}

export const DEMO_EMPLOYEES: Employee[] = EMPLOYEE_SEEDS.map(seedToEmployee);

// ---------------------------------------------------------------------------
// Mock admin user (the person "viewing" the demo)
// ---------------------------------------------------------------------------

export const DEMO_CURRENT_USER: UserProfile = {
  id: eid(1),
  authUserId: AUTH_USER_ID,
  organizationId: ORG_ID,
  email: 'alex@coastalkitchen.demo',
  phone: '555-0101',
  fullName: 'Alex Rivera',
  role: 'ADMIN',
  jobs: ['Manager'],
  hourlyPay: 28,
  employeeNumber: 1,
};

export const DEMO_ACCESSIBLE_RESTAURANTS = [
  { id: ORG_ID, name: 'Coastal Kitchen', restaurantCode: 'COASTALDEMO', role: 'ADMIN' },
];

// ---------------------------------------------------------------------------
// Shift generation — realistic weekly schedule
// ---------------------------------------------------------------------------

type ShiftTemplate = {
  job: string;
  startHour: number;
  endHour: number;
};

// Typical shift patterns
const AM_SERVER: ShiftTemplate    = { job: 'Server',     startHour: 10,    endHour: 16 };
const PM_SERVER: ShiftTemplate    = { job: 'Server',     startHour: 16,    endHour: 23 };
const FULL_SERVER: ShiftTemplate  = { job: 'Server',     startHour: 11,    endHour: 21 };
const AM_HOST: ShiftTemplate      = { job: 'Host',       startHour: 10,    endHour: 16 };
const PM_HOST: ShiftTemplate      = { job: 'Host',       startHour: 16,    endHour: 23 };
const AM_BARTENDER: ShiftTemplate = { job: 'Bartender',  startHour: 11,    endHour: 17 };
const PM_BARTENDER: ShiftTemplate = { job: 'Bartender',  startHour: 16,    endHour: 23 };
const CLOSE_BARTENDER: ShiftTemplate = { job: 'Bartender', startHour: 17, endHour: 23 };
const AM_BUSSER: ShiftTemplate    = { job: 'Busser',     startHour: 10,    endHour: 16 };
const PM_BUSSER: ShiftTemplate    = { job: 'Busser',     startHour: 16,    endHour: 23 };
const AM_DISH: ShiftTemplate      = { job: 'Dishwasher', startHour: 10,    endHour: 17 };
const PM_DISH: ShiftTemplate      = { job: 'Dishwasher', startHour: 15,    endHour: 23 };
const AM_COOK: ShiftTemplate      = { job: 'Cook',       startHour: 9,     endHour: 16 };
const PM_COOK: ShiftTemplate      = { job: 'Cook',       startHour: 14,    endHour: 23 };
const FULL_COOK: ShiftTemplate    = { job: 'Cook',       startHour: 10,    endHour: 20 };
const MGR_OPEN: ShiftTemplate     = { job: 'Manager',    startHour: 9,     endHour: 17 };
const MGR_CLOSE: ShiftTemplate    = { job: 'Manager',    startHour: 15,    endHour: 23 };
const MGR_MID: ShiftTemplate      = { job: 'Manager',    startHour: 11,    endHour: 20 };

/**
 * Schedule matrix: dayIndex 0 = Monday … 6 = Sunday.
 * Each entry: [employeeIndex, shiftTemplate, scheduleState]
 */
type ShiftAssignment = [number, ShiftTemplate, 'published' | 'draft'];

// prettier-ignore
const WEEKLY_SCHEDULE: Record<number, ShiftAssignment[]> = {
  // MONDAY (lighter)
  0: [
    [1,  MGR_OPEN,       'published'],
    [3,  MGR_CLOSE,      'published'],
    [4,  AM_SERVER,      'published'],
    [5,  PM_SERVER,      'published'],
    [6,  FULL_SERVER,    'published'],
    [8,  PM_SERVER,      'published'],
    [10, PM_BARTENDER,   'published'],
    [13, AM_HOST,        'published'],
    [14, PM_HOST,        'published'],
    [16, AM_BUSSER,      'published'],
    [18, AM_DISH,        'published'],
    [19, PM_DISH,        'published'],
    [20, AM_COOK,        'published'],
    [21, PM_COOK,        'published'],
  ],
  // TUESDAY (lighter)
  1: [
    [2,  MGR_OPEN,       'published'],
    [1,  MGR_CLOSE,      'published'],
    [4,  PM_SERVER,      'published'],
    [7,  AM_SERVER,      'published'],
    [9,  PM_SERVER,      'published'],
    [6,  AM_SERVER,      'published'],
    [11, PM_BARTENDER,   'published'],
    [13, PM_HOST,        'published'],
    [15, AM_HOST,        'published'],
    [17, PM_BUSSER,      'published'],
    [18, PM_DISH,        'published'],
    [20, FULL_COOK,      'published'],
    [22, PM_COOK,        'published'],
  ],
  // WEDNESDAY
  2: [
    [1,  MGR_OPEN,       'published'],
    [2,  MGR_CLOSE,      'published'],
    [4,  AM_SERVER,      'published'],
    [5,  PM_SERVER,      'published'],
    [7,  AM_SERVER,      'published'],
    [8,  PM_SERVER,      'published'],
    [9,  PM_SERVER,      'published'],
    [10, AM_BARTENDER,   'published'],
    [11, PM_BARTENDER,   'published'],
    [13, AM_HOST,        'published'],
    [14, PM_HOST,        'published'],
    [16, AM_BUSSER,      'published'],
    [17, PM_BUSSER,      'published'],
    [18, AM_DISH,        'published'],
    [19, PM_DISH,        'published'],
    [20, AM_COOK,        'published'],
    [21, PM_COOK,        'published'],
    [22, FULL_COOK,      'published'],
  ],
  // THURSDAY
  3: [
    [3,  MGR_OPEN,       'published'],
    [1,  MGR_CLOSE,      'published'],
    [4,  PM_SERVER,      'published'],
    [5,  AM_SERVER,      'published'],
    [6,  PM_SERVER,      'published'],
    [7,  PM_SERVER,      'published'],
    [8,  AM_SERVER,      'published'],
    [10, PM_BARTENDER,   'published'],
    [12, CLOSE_BARTENDER,'published'],
    [13, AM_HOST,        'published'],
    [15, PM_HOST,        'published'],
    [16, PM_BUSSER,      'published'],
    [17, AM_BUSSER,      'published'],
    [18, AM_DISH,        'published'],
    [19, PM_DISH,        'published'],
    [20, PM_COOK,        'published'],
    [21, AM_COOK,        'published'],
    [22, PM_COOK,        'published'],
  ],
  // FRIDAY (heavier)
  4: [
    [1,  MGR_OPEN,       'published'],
    [2,  MGR_CLOSE,      'published'],
    [3,  MGR_MID,        'published'],
    [4,  AM_SERVER,      'published'],
    [5,  PM_SERVER,      'published'],
    [6,  AM_SERVER,      'published'],
    [7,  PM_SERVER,      'published'],
    [8,  PM_SERVER,      'published'],
    [9,  AM_SERVER,      'published'],
    [10, AM_BARTENDER,   'published'],
    [11, PM_BARTENDER,   'published'],
    [12, CLOSE_BARTENDER,'published'],
    [13, AM_HOST,        'published'],
    [14, PM_HOST,        'published'],
    [15, PM_HOST,        'published'],
    [16, AM_BUSSER,      'published'],
    [17, PM_BUSSER,      'published'],
    [18, AM_DISH,        'published'],
    [19, PM_DISH,        'published'],
    [20, AM_COOK,        'published'],
    [21, PM_COOK,        'published'],
    [22, FULL_COOK,      'published'],
  ],
  // SATURDAY (heaviest)
  5: [
    [1,  MGR_OPEN,       'published'],
    [3,  MGR_CLOSE,      'published'],
    [2,  MGR_MID,        'published'],
    [4,  AM_SERVER,      'published'],
    [5,  PM_SERVER,      'published'],
    [6,  PM_SERVER,      'published'],
    [7,  AM_SERVER,      'published'],
    [8,  PM_SERVER,      'published'],
    [9,  FULL_SERVER,    'published'],
    [10, AM_BARTENDER,   'published'],
    [11, PM_BARTENDER,   'published'],
    [12, PM_BARTENDER,   'published'],
    [13, AM_HOST,        'published'],
    [14, PM_HOST,        'published'],
    [15, AM_HOST,        'published'],
    [16, AM_BUSSER,      'published'],
    [17, PM_BUSSER,      'published'],
    [18, AM_DISH,        'published'],
    [19, PM_DISH,        'published'],
    [20, AM_COOK,        'published'],
    [21, PM_COOK,        'published'],
    [22, FULL_COOK,      'published'],
  ],
  // SUNDAY
  6: [
    [2,  MGR_OPEN,       'published'],
    [3,  MGR_CLOSE,      'published'],
    [4,  FULL_SERVER,    'published'],
    [5,  AM_SERVER,      'published'],
    [6,  PM_SERVER,      'published'],
    [9,  PM_SERVER,      'published'],
    [10, PM_BARTENDER,   'published'],
    [12, AM_BARTENDER,   'published'],
    [14, AM_HOST,        'published'],
    [15, PM_HOST,        'published'],
    [16, PM_BUSSER,      'published'],
    [18, AM_DISH,        'published'],
    [19, PM_DISH,        'published'],
    [20, FULL_COOK,      'published'],
    [22, PM_COOK,        'published'],
  ],
};

/** Generate all shifts for the current week (Monday-based). */
function generateShifts(): Shift[] {
  const monday = getCurrentWeekMonday();
  const shifts: Shift[] = [];
  let counter = 1;

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const date = addDays(monday, dayIndex);
    const dateStr = fmt(date);
    const assignments = WEEKLY_SCHEDULE[dayIndex] ?? [];

    for (const [empIndex, template, state] of assignments) {
      const employee = EMPLOYEE_SEEDS.find((s) => s.index === empIndex);
      if (!employee) continue;

      shifts.push({
        id: sid(counter),
        employeeId: eid(empIndex),
        restaurantId: ORG_ID,
        date: dateStr,
        startHour: template.startHour,
        endHour: template.endHour,
        job: template.job,
        locationId: LOCATION_ID,
        scheduleState: state,
        payRate: employee.hourlyPay,
        paySource: 'hourly_pay',
        notes: '',
        isBlocked: false,
      });
      counter++;
    }
  }

  return shifts;
}

export const DEMO_SHIFTS: Shift[] = generateShifts();

// ---------------------------------------------------------------------------
// Time-off / Blocked days (a couple for realism)
// ---------------------------------------------------------------------------

const monday = getCurrentWeekMonday();

export const DEMO_TIME_OFF_REQUESTS: TimeOffRequest[] = [
  {
    id: 'demo-to-001',
    employeeId: eid(7), // Liam O'Brien
    organizationId: ORG_ID,
    startDate: fmt(addDays(monday, 5)), // Saturday
    endDate: fmt(addDays(monday, 6)),   // Sunday
    reason: 'Family wedding',
    status: 'APPROVED',
    createdAt: new Date().toISOString(),
    reviewedBy: eid(1),
    reviewedAt: new Date().toISOString(),
  },
  {
    id: 'demo-to-002',
    employeeId: eid(11), // Lucas Garcia
    organizationId: ORG_ID,
    startDate: fmt(addDays(monday, 2)), // Wednesday
    endDate: fmt(addDays(monday, 2)),   // Wednesday
    reason: 'Doctor appointment',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  },
];

export const DEMO_BLOCKED_DAY_REQUESTS: BlockedDayRequest[] = [];

// ---------------------------------------------------------------------------
// Misc mock data
// ---------------------------------------------------------------------------

export const DEMO_DROP_REQUESTS: DropShiftRequest[] = [];
export const DEMO_CHAT_MESSAGES: ChatMessage[] = [];
export const DEMO_LOCATIONS: Location[] = [DEMO_LOCATION];

// ---------------------------------------------------------------------------
// Aggregate export for easy consumption
// ---------------------------------------------------------------------------

export const DEMO_DATA = {
  orgId: ORG_ID,
  authUserId: AUTH_USER_ID,
  restaurant: DEMO_RESTAURANT,
  location: DEMO_LOCATION,
  locations: DEMO_LOCATIONS,
  employees: DEMO_EMPLOYEES,
  shifts: DEMO_SHIFTS,
  timeOffRequests: DEMO_TIME_OFF_REQUESTS,
  blockedDayRequests: DEMO_BLOCKED_DAY_REQUESTS,
  businessHours: DEMO_BUSINESS_HOURS,
  coreHours: DEMO_CORE_HOURS,
  scheduleViewSettings: DEMO_SCHEDULE_VIEW_SETTINGS,
  currentUser: DEMO_CURRENT_USER,
  accessibleRestaurants: DEMO_ACCESSIBLE_RESTAURANTS,
  dropRequests: DEMO_DROP_REQUESTS,
  chatMessages: DEMO_CHAT_MESSAGES,
} as const;
