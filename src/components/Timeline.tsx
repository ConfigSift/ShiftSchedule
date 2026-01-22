'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { HOURS_START, HOURS_END, SECTIONS } from '../types';
import { formatHourShort, getShiftPosition, formatHour, formatShiftDuration } from '../utils/timeUtils';
import { useState, useRef, useCallback } from 'react';
import { Palmtree } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';

export function Timeline() {
  const {
    selectedDate,
    getFilteredEmployeesForRestaurant,
    getShiftsForRestaurant,
    hoveredShiftId,
    setHoveredShift,
    updateShift,
    openModal,
    hasApprovedTimeOff,
    getTimeOffForDate,
    hasBlockedShiftOnDate,
  } = useScheduleStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    shiftId: string;
    edge: 'start' | 'end' | 'move';
    startX: number;
    originalStart: number;
    originalEnd: number;
  } | null>(null);

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const dateString = selectedDate.toISOString().split('T')[0];
  const filteredEmployees = getFilteredEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const hours = Array.from({ length: HOURS_END - HOURS_START + 1 }, (_, i) => HOURS_START + i);

  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isToday = selectedDate.toDateString() === now.toDateString();
  const currentTimePosition = isToday && currentHour >= HOURS_START && currentHour <= HOURS_END
    ? ((currentHour - HOURS_START) / (HOURS_END - HOURS_START)) * 100
    : null;

  const getHourFromClientX = useCallback((clientX: number): number => {
    if (!timelineRef.current) return HOURS_START;
    const rect = timelineRef.current.getBoundingClientRect();
    const percentage = (clientX - rect.left) / rect.width;
    const hour = HOURS_START + percentage * (HOURS_END - HOURS_START);
    return Math.max(HOURS_START, Math.min(HOURS_END, Math.round(hour * 4) / 4));
  }, []);

  const handleMouseDown = (e: React.MouseEvent, shiftId: string, edge: 'start' | 'end' | 'move') => {
    if (!isManager) return;
    e.preventDefault();
    e.stopPropagation();
    const shift = scopedShifts.find(s => s.id === shiftId);
    if (!shift) return;
    
    setDragging({
      shiftId,
      edge,
      startX: e.clientX,
      originalStart: shift.startHour,
      originalEnd: shift.endHour,
    });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;

    const shift = scopedShifts.find(s => s.id === dragging.shiftId);
    if (!shift) return;

    const newHour = getHourFromClientX(e.clientX);
    const duration = dragging.originalEnd - dragging.originalStart;

    if (dragging.edge === 'start') {
      if (newHour < shift.endHour - 0.5) {
        updateShift(shift.id, { startHour: newHour });
      }
    } else if (dragging.edge === 'end') {
      if (newHour > shift.startHour + 0.5) {
        updateShift(shift.id, { endHour: newHour });
      }
    } else if (dragging.edge === 'move') {
      const newStart = Math.max(HOURS_START, Math.min(HOURS_END - duration, newHour - duration / 2));
      updateShift(shift.id, { 
        startHour: Math.round(newStart * 4) / 4,
        endHour: Math.round((newStart + duration) * 4) / 4,
      });
    }
  }, [dragging, scopedShifts, getHourFromClientX, updateShift]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleShiftClick = (shift: typeof scopedShifts[0]) => {
    if (!dragging) {
      if (shift.isBlocked) return;
      if (!isManager) return;
      openModal('editShift', shift);
    }
  };

  const handleEmptyClick = (employeeId: string, e: React.MouseEvent) => {
    if (!isManager) return;
    
    const hour = getHourFromClientX(e.clientX);
    openModal('addShift', {
      employeeId,
      date: dateString,
      startHour: Math.floor(hour),
      endHour: Math.min(24, Math.floor(hour) + 8),
    });
  };

  return (
    <div 
      ref={containerRef} 
      className="flex-1 flex flex-col bg-theme-timeline overflow-hidden relative transition-theme"
      onMouseMove={dragging ? handleMouseMove : undefined}
      onMouseUp={dragging ? handleMouseUp : undefined}
      onMouseLeave={dragging ? handleMouseUp : undefined}
    >
      {/* Hour Headers */}
      <div className="h-10 border-b border-theme-primary flex shrink-0">
        <div className="w-44 shrink-0 border-r border-theme-primary" />
        <div className="flex-1 relative flex">
          {hours.map((hour) => (
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
            const sectionConfig = SECTIONS[employee.section];
            const employeeShifts = scopedShifts.filter(
              s => s.employeeId === employee.id && s.date === dateString && !s.isBlocked
            );
            const employeeBlocked = scopedShifts.filter(
              s => s.employeeId === employee.id && s.date === dateString && s.isBlocked
            );
            const hasTimeOff = hasApprovedTimeOff(employee.id, dateString);
            const hasBlocked = employeeBlocked.length > 0;

            return (
              <div
                key={employee.id}
                className={`flex h-14 border-b border-theme-primary/50 transition-colors group ${
                  hasTimeOff ? 'bg-emerald-500/5' : hasBlocked ? 'bg-red-500/5' : 'hover:bg-theme-hover/50'
                }`}
              >
                <div className="w-44 shrink-0 border-r border-theme-primary flex items-center gap-3 px-3">
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

                <div 
                  ref={timelineRef}
                  className="flex-1 relative"
                  onClick={(e) => !hasTimeOff && employeeShifts.length === 0 && handleEmptyClick(employee.id, e)}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {hours.map((hour) => (
                      <div key={hour} className="flex-1 border-r border-theme-primary/30" />
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

                  {/* Time Off Indicator */}
                  {hasTimeOff && (
                    <div className="absolute inset-2 bg-emerald-500/20 border-2 border-dashed border-emerald-500/50 rounded-lg flex items-center justify-center gap-2 z-5">
                      <Palmtree className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-500">TIME OFF</span>
                    </div>
                  )}
                  {!hasTimeOff && hasBlocked && (
                    <div className="absolute inset-2 bg-red-500/15 border-2 border-dashed border-red-500/50 rounded-lg flex items-center justify-center gap-2 z-5">
                      <span className="text-xs font-medium text-red-400">BLOCKED</span>
                    </div>
                  )}

                  {/* Shifts */}
                  {!hasTimeOff && !hasBlocked && employeeShifts.map((shift) => {
                    const position = getShiftPosition(shift.startHour, shift.endHour);
                    const isHovered = hoveredShiftId === shift.id;
                    const isDragging = dragging?.shiftId === shift.id;

                    return (
                      <div
                        key={shift.id}
                        className={`absolute top-2 bottom-2 rounded-lg transition-all ${
                          isDragging ? 'z-30 shadow-xl cursor-grabbing' : isHovered ? 'z-10 shadow-lg' : 'z-0 cursor-pointer'
                        }`}
                        style={{
                          left: position.left,
                          width: position.width,
                          backgroundColor: isHovered || isDragging ? sectionConfig.color : sectionConfig.bgColor,
                          borderWidth: '2px',
                          borderColor: sectionConfig.color,
                          transform: isHovered && !isDragging ? 'scale(1.02)' : 'scale(1)',
                        }}
                        onMouseEnter={() => setHoveredShift(shift.id)}
                        onMouseLeave={() => setHoveredShift(null)}
                        onClick={() => handleShiftClick(shift)}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-l-lg"
                          onMouseDown={(e) => handleMouseDown(e, shift.id, 'start')}
                        />
                        
                        <div
                          className="absolute left-2 right-2 top-0 bottom-0 cursor-grab active:cursor-grabbing"
                          onMouseDown={(e) => handleMouseDown(e, shift.id, 'move')}
                        >
                          <div className="h-full flex items-center px-1 overflow-hidden">
                            <span
                              className={`text-xs font-medium truncate ${
                                isHovered || isDragging ? 'text-white' : ''
                              }`}
                              style={{ color: isHovered || isDragging ? 'white' : sectionConfig.color }}
                            >
                              {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                            </span>
                            {(shift.job || isManager) && (
                              <span
                                className={`text-[11px] truncate ${
                                  isHovered || isDragging ? 'text-white/90' : 'text-theme-muted'
                                }`}
                              >
                                {shift.job || '(No job)'}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-r-lg"
                          onMouseDown={(e) => handleMouseDown(e, shift.id, 'end')}
                        />
                      </div>
                    );
                  })}

                  {/* Empty state */}
                  {!hasTimeOff && !hasBlocked && employeeShifts.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <span className="text-xs text-theme-muted">Click to add shift</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
