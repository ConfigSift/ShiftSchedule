'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS } from '../types';
import { getWeekDates, dateToString, isSameDay, formatHour } from '../utils/timeUtils';
import { Palmtree } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';

export function WeekView() {
  const {
    selectedDate,
    getFilteredEmployeesForRestaurant,
    getShiftsForRestaurant,
    setSelectedDate,
    setViewMode,
    openModal,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
  } = useScheduleStore();

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const weekDates = getWeekDates(selectedDate);
  const filteredEmployees = getFilteredEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const today = new Date();

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setViewMode('day');
  };

  const handleShiftClick = (shift: typeof scopedShifts[0], e: React.MouseEvent) => {
    e.stopPropagation();
    if (shift.isBlocked) return;
    if (!isManager) return;
    openModal('editShift', shift);
  };

  return (
    <div className="flex-1 flex flex-col bg-theme-timeline overflow-hidden transition-theme">
      <div className="h-12 border-b border-theme-primary flex shrink-0">
        <div className="w-44 shrink-0 border-r border-theme-primary" />
        <div className="flex-1 flex">
          {weekDates.map((date) => {
            const isToday = isSameDay(date, today);
            const isSelected = isSameDay(date, selectedDate);

            return (
              <button
                key={date.toISOString()}
                onClick={() => handleDayClick(date)}
                className={`flex-1 border-r border-theme-primary/50 flex flex-col items-center justify-center transition-colors ${
                  isToday
                    ? 'bg-amber-500/10'
                    : isSelected
                    ? 'bg-theme-hover'
                    : 'hover:bg-theme-hover/50'
                }`}
              >
                <span className={`text-xs font-medium ${
                  isToday ? 'text-amber-500' : 'text-theme-muted'
                }`}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className={`text-sm font-semibold ${
                  isToday ? 'text-amber-500' : 'text-theme-secondary'
                }`}>
                  {date.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredEmployees.length === 0 ? (
          <div className="flex items-center justify-center h-full text-theme-muted">
            <div className="text-center">
              <p className="text-lg font-medium mb-1">No staff selected</p>
              <p className="text-sm">Use the sidebar to select employees to view</p>
            </div>
          </div>
        ) : (
          filteredEmployees.map((employee) => {
            const sectionConfig = SECTIONS[employee.section];

            return (
              <div
                key={employee.id}
                className="flex min-h-[60px] border-b border-theme-primary/50 hover:bg-theme-hover/30 transition-colors"
              >
                <div className="w-44 shrink-0 border-r border-theme-primary flex items-center gap-3 px-3 py-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                    style={{
                      backgroundColor: sectionConfig.bgColor,
                      color: sectionConfig.color,
                    }}
                  >
                    {employee.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-theme-primary truncate">
                      {employee.name}
                    </p>
                    <p className="text-xs text-theme-muted truncate">
                      {sectionConfig.label}
                    </p>
                  </div>
                </div>

                <div className="flex-1 flex">
                  {weekDates.map((date) => {
                    const dateStr = dateToString(date);
                    const dayShifts = scopedShifts.filter(
                      s => s.employeeId === employee.id && s.date === dateStr && !s.isBlocked
                    );
                    const isToday = isSameDay(date, today);
                    const hasTimeOff = hasApprovedTimeOff(employee.id, dateStr);
                    const hasBlocked = hasBlockedShiftOnDate(employee.id, dateStr);

                    return (
                      <div
                        key={date.toISOString()}
                        className={`flex-1 border-r border-theme-primary/30 p-1 ${
                          isToday ? 'bg-amber-500/5' : ''
                        } ${hasTimeOff ? 'bg-emerald-500/5' : ''} ${hasBlocked ? 'bg-red-500/5' : ''}`}
                      >
                        {hasTimeOff ? (
                          <div className="h-full flex items-center justify-center">
                            <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 rounded text-emerald-500">
                              <Palmtree className="w-3 h-3" />
                              <span className="text-xs font-medium">OFF</span>
                            </div>
                          </div>
                        ) : hasBlocked ? (
                          <div className="h-full flex items-center justify-center">
                            <div className="flex items-center gap-1 px-2 py-1 bg-red-500/20 rounded text-red-400">
                              <span className="text-xs font-medium">BLOCKED</span>
                            </div>
                          </div>
                        ) : (
                          dayShifts.map((shift) => (
                            <div
                              key={shift.id}
                              onClick={(e) => handleShiftClick(shift, e)}
                              className="mb-1 px-2 py-1 rounded-md text-xs truncate cursor-pointer hover:scale-[1.02] transition-transform"
                              style={{
                                backgroundColor: sectionConfig.bgColor,
                                borderLeft: `3px solid ${sectionConfig.color}`,
                                color: sectionConfig.color,
                              }}
                              title={`${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}`}
                            >
                              {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                              {(shift.job || isManager) && (
                                <span className="ml-1 text-[10px] text-theme-muted">
                                  {shift.job || '(No job)'}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
