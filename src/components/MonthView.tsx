'use client';

import { useMemo, useCallback } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { getUserRole } from '../utils/role';
import { dateToString, getWeekStart, getWeekdayHeaders } from '../utils/timeUtils';
import { ScheduleToolbar } from './ScheduleToolbar';

export function MonthView() {
  const {
    selectedDate,
    viewMode,
    selectedEmployeeIds,
    getShiftsForRestaurant,
    setSelectedDate,
    setViewMode,
    hasOrgBlackoutOnDate,
    getBlockedRequestsForEmployee,
    scheduleViewSettings,
  } = useScheduleStore();
  const { activeRestaurantId, currentUser } = useAuthStore();
  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';

  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const role = getUserRole(currentUser?.role);
  const isEmployee = role === 'EMPLOYEE';
  const handlePrevious = useCallback(() => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() - 1);
    next.setHours(0, 0, 0, 0);
    setSelectedDate(next);
  }, [selectedDate, setSelectedDate]);
  const handleNext = useCallback(() => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() + 1);
    next.setHours(0, 0, 0, 0);
    setSelectedDate(next);
  }, [selectedDate, setSelectedDate]);
  const handlePrevJump = useCallback(() => {
    const next = new Date(selectedDate);
    next.setFullYear(next.getFullYear() - 1);
    next.setHours(0, 0, 0, 0);
    setSelectedDate(next);
  }, [selectedDate, setSelectedDate]);
  const handleNextJump = useCallback(() => {
    const next = new Date(selectedDate);
    next.setFullYear(next.getFullYear() + 1);
    next.setHours(0, 0, 0, 0);
    setSelectedDate(next);
  }, [selectedDate, setSelectedDate]);
  const handleSelectDate = useCallback((date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    setSelectedDate(normalized);
  }, [setSelectedDate]);

  const monthStart = useMemo(() => 
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    [selectedDate]
  );
  const monthEnd = useMemo(() => 
    new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0),
    [selectedDate]
  );
  const calendarStart = useMemo(() => {
    return getWeekStart(monthStart, weekStartDay);
  }, [monthStart, weekStartDay]);

  const weekdayHeaders = useMemo(() => getWeekdayHeaders(weekStartDay), [weekStartDay]);

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

  const isBlockedForDate = useCallback((dateStr: string) => {
    if (hasOrgBlackoutOnDate(dateStr)) return true;
    if (isEmployee) {
      return employeeBlocks.some(
        (block) => block.status === 'APPROVED' && dateStr >= block.startDate && dateStr <= block.endDate
      );
    }
    return false;
  }, [hasOrgBlackoutOnDate, isEmployee, employeeBlocks]);

  const handleDayClick = useCallback((day: Date) => {
    if (viewMode === 'month') {
      setSelectedDate(day);
      setViewMode('day');
    }
  }, [viewMode, setSelectedDate, setViewMode]);

  const todayStr = dateToString(new Date());
  const selectedStr = dateToString(selectedDate);

  return (
    <div className="flex-1 flex flex-col bg-theme-timeline overflow-hidden transition-theme">
      <ScheduleToolbar
        viewMode="month"
        selectedDate={selectedDate}
        weekStartDay={weekStartDay}
        onPrev={handlePrevious}
        onNext={handleNext}
        onPrevJump={handlePrevJump}
        onNextJump={handleNextJump}
        onSelectDate={handleSelectDate}
        onViewModeChange={setViewMode}
        showPublish={false}
        publishDayEnabled={false}
        publishWeekEnabled={false}
        publishDisabledReason="No drafts to publish."
      />

      <div className="flex-1 overflow-auto p-2 sm:p-4">
        <div className="bg-theme-secondary border border-theme-primary rounded-xl sm:rounded-2xl p-3 sm:p-4 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-theme-primary">
              {selectedDate.toLocaleString('default', { month: 'long' })} {selectedDate.getFullYear()}
            </h2>
            <p className="text-[10px] sm:text-xs text-theme-muted">
              {isEmployee ? 'My Shifts' : 'Filtered shifts'}
            </p>
          </div>
        
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 text-theme-muted mb-1">
          {weekdayHeaders.full.map((day, i) => (
            <div key={day} className="text-center text-[10px] sm:text-xs font-semibold py-1">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{weekdayHeaders.short[i]}</span>
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {weeks.map((week, weekIndex) =>
            week.map((day) => {
              const dayStr = dateToString(day);
              const isCurrentMonth = day.getMonth() === selectedDate.getMonth();
              const count = shiftCounts[dayStr] || 0;
              const blocked = isBlockedForDate(dayStr);
              const isToday = dayStr === todayStr;
              const isSelected = dayStr === selectedStr;
              
              return (
                <button
                  key={`${weekIndex}-${dayStr}`}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`
                    relative flex flex-col items-center justify-center gap-0.5
                    rounded-lg border p-1.5 sm:p-2 
                    min-h-[48px] sm:min-h-[64px]
                    text-xs transition-colors
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500
                    ${isCurrentMonth 
                      ? 'border-theme-primary bg-theme-primary/5' 
                      : 'border-theme-primary/30 text-theme-muted bg-theme-primary/0'
                    }
                    ${isToday ? 'ring-2 ring-amber-500/50' : ''}
                    ${isSelected ? 'bg-amber-500/10 border-amber-500' : ''}
                    hover:border-amber-500/80 hover:bg-theme-hover
                    active:scale-95
                  `}
                  aria-label={`${day.toLocaleDateString()}, ${count} shifts${blocked ? ', blocked' : ''}`}
                >
                  <span className={`text-sm sm:text-base font-semibold ${isSelected ? 'text-amber-400' : ''}`}>
                    {day.getDate()}
                  </span>
                  
                  {count > 0 && (
                    <span className="text-[9px] sm:text-[10px] text-theme-secondary whitespace-nowrap">
                      {count}
                    </span>
                  )}

                  {blocked && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
                  )}
                </button>
              );
            })
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
