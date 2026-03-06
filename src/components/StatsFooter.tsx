'use client';

import { useMemo } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS, Section } from '../types';
import { Clock, Users, DollarSign, Percent } from 'lucide-react';
import { getWeekDates, dateToString } from '../utils/timeUtils';
import { getUserRole } from '../utils/role';
import { calculateHourlyCoverage, calculateDayCoverageStats } from '../utils/coverageUtils';


type StatsFooterProps = {
  compact?: boolean;
};

export function StatsFooter({ compact = false }: StatsFooterProps) {
  const {
    selectedDate,
    viewMode,
    selectedEmployeeIds,
    employees,
    shifts,
    scheduleViewSettings,
    getShiftsForRestaurant,
  } = useScheduleStore();
  const { activeRestaurantId, currentUser } = useAuthStore();

  const scopedEmployees = useMemo(
    () => (activeRestaurantId ? employees.filter((e) => e.restaurantId === activeRestaurantId) : []),
    [employees, activeRestaurantId],
  );
  const activeEmployees = useMemo(() => scopedEmployees.filter((e) => e.isActive), [scopedEmployees]);

  const role = getUserRole(currentUser?.role);
  const isEmployee = role === 'EMPLOYEE';

  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';
  const weekDates = useMemo(() => getWeekDates(selectedDate, weekStartDay), [selectedDate, weekStartDay]);
  const dayString = dateToString(selectedDate);
  const weekStart = dateToString(weekDates[0]);
  const weekEnd = dateToString(weekDates[6]);
  const monthStartDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEndDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
  const monthStart = dateToString(monthStartDate);
  const monthEnd = dateToString(monthEndDate);
  const rangeStart = viewMode === 'week' ? weekStart : viewMode === 'month' ? monthStart : dayString;
  const rangeEnd = viewMode === 'week' ? weekEnd : viewMode === 'month' ? monthEnd : dayString;

  const myEmployeeId = isEmployee ? currentUser?.id ?? null : null;

  const relevantShifts = useMemo(() => {
    const scopedShifts = activeRestaurantId ? getShiftsForRestaurant(activeRestaurantId) : [];
    void shifts;
    return scopedShifts.filter((shift) => {
      if (shift.isBlocked) return false;
      const inRange =
        viewMode === 'month'
          ? shift.date >= rangeStart && shift.date < rangeEnd
          : shift.date >= rangeStart && shift.date <= rangeEnd;
      if (!inRange) return false;
      if (isEmployee) {
        if (!myEmployeeId) return false;
        return shift.employeeId === myEmployeeId;
      }
      if (selectedEmployeeIds.length === 0) {
        return true;
      }
      return selectedEmployeeIds.includes(shift.employeeId);
    });
  }, [
    activeRestaurantId,
    getShiftsForRestaurant,
    isEmployee,
    myEmployeeId,
    rangeEnd,
    rangeStart,
    selectedEmployeeIds,
    shifts,
    viewMode,
  ]);

  const totalHours = useMemo(
    () => relevantShifts.reduce((sum, shift) => sum + (shift.endHour - shift.startHour), 0),
    [relevantShifts],
  );

  const workingCount = useMemo(() => new Set(relevantShifts.map((s) => s.employeeId)).size, [relevantShifts]);

  const shiftsBySection = useMemo(
    () =>
      relevantShifts.reduce((acc, shift) => {
        const employee = scopedEmployees.find((e) => e.id === shift.employeeId);
        if (employee) {
          acc[employee.section] = (acc[employee.section] || 0) + 1;
        }
        return acc;
      }, {} as Record<Section, number>),
    [relevantShifts, scopedEmployees],
  );

  const { estimatedCost, missingPayCount } = useMemo(() => {
    let total = 0;
    let missing = 0;

    relevantShifts.forEach((shift) => {
      const hours = shift.endHour - shift.startHour;
      let rate = 0;
      let foundRate = false;

      if (shift.payRate !== undefined && shift.payRate > 0) {
        rate = shift.payRate;
        foundRate = true;
      } else {
        const employee = scopedEmployees.find((emp) => emp.id === shift.employeeId);

        if (shift.job && employee?.jobPay && employee.jobPay[shift.job] !== undefined) {
          rate = employee.jobPay[shift.job];
          foundRate = true;
        } else if (employee?.jobPay && employee.jobs && employee.jobs.length > 0) {
          const firstJob = employee.jobs[0];
          if (employee.jobPay[firstJob] !== undefined) {
            rate = employee.jobPay[firstJob];
            foundRate = true;
          }
        }
      }

      if (!foundRate && process.env.NODE_ENV === 'development') {
        const employee = scopedEmployees.find((emp) => emp.id === shift.employeeId);
        console.warn(
          `[StatsFooter] Missing pay rate for shift ${shift.id}, employee ${employee?.name ?? shift.employeeId}, job: ${shift.job ?? 'none'}`,
        );
        missing++;
      }

      total += hours * rate;
    });

    return { estimatedCost: total, missingPayCount: missing };
  }, [relevantShifts, scopedEmployees]);

  const coverageEnabled = scheduleViewSettings?.coverageEnabled ?? false;

  const coverageInfo = useMemo(() => {
    if (!coverageEnabled) return null;
    if (viewMode === 'month') return null;
    if (relevantShifts.length === 0) return null;

    const minimumStaff = scheduleViewSettings?.minStaffPerHour ?? 5;
    const minStaffByHour = scheduleViewSettings?.minStaffByHour ?? {};
    const startHour = scheduleViewSettings?.hourMode === 'custom'
      ? scheduleViewSettings.customStartHour : 0;
    const endHour = scheduleViewSettings?.hourMode === 'custom'
      ? scheduleViewSettings.customEndHour : 24;

    type SparkBar = { staffed: boolean; covered: boolean };
    const bars: SparkBar[] = [];
    let totalStaffed = 0;
    let aboveMin = 0;
    let totalGap = 0;

    if (viewMode === 'week') {
      for (const date of weekDates) {
        const dateKey = dateToString(date);
        const hourly = calculateHourlyCoverage(relevantShifts, dateKey, startHour, endHour);
        const stats = calculateDayCoverageStats(hourly, minimumStaff, minStaffByHour);
        totalStaffed += stats.totalStaffedHours;
        aboveMin += stats.hoursAboveMinimum;
        totalGap += stats.gapHours;
        bars.push({ staffed: stats.totalStaffedHours > 0, covered: stats.coveragePercent >= 80 });
      }
    } else {
      const dateKey = dateToString(selectedDate);
      const hourly = calculateHourlyCoverage(relevantShifts, dateKey, startHour, endHour);
      const stats = calculateDayCoverageStats(hourly, minimumStaff, minStaffByHour);
      totalStaffed = stats.totalStaffedHours;
      aboveMin = stats.hoursAboveMinimum;
      totalGap = stats.gapHours;
      // sample ~8 bars
      const step = Math.max(1, Math.floor(hourly.length / 8));
      for (let i = 0; i < hourly.length && bars.length < 8; i += step) {
        const hourThreshold = minStaffByHour[hourly[i].hour] ?? minimumStaff;
        bars.push({ staffed: hourly[i].staffCount > 0, covered: hourly[i].staffCount >= hourThreshold });
      }
    }

    if (totalStaffed === 0) return null;
    return { percent: (aboveMin / totalStaffed) * 100, gapHours: totalGap, bars };
  }, [coverageEnabled, relevantShifts, scheduleViewSettings, selectedDate, viewMode, weekDates]);

  const footerClassName = compact
    ? 'fixed bottom-0 left-0 right-0 h-10 sm:h-11 bg-theme-secondary border-t border-theme-primary flex items-center px-2 sm:px-4 gap-2 sm:gap-5 shrink-0 transition-theme z-40'
    : 'fixed bottom-0 left-0 right-0 h-12 sm:h-14 bg-theme-secondary border-t border-theme-primary flex items-center px-3 sm:px-6 gap-3 sm:gap-8 shrink-0 transition-theme z-40';
  const iconWrapClassName = compact
    ? 'w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center'
    : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center';
  const iconClassName = compact ? 'w-3 h-3 sm:w-3.5 sm:h-3.5' : 'w-3.5 h-3.5 sm:w-4 sm:h-4';
  const labelClassName = compact
    ? 'text-[9px] sm:text-[10px] text-theme-muted leading-tight'
    : 'text-[10px] sm:text-xs text-theme-muted leading-tight';
  const valueClassName = compact
    ? 'text-[11px] sm:text-xs font-semibold text-theme-primary'
    : 'text-xs sm:text-sm font-semibold text-theme-primary';
  const sectionWrapClassName = compact
    ? 'hidden lg:flex items-center gap-2 px-3 py-1 bg-theme-tertiary rounded-lg'
    : 'hidden md:flex items-center gap-3 px-4 py-2 bg-theme-tertiary rounded-lg';

  return (
    <footer className={footerClassName}>
      <div className="flex items-center gap-2">
        <div className={`${iconWrapClassName} bg-blue-500/10`}>
          <Clock className={`${iconClassName} text-blue-400`} />
        </div>
        <div>
          <p className={labelClassName}>{isEmployee ? 'My Hours' : 'Total Hours'}</p>
          <p className={valueClassName}>{totalHours}h</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className={`${iconWrapClassName} bg-green-500/10`}>
          <Users className={`${iconClassName} text-green-400`} />
        </div>
        <div>
          <p className={labelClassName}>Staff</p>
          <p className={valueClassName}>
            {workingCount}/{activeEmployees.length}
          </p>
        </div>
      </div>

      {coverageEnabled && (
        <div className="flex items-center gap-2">
          <div className={`${iconWrapClassName} bg-amber-500/10`}>
            <Percent className={`${iconClassName} text-amber-400`} />
          </div>
          <div>
            <p className={labelClassName}>Coverage</p>
            {coverageInfo === null ? (
              <p className={valueClassName}>-</p>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="flex items-end gap-[1.5px] h-[13px]" aria-hidden>
                  {coverageInfo.bars.map((bar, i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-[1px]"
                      style={{
                        height: bar.staffed ? (bar.covered ? '100%' : '60%') : '20%',
                        backgroundColor: bar.staffed
                          ? bar.covered ? '#4ade80' : '#f87171'
                          : 'rgba(156,163,175,0.2)',
                      }}
                    />
                  ))}
                </div>
                <span className={valueClassName}>{Math.round(coverageInfo.percent)}%</span>
                {coverageInfo.gapHours > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] text-red-400 font-medium whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {coverageInfo.gapHours}h
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={sectionWrapClassName}>
        {(Object.keys(SECTIONS) as Section[]).map((section) => {
          const count = shiftsBySection[section] || 0;
          return (
            <div key={section} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SECTIONS[section].color }}
              />
              <span className="text-xs text-theme-tertiary">{count}</span>
            </div>
          );
        })}
      </div>

      {!isEmployee && (
        <>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-2">
            <div className={`${iconWrapClassName} bg-purple-500/10 relative`}>
              <DollarSign className={`${iconClassName} text-purple-400`} />
              {missingPayCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-zinc-900 text-[8px] font-bold rounded-full flex items-center justify-center"
                  title={`${missingPayCount} shift(s) missing pay rate`}
                >
                  !
                </span>
              )}
            </div>
            <div>
              <p className={labelClassName}>Est. Labor</p>
              <p className={valueClassName}>${estimatedCost.toFixed(0)}</p>
            </div>
          </div>
        </>
      )}
    </footer>
  );
}
