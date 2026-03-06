import { Shift } from '../types';

export interface HourlyCoverage {
  hour: number;
  staffCount: number;
  employeeIds: string[];
}

export interface CoverageStats {
  totalStaffedHours: number;
  hoursAboveMinimum: number;
  gapHours: number;
  coveragePercent: number;
  peakStaff: number;
  peakHour: number;
}

/**
 * For each integer hour in [startHour, endHour), count distinct employees whose
 * shift covers that hour (shift.startHour <= hour < shift.endHour).
 */
export function calculateHourlyCoverage(
  shifts: Shift[],
  date: string,
  startHour: number,
  endHour: number,
): HourlyCoverage[] {
  const dateShifts = shifts.filter((s) => s.date === date && !s.isBlocked);
  const result: HourlyCoverage[] = [];

  for (let hour = startHour; hour < endHour; hour++) {
    const seen = new Set<string>();
    for (const shift of dateShifts) {
      if (shift.startHour <= hour && shift.endHour > hour) {
        seen.add(shift.employeeId);
      }
    }
    result.push({ hour, staffCount: seen.size, employeeIds: [...seen] });
  }

  return result;
}

/**
 * Aggregate per-hour coverage into summary stats.
 * coveragePercent = (hoursAboveMinimum / totalStaffedHours) * 100
 */
export function calculateDayCoverageStats(
  hourlyCoverage: HourlyCoverage[],
  minimumStaff: number,
): CoverageStats {
  let totalStaffedHours = 0;
  let hoursAboveMinimum = 0;
  let peakStaff = 0;
  let peakHour = hourlyCoverage[0]?.hour ?? 0;

  for (const { hour, staffCount } of hourlyCoverage) {
    if (staffCount > 0) {
      totalStaffedHours++;
      if (staffCount > peakStaff) {
        peakStaff = staffCount;
        peakHour = hour;
      }
    }
    if (staffCount >= minimumStaff) {
      hoursAboveMinimum++;
    }
  }

  const gapHours = totalStaffedHours - hoursAboveMinimum;
  const coveragePercent =
    totalStaffedHours > 0 ? (hoursAboveMinimum / totalStaffedHours) * 100 : 0;

  return { totalStaffedHours, hoursAboveMinimum, gapHours, coveragePercent, peakStaff, peakHour };
}

/**
 * Compute hourly coverage for each date in weekDates (YYYY-MM-DD strings).
 */
export function calculateWeekCoverage(
  shifts: Shift[],
  weekDates: string[],
  startHour: number,
  endHour: number,
): Record<string, HourlyCoverage[]> {
  const result: Record<string, HourlyCoverage[]> = {};
  for (const date of weekDates) {
    result[date] = calculateHourlyCoverage(shifts, date, startHour, endHour);
  }
  return result;
}
