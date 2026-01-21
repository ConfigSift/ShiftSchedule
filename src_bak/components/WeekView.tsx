'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { ROLES } from '../types';
import { getWeekDates, formatDateHeader, dateToString, isSameDay, formatHour } from '../utils/timeUtils';

export function WeekView() {
  const {
    selectedDate,
    getFilteredEmployees,
    shifts,
    setSelectedDate,
    setViewMode,
  } = useScheduleStore();

  const weekDates = getWeekDates(selectedDate);
  const filteredEmployees = getFilteredEmployees();
  const today = new Date();

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setViewMode('day');
  };

  return (
    <div className="flex-1 flex flex-col bg-theme-timeline overflow-hidden transition-theme">
      {/* Day Headers */}
      <div className="h-12 border-b border-theme-primary flex shrink-0">
        {/* Empty space for employee names */}
        <div className="w-44 shrink-0 border-r border-theme-primary" />
        
        {/* Day columns */}
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

      {/* Week Grid */}
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
            const roleConfig = ROLES[employee.role];

            return (
              <div
                key={employee.id}
                className="flex min-h-[60px] border-b border-theme-primary/50 hover:bg-theme-hover/30 transition-colors"
              >
                {/* Employee Name */}
                <div className="w-44 shrink-0 border-r border-theme-primary flex items-center gap-3 px-3 py-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                    style={{
                      backgroundColor: roleConfig.bgColor,
                      color: roleConfig.color,
                    }}
                  >
                    {employee.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-theme-primary truncate">
                      {employee.name}
                    </p>
                    <p className="text-xs text-theme-muted truncate">
                      {roleConfig.label}
                    </p>
                  </div>
                </div>

                {/* Day Columns */}
                <div className="flex-1 flex">
                  {weekDates.map((date) => {
                    const dateStr = dateToString(date);
                    const dayShifts = shifts.filter(
                      s => s.employeeId === employee.id && s.date === dateStr
                    );
                    const isToday = isSameDay(date, today);

                    return (
                      <div
                        key={date.toISOString()}
                        className={`flex-1 border-r border-theme-primary/30 p-1 ${
                          isToday ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        {dayShifts.map((shift) => (
                          <div
                            key={shift.id}
                            className="mb-1 px-2 py-1 rounded-md text-xs truncate cursor-pointer hover:scale-[1.02] transition-transform"
                            style={{
                              backgroundColor: roleConfig.bgColor,
                              borderLeft: `3px solid ${roleConfig.color}`,
                              color: roleConfig.color,
                            }}
                            title={`${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}`}
                          >
                            {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                          </div>
                        ))}
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
