'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { HOURS_END, HOURS_START, SECTIONS } from '../types';
import { getWeekDates, dateToString, isSameDay, formatHour, shiftsOverlap } from '../utils/timeUtils';
import { Palmtree } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function WeekView() {
  const {
    selectedDate,
    getFilteredEmployeesForRestaurant,
    getShiftsForRestaurant,
    locations,
    setSelectedDate,
    setViewMode,
    goToPrevious,
    goToNext,
    openModal,
    showToast,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
    hasOrgBlackoutOnDate,
    dateNavDirection,
    dateNavKey,
  } = useScheduleStore();

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const weekDates = getWeekDates(selectedDate);
  const filteredEmployees = getFilteredEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations]
  );
  const today = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLockRef = useRef(false);
  const edgeShiftCountRef = useRef(0);
  const edgeShiftResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellPointerRef = useRef<{ x: number; y: number; employeeId: string; date: string } | null>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'prev' | 'next' | null>(null);
  const [hoveredShiftId, setHoveredShiftId] = useState<string | null>(null);

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

  const handleCellMouseDown = (employeeId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isManager) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    cellPointerRef.current = { x: e.clientX, y: e.clientY, employeeId, date };
  };

  const handleCellMouseUp = (employeeId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isManager) return;
    if (!cellPointerRef.current) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) {
      cellPointerRef.current = null;
      return;
    }
    const dx = e.clientX - cellPointerRef.current.x;
    const dy = e.clientY - cellPointerRef.current.y;
    const distance = Math.hypot(dx, dy);
    cellPointerRef.current = null;
    if (distance > 6) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const rawHour = HOURS_START + percentage * (HOURS_END - HOURS_START);
    const startHour = Math.max(HOURS_START, Math.min(HOURS_END, Math.round(rawHour * 4) / 4));
    const endHour = Math.min(HOURS_END, Math.round((startHour + 2) * 4) / 4);
    const hasOverlap = scopedShifts.some(
      (shift) =>
        shift.employeeId === employeeId &&
        shift.date === date &&
        !shift.isBlocked &&
        shiftsOverlap(startHour, endHour, shift.startHour, shift.endHour)
    );
    if (hasOverlap) {
      showToast('Shift overlaps with existing shift', 'error');
      return;
    }

    openModal('addShift', {
      employeeId,
      date,
      startHour,
      endHour,
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-theme-timeline overflow-hidden transition-theme">
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden scroll-smooth"
        onScroll={handleScrollEdge}
      >
        <div
          className={`min-w-[1100px] flex flex-col h-full transition-transform transition-opacity duration-200 ${
            isSliding
              ? slideDirection === 'next'
                ? '-translate-x-2 opacity-90'
                : 'translate-x-2 opacity-90'
              : 'translate-x-0 opacity-100'
          }`}
        >
          <div className="h-12 border-b border-theme-primary flex shrink-0">
            <div className="w-44 shrink-0 border-r border-theme-primary sticky left-0 z-30 bg-theme-timeline" />
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
                className="flex min-h-[60px] border-b border-theme-primary/50 hover:bg-theme-hover/30 transition-colors group"
              >
                <div className="w-44 shrink-0 border-r border-theme-primary flex items-center gap-3 px-3 py-2 sticky left-0 z-20 bg-theme-timeline group-hover:bg-theme-hover/30">
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
                    const hasOrgBlackout = hasOrgBlackoutOnDate(dateStr);

                    return (
                      <div
                        key={date.toISOString()}
                        className={`flex-1 border-r border-theme-primary/30 p-1 group relative ${
                          isToday ? 'bg-amber-500/5' : ''
                        } ${hasTimeOff ? 'bg-emerald-500/5' : ''} ${hasBlocked ? 'bg-red-500/5' : ''} ${hasOrgBlackout ? 'bg-amber-500/5' : ''}`}
                        onMouseDown={(e) => handleCellMouseDown(employee.id, dateStr, e)}
                        onMouseUp={(e) => handleCellMouseUp(employee.id, dateStr, e)}
                      >
                        {!hasTimeOff && !hasBlocked && !hasOrgBlackout && isManager && (
                          <div
                            className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity ${
                              hoveredShiftId ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <span className="text-[11px] text-theme-muted">
                              Click to add shift
                            </span>
                          </div>
                        )}
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
                        ) : hasOrgBlackout ? (
                          <div className="h-full flex items-center justify-center">
                            <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 rounded text-amber-500">
                              <span className="text-xs font-medium">BLACKOUT</span>
                            </div>
                          </div>
                        ) : (
                          dayShifts.map((shift) => {
                            const locationName = shift.locationId ? locationMap.get(shift.locationId) : undefined;
                            const jobLabel = shift.job ? shift.job : isManager ? '(No job)' : '';
                            const metaParts = [jobLabel, locationName].filter(Boolean);
                            const metaLabel = metaParts.join(' • ');
                            const titleParts = [
                              `${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}`,
                              metaLabel,
                            ].filter(Boolean);

                            return (
                              <div
                                key={shift.id}
                                data-shift="true"
                                onClick={(e) => handleShiftClick(shift, e)}
                                onMouseEnter={() => setHoveredShiftId(shift.id)}
                                onMouseLeave={() => setHoveredShiftId(null)}
                                className="mb-1 px-2 py-1 rounded-md text-xs truncate cursor-pointer hover:scale-[1.02] transition-transform"
                                style={{
                                  backgroundColor: sectionConfig.bgColor,
                                  borderLeft: `3px solid ${sectionConfig.color}`,
                                  color: sectionConfig.color,
                                }}
                                title={titleParts.join(' | ')}
                              >
                                {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                                {metaLabel && (
                                  <span className="ml-1 text-[10px] text-theme-muted">
                                    {metaLabel}
                                  </span>
                                )}
                              </div>
                            );
                          })
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
      </div>
    </div>
  );
}
