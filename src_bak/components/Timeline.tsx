'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { HOURS_START, HOURS_END, ROLES } from '../types';
import { formatHourShort, getShiftPosition, formatHour, formatShiftDuration } from '../utils/timeUtils';
import { useState, useRef } from 'react';

export function Timeline() {
  const {
    selectedDate,
    getFilteredEmployees,
    shifts,
    getEmployeeById,
    hoveredShiftId,
    setHoveredShift,
  } = useScheduleStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltipData, setTooltipData] = useState<{
    shiftId: string;
    x: number;
    y: number;
  } | null>(null);

  const dateString = selectedDate.toISOString().split('T')[0];
  const filteredEmployees = getFilteredEmployees();
  const hours = Array.from({ length: HOURS_END - HOURS_START + 1 }, (_, i) => HOURS_START + i);

  // Get current time position
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isToday = selectedDate.toDateString() === now.toDateString();
  const currentTimePosition = isToday && currentHour >= HOURS_START && currentHour <= HOURS_END
    ? ((currentHour - HOURS_START) / (HOURS_END - HOURS_START)) * 100
    : null;

  const handleShiftHover = (shiftId: string | null, event?: React.MouseEvent) => {
    setHoveredShift(shiftId);
    if (shiftId && event) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltipData({
          shiftId,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }
    } else {
      setTooltipData(null);
    }
  };

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-theme-timeline overflow-hidden relative transition-theme">
      {/* Hour Headers */}
      <div className="h-10 border-b border-theme-primary flex shrink-0">
        {/* Empty space for employee names */}
        <div className="w-44 shrink-0 border-r border-theme-primary" />
        
        {/* Hour markers */}
        <div className="flex-1 relative flex">
          {hours.map((hour, index) => (
            <div
              key={hour}
              className="flex-1 border-r border-theme-primary/50 flex items-center justify-center"
            >
              <span className={`text-xs font-medium ${
                hour % 2 === 0 ? 'text-theme-tertiary' : 'text-theme-muted'
              }`}>
                {formatHourShort(hour)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline Grid */}
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
            const employeeShifts = shifts.filter(
              s => s.employeeId === employee.id && s.date === dateString
            );

            return (
              <div
                key={employee.id}
                className="flex h-14 border-b border-theme-primary/50 hover:bg-theme-hover/50 transition-colors group"
              >
                {/* Employee Name */}
                <div className="w-44 shrink-0 border-r border-theme-primary flex items-center gap-3 px-3">
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

                {/* Shift Timeline */}
                <div className="flex-1 relative">
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="flex-1 border-r border-theme-primary/30"
                      />
                    ))}
                  </div>

                  {/* Current time indicator */}
                  {currentTimePosition !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-20 pointer-events-none"
                      style={{ left: `${currentTimePosition}%` }}
                    >
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-500" />
                    </div>
                  )}

                  {/* Shifts */}
                  {employeeShifts.map((shift) => {
                    const position = getShiftPosition(shift.startHour, shift.endHour);
                    const isHovered = hoveredShiftId === shift.id;

                    return (
                      <div
                        key={shift.id}
                        className={`absolute top-2 bottom-2 rounded-lg cursor-pointer transition-all ${
                          isHovered ? 'z-10 scale-[1.02] shadow-lg' : 'z-0'
                        }`}
                        style={{
                          left: position.left,
                          width: position.width,
                          backgroundColor: isHovered ? roleConfig.color : roleConfig.bgColor,
                          borderWidth: '2px',
                          borderColor: roleConfig.color,
                        }}
                        onMouseEnter={(e) => handleShiftHover(shift.id, e)}
                        onMouseLeave={() => handleShiftHover(null)}
                      >
                        <div className="h-full flex items-center px-2 overflow-hidden">
                          <span
                            className={`text-xs font-medium truncate ${
                              isHovered ? 'text-white' : ''
                            }`}
                            style={{ color: isHovered ? 'white' : roleConfig.color }}
                          >
                            {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty state click area */}
                  {employeeShifts.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs text-theme-muted">Click to add shift</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tooltip */}
      {tooltipData && (
        <ShiftTooltip
          shiftId={tooltipData.shiftId}
          x={tooltipData.x}
          y={tooltipData.y}
        />
      )}
    </div>
  );
}

function ShiftTooltip({ shiftId, x, y }: { shiftId: string; x: number; y: number }) {
  const { shifts, getEmployeeById } = useScheduleStore();
  const shift = shifts.find(s => s.id === shiftId);
  if (!shift) return null;

  const employee = getEmployeeById(shift.employeeId);
  if (!employee) return null;

  const roleConfig = ROLES[employee.role];
  const duration = formatShiftDuration(shift.startHour, shift.endHour);

  return (
    <div
      className="absolute z-50 bg-theme-secondary rounded-xl shadow-xl border border-theme-primary p-3 pointer-events-none transition-theme"
      style={{
        left: x + 10,
        top: y - 10,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
          style={{
            backgroundColor: roleConfig.bgColor,
            color: roleConfig.color,
          }}
        >
          {employee.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <p className="text-sm font-medium text-theme-primary">{employee.name}</p>
          <p className="text-xs text-theme-muted">{roleConfig.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-theme-primary font-medium">
          {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
        </span>
        <span className="text-theme-muted">{duration}</span>
      </div>
    </div>
  );
}
