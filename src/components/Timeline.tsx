'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { HOURS_START, HOURS_END, SECTIONS } from '../types';
import { formatHourShort, getShiftPosition, formatHour, shiftsOverlap } from '../utils/timeUtils';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Palmtree } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';
import { getJobColorClasses } from '../lib/jobColors';

export function Timeline() {
  const {
    selectedDate,
    getFilteredEmployeesForRestaurant,
    getShiftsForRestaurant,
    businessHours,
    locations,
    hoveredShiftId,
    setHoveredShift,
    updateShift,
    openModal,
    showToast,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
    hasOrgBlackoutOnDate,
    goToPrevious,
    goToNext,
    dateNavDirection,
    dateNavKey,
  } = useScheduleStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLockRef = useRef(false);
  const edgeShiftCountRef = useRef(0);
  const edgeShiftResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lanePointerRef = useRef<{ x: number; y: number; employeeId: string } | null>(null);
  const lastDragAtRef = useRef(0);
  const [isSliding, setIsSliding] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'prev' | 'next' | null>(null);
  const [tooltip, setTooltip] = useState<{
    shiftId: string;
    left: number;
    top: number;
    employeeName: string;
    job?: string;
    location?: string;
    time: string;
  } | null>(null);
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
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations]
  );
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

  const parseTimeToDecimal = (value?: string | null) => {
    if (!value) return 0;
    const [hours, minutes = '0'] = value.split(':');
    const hour = Number(hours);
    const minute = Number(minutes);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
    return hour + minute / 60;
  };

  const businessHoursForDay = useMemo(() => {
    const dayOfWeek = selectedDate.getDay();
    const hoursRow = businessHours.find((row) => row.dayOfWeek === dayOfWeek && row.enabled);
    if (!hoursRow) return null;
    const openHour = parseTimeToDecimal(hoursRow.openTime);
    const closeHour = parseTimeToDecimal(hoursRow.closeTime);
    if (!closeHour || closeHour <= openHour) return null;
    return { openHour, closeHour };
  }, [businessHours, selectedDate]);

  const startDrag = useCallback((clientX: number, shiftId: string, edge: 'start' | 'end' | 'move') => {
    if (!isManager) return;
    const shift = scopedShifts.find(s => s.id === shiftId);
    if (!shift) return;
    
    setDragging({
      shiftId,
      edge,
      startX: clientX,
      originalStart: shift.startHour,
      originalEnd: shift.endHour,
    });
  }, [isManager, scopedShifts]);

  const handleMouseDown = (e: React.MouseEvent, shiftId: string, edge: 'start' | 'end' | 'move') => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(e.clientX, shiftId, edge);
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

  const handleTouchStart = (e: React.TouchEvent, shiftId: string, edge: 'start' | 'end' | 'move') => {
    if (!isManager) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    startDrag(touch.clientX, shiftId, edge);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;

    const shift = scopedShifts.find(s => s.id === dragging.shiftId);
    if (!shift) return;

    const newHour = getHourFromClientX(touch.clientX);
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
    if (dragging) {
      lastDragAtRef.current = Date.now();
    }
    setDragging(null);
  }, [dragging]);

  const handleShiftClick = (shift: typeof scopedShifts[0]) => {
    if (!dragging) {
      if (shift.isBlocked) return;
      if (!isManager) return;
      openModal('editShift', shift);
    }
  };

  const showTooltip = (shiftId: string, target: HTMLElement) => {
    const shift = scopedShifts.find((s) => s.id === shiftId);
    if (!shift || !containerRef.current) return;
    const employee = filteredEmployees.find((emp) => emp.id === shift.employeeId);
    const locationName = shift.locationId ? locationMap.get(shift.locationId) : undefined;
    const rect = target.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const tooltipWidth = 220;
    const tooltipHeight = locationName ? 88 : 72;
    let left = rect.left - containerRect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(containerRect.width - tooltipWidth - 12, left));
    let top = rect.top - containerRect.top - tooltipHeight - 8;
    if (top < 8) {
      top = rect.bottom - containerRect.top + 8;
    }
    setTooltip({
      shiftId,
      left,
      top,
      employeeName: employee?.name || 'Unknown',
      job: shift.job,
      location: locationName,
      time: `${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}`,
    });
  };

  const handleEmptyClick = (employeeId: string, e: React.MouseEvent) => {
    if (!isManager) return;
    
    const hour = getHourFromClientX(e.clientX);
    const defaultEnd = Math.min(HOURS_END, Math.round((hour + 2) * 4) / 4);
    const hasOverlap = scopedShifts.some(
      (shift) =>
        shift.employeeId === employeeId &&
        shift.date === dateString &&
        !shift.isBlocked &&
        shiftsOverlap(hour, defaultEnd, shift.startHour, shift.endHour)
    );
    if (hasOverlap) {
      showToast('Shift overlaps with existing shift', 'error');
      return;
    }
    openModal('addShift', {
      employeeId,
      date: dateString,
      startHour: hour,
      endHour: defaultEnd,
    });
  };

  const handleLaneMouseDown = (employeeId: string, e: React.MouseEvent) => {
    if (!isManager) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    lanePointerRef.current = { x: e.clientX, y: e.clientY, employeeId };
  };

  const handleLaneMouseUp = (employeeId: string, e: React.MouseEvent) => {
    if (!isManager) return;
    if (!lanePointerRef.current) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) {
      lanePointerRef.current = null;
      return;
    }
    if (Date.now() - lastDragAtRef.current < 200) {
      lanePointerRef.current = null;
      return;
    }
    const dx = e.clientX - lanePointerRef.current.x;
    const dy = e.clientY - lanePointerRef.current.y;
    const distance = Math.hypot(dx, dy);
    lanePointerRef.current = null;
    if (distance > 6) return;
    handleEmptyClick(employeeId, e);
  };

  const handleScrollEdge = useCallback(() => {
    const el = scrollRef.current;
    if (!el || scrollLockRef.current) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const threshold = 24;
    if (el.scrollLeft <= threshold) {
      if (edgeShiftCountRef.current >= 7) return;
      scrollLockRef.current = true;
      edgeShiftCountRef.current += 1;
      goToPrevious();
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft =
            (scrollRef.current.scrollWidth - scrollRef.current.clientWidth) / 2;
        }
      });
      setTimeout(() => {
        scrollLockRef.current = false;
      }, 300);
    } else if (el.scrollLeft + el.clientWidth >= el.scrollWidth - threshold) {
      if (edgeShiftCountRef.current >= 7) return;
      scrollLockRef.current = true;
      edgeShiftCountRef.current += 1;
      goToNext();
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft =
            (scrollRef.current.scrollWidth - scrollRef.current.clientWidth) / 2;
        }
      });
      setTimeout(() => {
        scrollLockRef.current = false;
      }, 300);
    }

    if (edgeShiftResetRef.current) {
      clearTimeout(edgeShiftResetRef.current);
    }
    edgeShiftResetRef.current = setTimeout(() => {
      edgeShiftCountRef.current = 0;
    }, 900);
  }, [goToPrevious, goToNext]);

  useEffect(() => {
    if (!dateNavDirection) return;
    setSlideDirection(dateNavDirection);
    setIsSliding(true);
    const timeout = setTimeout(() => setIsSliding(false), 220);
    return () => clearTimeout(timeout);
  }, [dateNavKey, dateNavDirection]);

  return (
    <div 
      ref={containerRef} 
      className="flex-1 flex flex-col bg-theme-timeline overflow-hidden relative transition-theme"
      onMouseMove={dragging ? handleMouseMove : undefined}
      onMouseUp={dragging ? handleMouseUp : undefined}
      onMouseLeave={dragging ? handleMouseUp : undefined}
      onTouchMove={dragging ? handleTouchMove : undefined}
      onTouchEnd={dragging ? handleMouseUp : undefined}
      onTouchCancel={dragging ? handleMouseUp : undefined}
    >
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden scroll-smooth"
        onScroll={handleScrollEdge}
      >
        <div
          className={`min-w-[1200px] flex flex-col h-full transition-transform transition-opacity duration-200 ${
            isSliding
              ? slideDirection === 'next'
                ? '-translate-x-2 opacity-90'
                : 'translate-x-2 opacity-90'
              : 'translate-x-0 opacity-100'
          }`}
        >
          {/* Hour Headers */}
          <div className="h-10 border-b border-theme-primary flex shrink-0">
            <div className="w-44 shrink-0 border-r border-theme-primary sticky left-0 z-30 bg-theme-timeline" />
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
                const hasTimeOff = hasApprovedTimeOff(employee.id, dateString);
                const hasBlocked = hasBlockedShiftOnDate(employee.id, dateString);
                const hasOrgBlackout = hasOrgBlackoutOnDate(dateString);
                const rowBackground = hasTimeOff
                  ? 'bg-emerald-500/5'
                  : hasBlocked
                  ? 'bg-red-500/5'
                  : hasOrgBlackout
                  ? 'bg-amber-500/5'
                  : '';
                const allowHover = !hasTimeOff && !hasBlocked && !hasOrgBlackout;

                return (
                  <div
                    key={employee.id}
                    className={`flex h-14 border-b border-theme-primary/50 transition-colors group ${
                      rowBackground
                    } ${allowHover ? 'hover:bg-theme-hover/50' : ''}`}
                  >
                    <div
                      className={`w-44 shrink-0 border-r border-theme-primary flex items-center gap-3 px-3 sticky left-0 z-30 bg-theme-timeline ${
                        rowBackground
                      } ${allowHover ? 'group-hover:bg-theme-hover/50' : ''}`}
                      style={{ boxShadow: '4px 0 8px rgba(0,0,0,0.08)' }}
                    >
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
                      </div>
                    </div>
                    <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-r from-theme-timeline/0 to-theme-primary/30" aria-hidden="true" />

                    <div 
                      ref={timelineRef}
                      className="flex-1 relative"
                      onMouseDown={(e) => !hasTimeOff && !hasBlocked && handleLaneMouseDown(employee.id, e)}
                      onMouseUp={(e) => !hasTimeOff && !hasBlocked && handleLaneMouseUp(employee.id, e)}
                    >
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {hours.map((hour) => (
                          <div key={hour} className="flex-1 border-r border-theme-primary/30" />
                        ))}
                      </div>

                      {/* Business hours highlight */}
                      {businessHoursForDay && (
                        <div
                          className="absolute top-1 bottom-1 rounded-md bg-emerald-500/5 border border-emerald-500/20 pointer-events-none"
                          style={getShiftPosition(businessHoursForDay.openHour, businessHoursForDay.closeHour)}
                        />
                      )}

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
                      {hasOrgBlackout && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-semibold text-amber-500 pointer-events-none">
                          BLACKOUT
                        </div>
                      )}

                      {/* Shifts */}
                      {!hasTimeOff && !hasBlocked && employeeShifts.map((shift) => {
                        const locationName = shift.locationId ? locationMap.get(shift.locationId) : undefined;
                        const position = getShiftPosition(shift.startHour, shift.endHour);
                        const isHovered = hoveredShiftId === shift.id;
                        const isDragging = dragging?.shiftId === shift.id;
                        const isStartDrag = isDragging && dragging?.edge === 'start';
                        const isEndDrag = isDragging && dragging?.edge === 'end';
                        const jobColor = getJobColorClasses(shift.job);

                        return (
                          <div
                            key={shift.id}
                            data-shift="true"
                            className={`absolute top-2 bottom-2 rounded-lg transition-all group ${
                              isDragging ? 'z-30 shadow-xl cursor-grabbing' : isHovered ? 'z-10 shadow-lg' : 'z-0 cursor-pointer'
                            }`}
                            style={{
                              left: position.left,
                              width: position.width,
                              backgroundColor: isHovered || isDragging ? jobColor.hoverBgColor : jobColor.bgColor,
                              borderWidth: '2px',
                              borderColor: jobColor.color,
                              transform: isHovered && !isDragging ? 'scale(1.02)' : 'scale(1)',
                            }}
                            onMouseEnter={(e) => {
                              setHoveredShift(shift.id);
                              showTooltip(shift.id, e.currentTarget);
                            }}
                            onMouseLeave={() => {
                              setHoveredShift(null);
                              setTooltip(null);
                            }}
                            onClick={() => handleShiftClick(shift)}
                          >
                            <div
                              className={`absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize rounded-l-lg flex items-center justify-center touch-none group/edge transition-colors ${
                                isStartDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                              }`}
                              onMouseDown={(e) => handleMouseDown(e, shift.id, 'start')}
                              onTouchStart={(e) => handleTouchStart(e, shift.id, 'start')}
                            >
                              <span
                                className={`w-0.5 h-6 rounded-full transition-colors ${
                                  isStartDrag ? 'bg-amber-200' : 'bg-white/50'
                                } group-hover/edge:bg-white/80`}
                              />
                            </div>
                            
                            <div
                              className="absolute left-2.5 right-2.5 top-0 bottom-0 cursor-grab active:cursor-grabbing touch-none"
                              onMouseDown={(e) => handleMouseDown(e, shift.id, 'move')}
                              onTouchStart={(e) => handleTouchStart(e, shift.id, 'move')}
                            >
                              <div className="h-full flex items-center justify-center px-2 overflow-hidden">
                              <span
                                className={`text-xs font-medium truncate ${
                                  isHovered || isDragging ? 'text-white' : ''
                                }`}
                                style={{ color: isHovered || isDragging ? '#fff' : jobColor.color }}
                              >
                                  {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                                </span>
                              </div>
                              {shift.job && (
                                <span
                                  className={`absolute left-2 bottom-1 text-[11px] ${
                                    isHovered || isDragging ? 'text-white/90' : ''
                                  }`}
                                  style={{ color: isHovered || isDragging ? '#fff' : jobColor.color }}
                                >
                                  {shift.job}
                                </span>
                              )}
                              {locationName && (
                                <span
                                  className={`absolute right-2 bottom-1 text-[11px] ${
                                    isHovered || isDragging ? 'text-white/90' : 'text-theme-muted'
                                  }`}
                                >
                                  {locationName}
                                </span>
                              )}
                            </div>
                            
                            <div
                              className={`absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize rounded-r-lg flex items-center justify-center touch-none group/edge transition-colors ${
                                isEndDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                              }`}
                              onMouseDown={(e) => handleMouseDown(e, shift.id, 'end')}
                              onTouchStart={(e) => handleTouchStart(e, shift.id, 'end')}
                            >
                              <span
                                className={`w-0.5 h-6 rounded-full transition-colors ${
                                  isEndDrag ? 'bg-amber-200' : 'bg-white/50'
                                } group-hover/edge:bg-white/80`}
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* Empty slot hint */}
                      {!hasTimeOff && !hasBlocked && isManager && (
                        <div
                          className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity ${
                            hoveredShiftId
                              ? 'opacity-0'
                              : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <span className="text-[11px] text-theme-muted">
                            Click to add shift
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {tooltip && (
        <div
          className="absolute z-40 bg-theme-secondary border border-theme-primary rounded-lg px-3 py-2 text-xs text-theme-primary shadow-lg pointer-events-none"
          style={{ left: tooltip.left, top: tooltip.top, width: 220 }}
        >
          <div className="font-semibold">{tooltip.employeeName}</div>
          {tooltip.job && <div className="text-theme-tertiary">{tooltip.job}</div>}
          {tooltip.location && <div className="text-theme-tertiary">{tooltip.location}</div>}
          <div className="text-theme-muted">{tooltip.time}</div>
        </div>
      )}
    </div>
  );
}
