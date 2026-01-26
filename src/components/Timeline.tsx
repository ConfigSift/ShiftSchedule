'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS } from '../types';
import { formatHourShort, formatHour, shiftsOverlap } from '../utils/timeUtils';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Palmtree } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';
import { getJobColorClasses } from '../lib/jobColors';

// Compact timeline sizing - pixels per hour
const PX_PER_HOUR = 48;

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
    dateNavDirection,
    dateNavKey,
    getEffectiveHourRange,
  } = useScheduleStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const namesScrollRef = useRef<HTMLDivElement>(null);
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

  // Drag-to-scroll state
  const [isDragScrolling, setIsDragScrolling] = useState(false);
  const dragScrollRef = useRef<{
    startX: number;
    scrollLeft: number;
  } | null>(null);

  const lanePointerRef = useRef<{ x: number; y: number; employeeId: string } | null>(null);
  const lastDragAtRef = useRef(0);

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const dateString = selectedDate.toISOString().split('T')[0];
  const filteredEmployees = getFilteredEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations]
  );

  // Get the effective hour range from settings
  const dayOfWeek = selectedDate.getDay();
  const { startHour: HOURS_START, endHour: HOURS_END } = getEffectiveHourRange(dayOfWeek);
  const TOTAL_HOURS = HOURS_END - HOURS_START;
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);

  // Compute total grid width based on hours and PX_PER_HOUR
  const gridWidth = TOTAL_HOURS * PX_PER_HOUR;

  // Helper to compute shift position based on current hour range
  const getShiftPositionForRange = useCallback((startHour: number, endHour: number) => {
    const left = ((startHour - HOURS_START) / TOTAL_HOURS) * 100;
    const width = ((endHour - startHour) / TOTAL_HOURS) * 100;
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - Math.max(0, left), Math.max(0, width))}%`,
    };
  }, [HOURS_START, TOTAL_HOURS]);

  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isToday = selectedDate.toDateString() === now.toDateString();
  const currentTimePosition = isToday && currentHour >= HOURS_START && currentHour <= HOURS_END
    ? ((currentHour - HOURS_START) / TOTAL_HOURS) * 100
    : null;

  const getHourFromClientX = useCallback((clientX: number): number => {
    if (!timelineRef.current) return HOURS_START;
    const rect = timelineRef.current.getBoundingClientRect();
    const percentage = (clientX - rect.left) / rect.width;
    const hour = HOURS_START + percentage * TOTAL_HOURS;
    return Math.max(HOURS_START, Math.min(HOURS_END, Math.round(hour * 4) / 4));
  }, [HOURS_START, HOURS_END, TOTAL_HOURS]);

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
  }, [dragging, scopedShifts, getHourFromClientX, updateShift, HOURS_START, HOURS_END]);

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
  }, [dragging, scopedShifts, getHourFromClientX, updateShift, HOURS_START, HOURS_END]);

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
    const tooltipWidth = 200;
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

  // Drag-to-scroll handlers for the grid
  const handleGridDragStart = useCallback((clientX: number) => {
    if (!gridScrollRef.current) return;
    setIsDragScrolling(true);
    dragScrollRef.current = {
      startX: clientX,
      scrollLeft: gridScrollRef.current.scrollLeft,
    };
  }, []);

  const handleGridDragMove = useCallback((clientX: number) => {
    if (!isDragScrolling || !dragScrollRef.current || !gridScrollRef.current) return;
    const dx = clientX - dragScrollRef.current.startX;
    gridScrollRef.current.scrollLeft = dragScrollRef.current.scrollLeft - dx;
  }, [isDragScrolling]);

  const handleGridDragEnd = useCallback(() => {
    setIsDragScrolling(false);
    dragScrollRef.current = null;
  }, []);

  const handleGridMouseDown = (e: React.MouseEvent) => {
    // Only start drag-scroll if clicking on empty space (not on a shift)
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    if (e.button !== 0) return;
    handleGridDragStart(e.clientX);
  };

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      handleMouseMove(e);
    } else if (isDragScrolling) {
      handleGridDragMove(e.clientX);
    }
  };

  const handleGridMouseUp = () => {
    if (dragging) {
      handleMouseUp();
    }
    handleGridDragEnd();
  };

  const handleGridMouseLeave = () => {
    if (dragging) {
      handleMouseUp();
    }
    handleGridDragEnd();
  };

  // Touch handlers for drag-to-scroll
  const handleGridTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    const touch = e.touches[0];
    if (!touch) return;
    handleGridDragStart(touch.clientX);
  };

  const handleGridTouchMove = (e: React.TouchEvent) => {
    if (dragging) {
      handleTouchMove(e);
    } else if (isDragScrolling) {
      const touch = e.touches[0];
      if (!touch) return;
      handleGridDragMove(touch.clientX);
    }
  };

  const handleGridTouchEnd = () => {
    if (dragging) {
      handleMouseUp();
    }
    handleGridDragEnd();
  };

  // Sync vertical scroll between names column and grid
  const handleGridScroll = useCallback(() => {
    if (namesScrollRef.current && gridScrollRef.current) {
      namesScrollRef.current.scrollTop = gridScrollRef.current.scrollTop;
    }
  }, []);

  const handleNamesScroll = useCallback(() => {
    if (namesScrollRef.current && gridScrollRef.current) {
      gridScrollRef.current.scrollTop = namesScrollRef.current.scrollTop;
    }
  }, []);

  useEffect(() => {
    if (!dateNavDirection) return;
    setSlideDirection(dateNavDirection);
    setIsSliding(true);
    const timeout = setTimeout(() => setIsSliding(false), 220);
    return () => clearTimeout(timeout);
  }, [dateNavKey, dateNavDirection]);

  // Determine if we should show every-other-hour labels for very compact views
  const showEveryOtherLabel = PX_PER_HOUR < 40;

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-theme-timeline overflow-hidden relative transition-theme"
    >
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Employee Names Column - slightly narrower */}
        <div className="w-36 shrink-0 flex flex-col bg-theme-timeline z-20 border-r border-theme-primary">
          {/* Header spacer */}
          <div className="h-8 border-b border-theme-primary shrink-0" />

          {/* Employee names list - synced scroll */}
          <div
            ref={namesScrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide"
            onScroll={handleNamesScroll}
          >
            {filteredEmployees.length === 0 ? (
              <div className="h-full" />
            ) : (
              filteredEmployees.map((employee) => {
                const sectionConfig = SECTIONS[employee.section];
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

                return (
                  <div
                    key={employee.id}
                    className={`h-11 border-b border-theme-primary/50 flex items-center gap-2 px-2 ${rowBackground}`}
                    style={{ boxShadow: '4px 0 8px rgba(0,0,0,0.08)' }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                      style={{
                        backgroundColor: sectionConfig.bgColor,
                        color: sectionConfig.color,
                      }}
                    >
                      {employee.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-theme-primary truncate">
                        {employee.name}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Scrollable Timeline Grid */}
        <div
          ref={gridScrollRef}
          className={`flex-1 overflow-x-auto overflow-y-auto ${isDragScrolling ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ scrollBehavior: isDragScrolling ? 'auto' : 'smooth' }}
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
          onMouseLeave={handleGridMouseLeave}
          onTouchStart={handleGridTouchStart}
          onTouchMove={handleGridTouchMove}
          onTouchEnd={handleGridTouchEnd}
          onTouchCancel={handleGridTouchEnd}
          onScroll={handleGridScroll}
        >
          <div
            className={`flex flex-col h-max min-h-full transition-transform transition-opacity duration-200 ${
              isSliding
                ? slideDirection === 'next'
                  ? '-translate-x-2 opacity-90'
                  : 'translate-x-2 opacity-90'
                : 'translate-x-0 opacity-100'
            }`}
            style={{ width: `${gridWidth}px`, minWidth: `${gridWidth}px` }}
          >
            {/* Hour Headers */}
            <div className="h-8 border-b border-theme-primary flex shrink-0 sticky top-0 bg-theme-timeline z-10">
              {hours.map((hour, idx) => (
                <div
                  key={hour}
                  className="border-r border-theme-primary/50 flex items-center justify-center"
                  style={{ width: `${PX_PER_HOUR}px`, minWidth: `${PX_PER_HOUR}px` }}
                >
                  {/* Show label based on density - every hour or every other hour */}
                  {(!showEveryOtherLabel || idx % 2 === 0) && (
                    <span className={`text-[10px] font-medium ${
                      hour % 2 === 0 ? 'text-theme-tertiary' : 'text-theme-muted'
                    }`}>
                      {formatHourShort(hour)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Timeline Grid Rows */}
            <div className="flex-1">
              {filteredEmployees.length === 0 ? (
                <div className="flex items-center justify-center h-full text-theme-muted">
                  <div className="text-center">
                    <p className="text-sm font-medium mb-1">No staff selected</p>
                    <p className="text-xs">Use the sidebar to select employees</p>
                  </div>
                </div>
              ) : (
                filteredEmployees.map((employee) => {
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
                      className={`h-11 border-b border-theme-primary/50 transition-colors group ${
                        rowBackground
                      } ${allowHover ? 'hover:bg-theme-hover/50' : ''}`}
                    >
                      <div
                        ref={timelineRef}
                        className="relative h-full"
                        onMouseDown={(e) => !hasTimeOff && !hasBlocked && handleLaneMouseDown(employee.id, e)}
                        onMouseUp={(e) => !hasTimeOff && !hasBlocked && handleLaneMouseUp(employee.id, e)}
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {hours.map((hour) => (
                            <div
                              key={hour}
                              className="border-r border-theme-primary/30"
                              style={{ width: `${PX_PER_HOUR}px`, minWidth: `${PX_PER_HOUR}px` }}
                            />
                          ))}
                        </div>

                        {/* Business hours highlight */}
                        {businessHoursForDay && (
                          <div
                            className="absolute top-0.5 bottom-0.5 rounded bg-emerald-500/5 border border-emerald-500/20 pointer-events-none"
                            style={getShiftPositionForRange(businessHoursForDay.openHour, businessHoursForDay.closeHour)}
                          />
                        )}

                        {/* Current time indicator */}
                        {currentTimePosition !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-20 pointer-events-none"
                            style={{ left: `${currentTimePosition}%` }}
                          >
                            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
                          </div>
                        )}

                        {/* Time Off Indicator */}
                        {hasTimeOff && (
                          <div className="absolute inset-1 bg-emerald-500/20 border border-dashed border-emerald-500/50 rounded flex items-center justify-center gap-1 z-5">
                            <Palmtree className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] font-medium text-emerald-500">OFF</span>
                          </div>
                        )}
                        {!hasTimeOff && hasBlocked && (
                          <div className="absolute inset-1 bg-red-500/15 border border-dashed border-red-500/50 rounded flex items-center justify-center gap-1 z-5">
                            <span className="text-[10px] font-medium text-red-400">BLOCKED</span>
                          </div>
                        )}
                        {hasOrgBlackout && (
                          <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[9px] font-semibold text-amber-500 pointer-events-none">
                            BLACKOUT
                          </div>
                        )}

                        {/* Shifts */}
                        {!hasTimeOff && !hasBlocked && employeeShifts.map((shift) => {
                          const locationName = shift.locationId ? locationMap.get(shift.locationId) : undefined;
                          const position = getShiftPositionForRange(shift.startHour, shift.endHour);
                          const isHovered = hoveredShiftId === shift.id;
                          const isDragging = dragging?.shiftId === shift.id;
                          const isStartDrag = isDragging && dragging?.edge === 'start';
                          const isEndDrag = isDragging && dragging?.edge === 'end';
                          const jobColor = getJobColorClasses(shift.job);
                          const shiftDuration = shift.endHour - shift.startHour;
                          const shiftWidth = shiftDuration * PX_PER_HOUR;
                          // Only show time text if shift is wide enough
                          const showTimeText = shiftWidth > 60;
                          const showJobText = shiftWidth > 80;

                          return (
                            <div
                              key={shift.id}
                              data-shift="true"
                              className={`absolute top-1 bottom-1 rounded transition-all ${
                                isDragging ? 'z-30 shadow-xl cursor-grabbing' : isHovered ? 'z-10 shadow-lg' : 'z-0 cursor-pointer'
                              }`}
                              style={{
                                left: position.left,
                                width: position.width,
                                backgroundColor: isHovered || isDragging ? jobColor.hoverBgColor : jobColor.bgColor,
                                borderWidth: '1px',
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
                                className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l flex items-center justify-center touch-none group/edge transition-colors ${
                                  isStartDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                                }`}
                                onMouseDown={(e) => handleMouseDown(e, shift.id, 'start')}
                                onTouchStart={(e) => handleTouchStart(e, shift.id, 'start')}
                              >
                                <span
                                  className={`w-0.5 h-4 rounded-full transition-colors ${
                                    isStartDrag ? 'bg-amber-200' : 'bg-white/50'
                                  } group-hover/edge:bg-white/80`}
                                />
                              </div>

                              <div
                                className="absolute left-2 right-2 top-0 bottom-0 cursor-grab active:cursor-grabbing touch-none overflow-hidden"
                                onMouseDown={(e) => handleMouseDown(e, shift.id, 'move')}
                                onTouchStart={(e) => handleTouchStart(e, shift.id, 'move')}
                              >
                                <div className="h-full flex items-center px-0.5 overflow-hidden">
                                  {showTimeText ? (
                                    <span
                                      className={`text-[10px] font-medium truncate ${
                                        isHovered || isDragging ? 'text-white' : ''
                                      }`}
                                      style={{ color: isHovered || isDragging ? '#fff' : jobColor.color }}
                                    >
                                      {formatHour(shift.startHour)}-{formatHour(shift.endHour)}
                                    </span>
                                  ) : (
                                    <span
                                      className={`text-[9px] font-medium truncate ${
                                        isHovered || isDragging ? 'text-white' : ''
                                      }`}
                                      style={{ color: isHovered || isDragging ? '#fff' : jobColor.color }}
                                    >
                                      {Math.round(shiftDuration)}h
                                    </span>
                                  )}
                                </div>
                                {showJobText && shift.job && (
                                  <span
                                    className={`absolute left-0.5 bottom-0 text-[9px] truncate max-w-full ${
                                      isHovered || isDragging ? 'text-white/90' : ''
                                    }`}
                                    style={{ color: isHovered || isDragging ? '#fff' : jobColor.color }}
                                  >
                                    {shift.job}
                                  </span>
                                )}
                              </div>

                              <div
                                className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r flex items-center justify-center touch-none group/edge transition-colors ${
                                  isEndDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                                }`}
                                onMouseDown={(e) => handleMouseDown(e, shift.id, 'end')}
                                onTouchStart={(e) => handleTouchStart(e, shift.id, 'end')}
                              >
                                <span
                                  className={`w-0.5 h-4 rounded-full transition-colors ${
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
                            <span className="text-[10px] text-theme-muted">
                              Click to add
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
      </div>

      {tooltip && (
        <div
          className="absolute z-40 bg-theme-secondary border border-theme-primary rounded-lg px-2.5 py-1.5 text-xs text-theme-primary shadow-lg pointer-events-none"
          style={{ left: tooltip.left, top: tooltip.top, width: 200 }}
        >
          <div className="font-semibold text-xs">{tooltip.employeeName}</div>
          {tooltip.job && <div className="text-theme-tertiary text-[11px]">{tooltip.job}</div>}
          {tooltip.location && <div className="text-theme-tertiary text-[11px]">{tooltip.location}</div>}
          <div className="text-theme-muted text-[11px]">{tooltip.time}</div>
        </div>
      )}
    </div>
  );
}

