import type { Employee, Shift, JOB_OPTIONS } from '../../types';
import { JOB_OPTIONS as JOB_OPTIONS_LIST } from '../../types';
import { getJobColorClasses } from '../../lib/jobColors';
import { formatHour } from '../../utils/timeUtils';
import { supabase } from '../../lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AMPMClassification = 'AM' | 'PM';

export interface DailyStats {
  total: number;
  amCount: number;
  pmCount: number;
  doublesCount: number;
  estLaborCost: number;
}

export interface EmployeeJobGroup {
  job: string;
  color: string;
  bgColor: string;
  employees: Employee[];
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

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

function isValidJob(value: unknown): value is string {
  if (!value) return false;
  return JOB_OPTIONS_LIST.includes(String(value) as (typeof JOB_OPTIONS)[number]);
}

function toYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Shift classification
// ---------------------------------------------------------------------------

/** Returns 'AM' if the shift starts before 2 PM (14:00), 'PM' otherwise. */
export function classifyShift(startHour: number): AMPMClassification {
  return startHour < 14 ? 'AM' : 'PM';
}

/** True when an employee has at least one AM and at least one PM shift on the given date. */
export function isDoubleShift(employeeId: string, shifts: Shift[]): boolean {
  let hasAM = false;
  let hasPM = false;
  for (const shift of shifts) {
    if (shift.employeeId !== employeeId) continue;
    if (shift.isBlocked) continue;
    if (classifyShift(shift.startHour) === 'AM') hasAM = true;
    else hasPM = true;
    if (hasAM && hasPM) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Filter shifts to published-only for a specific date. Excludes blocked shifts. */
export function getPublishedShiftsForDate(shifts: Shift[], date: string): Shift[] {
  return shifts.filter(
    (s) => s.date === date && s.scheduleState === 'published' && !s.isBlocked
  );
}

/** Filter shifts to published-only within a date range (inclusive). Excludes blocked. */
export function getPublishedShiftsForWeek(shifts: Shift[], startDate: string, endDate: string): Shift[] {
  return shifts.filter(
    (s) =>
      s.date >= startDate &&
      s.date <= endDate &&
      s.scheduleState === 'published' &&
      !s.isBlocked
  );
}

// ---------------------------------------------------------------------------
// Supabase direct fetch — guarantees all 7 days for weekly report
// ---------------------------------------------------------------------------

/**
 * Fetches published, non-blocked shifts directly from Supabase for a date range.
 * Used by the Weekly Grid report to ensure all days of the week are available,
 * since the Zustand store may only have the currently viewed day loaded.
 */
export async function fetchPublishedShiftsForWeek(
  restaurantId: string,
  startDate: string,
  endDate: string
): Promise<{ shifts: Shift[]; error: string | null }> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('organization_id', restaurantId)
    .eq('schedule_state', 'published')
    .gte('shift_date', startDate)
    .lte('shift_date', endDate);

  if (error) {
    return { shifts: [], error: error.message };
  }

  const shifts: Shift[] = (data || [])
    .filter((row: Record<string, unknown>) => !row.is_blocked)
    .map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      employeeId: String(row.user_id ?? ''),
      restaurantId: String(row.organization_id ?? ''),
      date: String(row.shift_date ?? ''),
      startHour: parseTimeToDecimal(row.start_time as string | number | null),
      endHour: parseTimeToDecimal(row.end_time as string | number | null),
      notes: row.notes != null ? String(row.notes) : undefined,
      isBlocked: false,
      job: isValidJob(row.job) ? String(row.job) : undefined,
      locationId: row.location_id != null ? String(row.location_id) : null,
      payRate: row.pay_rate != null ? Number(row.pay_rate) : undefined,
      paySource: row.pay_source != null ? String(row.pay_source) : undefined,
      scheduleState: 'published' as const,
    }));

  return { shifts, error: null };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Groups employees by their primary job (from their shifts).
 * Returns groups in JOB_OPTIONS order, with an "Unassigned" group at the end.
 * Only includes employees who have at least one shift in the provided set.
 */
export function groupEmployeesByJob(
  employees: Employee[],
  shifts: Shift[]
): EmployeeJobGroup[] {
  // Determine each employee's primary job from their earliest shift
  const employeePrimaryJob = new Map<string, string>();
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  // Collect which employees actually have shifts
  const employeesWithShifts = new Set<string>();
  shifts.forEach((shift) => {
    employeesWithShifts.add(shift.employeeId);
    const existing = employeePrimaryJob.get(shift.employeeId);
    if (!existing && shift.job) {
      employeePrimaryJob.set(shift.employeeId, shift.job);
    }
  });

  // Build groups
  const groupMap = new Map<string, Employee[]>();
  employeesWithShifts.forEach((empId) => {
    const emp = employeeMap.get(empId);
    if (!emp || !emp.isActive) return;
    const job = employeePrimaryJob.get(empId) ?? 'Unassigned';
    if (!groupMap.has(job)) groupMap.set(job, []);
    groupMap.get(job)!.push(emp);
  });

  // Sort employees within groups alphabetically
  groupMap.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

  // Build result in JOB_OPTIONS order
  const result: EmployeeJobGroup[] = [];
  const jobList: string[] = [...JOB_OPTIONS_LIST];

  for (const job of jobList) {
    const emps = groupMap.get(job);
    if (!emps || emps.length === 0) continue;
    const colors = getJobColorClasses(job);
    result.push({
      job,
      color: colors.color,
      bgColor: colors.bgColor,
      employees: emps,
    });
    groupMap.delete(job);
  }

  // Remaining groups (custom jobs or "Unassigned")
  groupMap.forEach((emps, job) => {
    if (emps.length === 0) return;
    const colors = getJobColorClasses(job);
    result.push({
      job,
      color: colors.color,
      bgColor: colors.bgColor,
      employees: emps,
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Calculate summary stats for a single day's report. */
export function calculateDailyStats(
  employees: Employee[],
  shifts: Shift[]
): DailyStats {
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const amEmployees = new Set<string>();
  const pmEmployees = new Set<string>();
  let estLaborCost = 0;

  for (const shift of shifts) {
    if (shift.isBlocked) continue;
    const period = classifyShift(shift.startHour);
    if (period === 'AM') amEmployees.add(shift.employeeId);
    else pmEmployees.add(shift.employeeId);

    const hours = Math.max(0, shift.endHour - shift.startHour);
    const rate = shift.payRate ?? employeeMap.get(shift.employeeId)?.hourlyPay ?? 0;
    estLaborCost += hours * rate;
  }

  const allEmployees = new Set([...amEmployees, ...pmEmployees]);
  let doublesCount = 0;
  allEmployees.forEach((id) => {
    if (amEmployees.has(id) && pmEmployees.has(id)) doublesCount++;
  });

  return {
    total: allEmployees.size,
    amCount: amEmployees.size,
    pmCount: pmEmployees.size,
    doublesCount,
    estLaborCost: Math.round(estLaborCost * 100) / 100,
  };
}

/** Calculate total hours for one employee across a set of shifts. */
export function calculateWeeklyHours(employeeId: string, shifts: Shift[]): number {
  let total = 0;
  for (const shift of shifts) {
    if (shift.employeeId !== employeeId) continue;
    if (shift.isBlocked) continue;
    total += Math.max(0, shift.endHour - shift.startHour);
  }
  return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------------------
// Date formatters for report headers
// ---------------------------------------------------------------------------

export function formatReportDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatReportTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatReportWeekRange(startDate: Date, endDate: Date): string {
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = endDate.getFullYear();
  return `${startStr} \u2013 ${endStr}, ${year}`;
}

/** Format a decimal hour (e.g. 9.5) as "9:30a" style for reports. */
export function formatHourForReport(hour: number, options?: { isEnd?: boolean }): string {
  const isEnd = options?.isEnd ?? false;
  if (isEnd && (hour === 24 || hour === 0)) {
    return 'Close';
  }
  return formatHour(hour);
}

/** Format a decimal hour (e.g. 9.5) as "9:30 AM" with Close support. */
export function formatTimeLabel(hour: number, options?: { isEnd?: boolean }): string {
  if (!Number.isFinite(hour)) return '\u2014';
  const isEnd = options?.isEnd ?? false;
  if (isEnd && (hour === 24 || hour === 0)) {
    return 'Close';
  }
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const minutes = m.toString().padStart(2, '0');
  return `${displayHour}:${minutes} ${period}`;
}

/** Format a phone number into (###) ###-#### or return an em dash. */
export function formatPhoneStrict(value?: string | number | null): string {
  if (value == null) return '\u2014';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 10) return '\u2014';
  const area = digits.slice(0, 3);
  const mid = digits.slice(3, 6);
  const last = digits.slice(6);
  return `(${area}) ${mid}-${last}`;
}

// ---------------------------------------------------------------------------
// Print window launcher
// ---------------------------------------------------------------------------

/** Opens a new browser window, writes the full HTML document, and triggers print. */
export function renderReportToWindow(
  html: string,
  title: string,
  options?: { autoPrint?: boolean }
): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print reports.');
    return;
  }
  printWindow.document.title = title;
  printWindow.document.write(html);
  printWindow.document.close();
  const shouldAutoPrint = options?.autoPrint !== false;
  if (shouldAutoPrint) {
    // Wait for content to render before triggering print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 50);
    };
  }
}

// Re-export formatHour for use in report renderers
export { formatHour } from '../../utils/timeUtils';
export { getJobColorClasses, getJobColorKey } from '../../lib/jobColors';
export type { JobColorConfig, JobColorKey } from '../../lib/jobColors';
