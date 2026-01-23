'use client';

import { useMemo } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { getUserRole } from '../utils/role';
import { dateToString, getWeekDates } from '../utils/timeUtils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView() {
  const {
    selectedDate,
    viewMode,
    selectedEmployeeIds,
    getShiftsForRestaurant,
    getEmployeesForRestaurant,
    setSelectedDate,
    setViewMode,
    hasOrgBlackoutOnDate,
    getBlockedRequestsForEmployee,
  } = useScheduleStore();
  const { activeRestaurantId, currentUser } = useAuthStore();

  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const scopedEmployees = getEmployeesForRestaurant(activeRestaurantId);
  const role = getUserRole(currentUser?.role);
  const isEmployee = role === 'EMPLOYEE';

  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());

  const weeks = useMemo(() => {
    const grid: Date[][] = [];
    const cursor = new Date(calendarStart);
    for (let week = 0; week < 6; week += 1) {
      const days: Date[] = [];
      for (let day = 0; day < 7; day += 1) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      grid.push(days);
    }
    return grid;
  }, [calendarStart]);

  const relevantShifts = useMemo(() => {
    if (!scopedShifts) return [];
    return scopedShifts.filter((shift) => {
      if (shift.isBlocked) return false;
      if (shift.date < dateToString(monthStart) || shift.date > dateToString(monthEnd)) return false;
      if (isEmployee) {
        if (!currentUser) return false;
        return shift.employeeId === currentUser.id;
      }
      if (selectedEmployeeIds.length === 0) return true;
      return selectedEmployeeIds.includes(shift.employeeId);
    });
  }, [
    scopedShifts,
    monthStart,
    monthEnd,
    isEmployee,
    currentUser,
    selectedEmployeeIds,
  ]);

  const shiftCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    relevantShifts.forEach((shift) => {
      counts[shift.date] = (counts[shift.date] || 0) + 1;
    });
    return counts;
  }, [relevantShifts]);

  const employeeBlocks = useMemo(() => {
    if (!currentUser) return [];
    return getBlockedRequestsForEmployee(currentUser.id);
  }, [currentUser, getBlockedRequestsForEmployee]);

  const isBlockedForDate = (dateStr: string) => {
    if (hasOrgBlackoutOnDate(dateStr)) return true;
    if (isEmployee) {
      return employeeBlocks.some(
        (block) => block.status === 'APPROVED' && dateStr >= block.startDate && dateStr <= block.endDate
      );
    }
    return false;
  };

  const handleDayClick = (day: Date) => {
    if (viewMode === 'month') {
      setSelectedDate(day);
      setViewMode('day');
    }
  };

  return (
    <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-theme-primary">
          {selectedDate.toLocaleString('default', { month: 'long' })} {selectedDate.getFullYear()}
        </h2>
        <p className="text-xs text-theme-muted">
          {isEmployee ? 'My Shifts' : 'Filtered shifts'}
        </p>
      </div>
      <div className="grid grid-cols-7 text-xs text-theme-muted gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-[11px] font-semibold">
            {day}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
        {weeks.map((week, weekIndex) =>
          week.map((day) => {
            const dayStr = dateToString(day);
            const isCurrentMonth = day.getMonth() === selectedDate.getMonth();
            const count = shiftCounts[dayStr] || 0;
            const blocked = isBlockedForDate(dayStr);
            return (
              <button
                key={`${weekIndex}-${dayStr}`}
                type="button"
                onClick={() => handleDayClick(day)}
                className={`flex flex-col items-center gap-1 rounded-lg border ${
                  isCurrentMonth ? 'border-theme-primary' : 'border-theme-primary/30 text-theme-muted'
                } p-2 bg-theme-primary/5 text-xs transition-colors hover:border-amber-500/80`}
              >
                <span className={`text-sm font-semibold ${dayStr === dateToString(selectedDate) ? 'text-amber-400' : ''}`}>
                  {day.getDate()}
                </span>
                {count > 0 && (
                  <span className="text-[10px] text-theme-secondary">
                    {count} {count === 1 ? 'shift' : 'shifts'}
                  </span>
                )}
                {blocked && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
