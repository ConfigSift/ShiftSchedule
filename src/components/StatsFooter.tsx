'use client';

import { useMemo } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS, Section } from '../types';
import { Clock, Users, DollarSign } from 'lucide-react';
import { getWeekDates, dateToString } from '../utils/timeUtils';
import { getUserRole, isManagerRole } from '../utils/role';

export function StatsFooter() {
  const {
    selectedDate,
    viewMode,
    selectedEmployeeIds,
    shifts,      // Subscribe directly to shifts for reactivity
    employees,   // Subscribe directly to employees for reactivity
  } = useScheduleStore();
  const { activeRestaurantId, currentUser } = useAuthStore();

  // Filter to restaurant scope - these will recompute when shifts/employees change
  const scopedEmployees = useMemo(() =>
    activeRestaurantId ? employees.filter((e) => e.restaurantId === activeRestaurantId) : [],
    [employees, activeRestaurantId]
  );
  const scopedShifts = useMemo(() =>
    activeRestaurantId ? shifts.filter((s) => s.restaurantId === activeRestaurantId) : [],
    [shifts, activeRestaurantId]
  );
  const activeEmployees = useMemo(() => 
    scopedEmployees.filter((e) => e.isActive),
    [scopedEmployees]
  );

  const role = getUserRole(currentUser?.role);
  const isManager = isManagerRole(role);
  const isEmployee = role === 'EMPLOYEE';

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const dayString = selectedDate.toISOString().split('T')[0];
  const weekStart = dateToString(weekDates[0]);
  const weekEnd = dateToString(weekDates[6]);
  const monthStartDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEndDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
  const monthStart = dateToString(monthStartDate);
  const monthEnd = dateToString(monthEndDate);
  const rangeStart =
    viewMode === 'week' ? weekStart : viewMode === 'month' ? monthStart : dayString;
  const rangeEnd =
    viewMode === 'week' ? weekEnd : viewMode === 'month' ? monthEnd : dayString;

  const myEmployeeId = isEmployee ? currentUser?.id ?? null : null;

  const relevantShifts = useMemo(() => {
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
  }, [scopedShifts, rangeStart, rangeEnd, viewMode, isEmployee, myEmployeeId, selectedEmployeeIds]);

  const totalHours = useMemo(() => 
    relevantShifts.reduce((sum, shift) => sum + (shift.endHour - shift.startHour), 0),
    [relevantShifts]
  );
  
  const workingCount = useMemo(() => 
    new Set(relevantShifts.map((s) => s.employeeId)).size,
    [relevantShifts]
  );

  const shiftsBySection = useMemo(() => 
    relevantShifts.reduce((acc, shift) => {
      const employee = scopedEmployees.find((e) => e.id === shift.employeeId);
      if (employee) {
        acc[employee.section] = (acc[employee.section] || 0) + 1;
      }
      return acc;
    }, {} as Record<Section, number>),
    [relevantShifts, scopedEmployees]
  );

  // Calculate estimated labor cost using shift.payRate (from DB) or fallback to employee rates
  const { estimatedCost, missingPayCount } = useMemo(() => {
    let total = 0;
    let missing = 0;

    relevantShifts.forEach((shift) => {
      const hours = shift.endHour - shift.startHour;
      let rate = 0;
      let foundRate = false;

      // Primary: use payRate from shift (set by DB trigger)
      if (shift.payRate !== undefined && shift.payRate > 0) {
        rate = shift.payRate;
        foundRate = true;
      } else {
        // Fallback: look up from employee data
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
          `[StatsFooter] Missing pay rate for shift ${shift.id}, employee ${employee?.name ?? shift.employeeId}, job: ${shift.job ?? 'none'}`
        );
        missing++;
      }

      total += hours * rate;
    });

    return { estimatedCost: total, missingPayCount: missing };
  }, [relevantShifts, scopedEmployees]);

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-12 sm:h-14 bg-theme-secondary border-t border-theme-primary flex items-center px-3 sm:px-6 gap-3 sm:gap-8 shrink-0 transition-theme z-40">
      {/* Hours - always visible */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
        </div>
        <div>
          <p className="text-[10px] sm:text-xs text-theme-muted leading-tight">{isEmployee ? 'My Hours' : 'Total Hours'}</p>
          <p className="text-xs sm:text-sm font-semibold text-theme-primary">{totalHours}h</p>
        </div>
      </div>

      {/* Staff Working - always visible */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
        </div>
        <div>
          <p className="text-[10px] sm:text-xs text-theme-muted leading-tight">Staff</p>
          <p className="text-xs sm:text-sm font-semibold text-theme-primary">
            {workingCount}/{activeEmployees.length}
          </p>
        </div>
      </div>

      {/* Section breakdown - hidden on mobile */}
      <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-theme-tertiary rounded-lg">
        {(Object.keys(SECTIONS) as Section[]).map(section => {
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

      {/* Labor Cost - manager only, hidden on small screens */}
      {!isEmployee && (
        <>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-500/10 flex items-center justify-center relative">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
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
              <p className="text-[10px] sm:text-xs text-theme-muted leading-tight">Est. Labor</p>
              <p className="text-xs sm:text-sm font-semibold text-theme-primary">
                ${estimatedCost.toFixed(0)}
              </p>
            </div>
          </div>
        </>
      )}
    </footer>
  );
}
