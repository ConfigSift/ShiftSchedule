'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS } from '../types';
import { getWeekDates, getWeekStart, dateToString, isSameDay, formatHour, shiftsOverlap } from '../utils/timeUtils';
import { Palmtree, ArrowLeftRight } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJobColorClasses } from '../lib/jobColors';
import { ScheduleToolbar } from './ScheduleToolbar';
import { apiFetch } from '../lib/apiClient';

// Compact sizing - pixels per day column
const PX_PER_DAY = 100;

function formatPublishWeekLabel(start: Date, end: Date): string {
  const startMonthDay = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endMonthDay = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear !== endYear) {
    return `${startMonthDay}, ${startYear} – ${endMonthDay}, ${endYear}`;
  }
  return `${startMonthDay} – ${endMonthDay}, ${startYear}`;
}

export function WeekView() {
  const {
    selectedDate,
    goToPrevious,
    goToNext,
    getFilteredEmployeesForRestaurant,
    getShiftsForRestaurant,
    locations,
    setSelectedDate,
    setViewMode,
    openModal,
    showToast,
    loadRestaurantData,
    selectAllEmployeesForRestaurant,
    publishDraftRange,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
    hasOrgBlackoutOnDate,
    dateNavDirection,
    dateNavKey,
    getEffectiveHourRange,
    scheduleViewSettings,
    scheduleMode,
  } = useScheduleStore();

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const isToday = isSameDay(selectedDate, new Date());
  const todayStr = dateToString(new Date());
  const isEditableDate = useCallback((dateStr: string) => dateStr >= todayStr, [todayStr]);
  const canEditDate = useCallback((dateStr: string) => isManager && isEditableDate(dateStr), [isManager, isEditableDate]);
  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';
  const weekDates = getWeekDates(selectedDate, weekStartDay);
  const weekStartYmd = useMemo(() => dateToString(weekDates[0]), [weekDates]);
  const weekEndYmd = useMemo(() => dateToString(weekDates[6]), [weekDates]);
  const publishWeekLabel = useMemo(
    () => formatPublishWeekLabel(weekDates[0], weekDates[6]),
    [weekDates]
  );
  const filteredEmployees = getFilteredEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations]
  );
  const today = new Date();
  const hasDraftInWeek = useMemo(
    () =>
      scopedShifts.some(
        (shift) =>
          shift.scheduleState === 'draft' &&
          shift.date >= weekStartYmd &&
          shift.date <= weekEndYmd
      ),
    [scopedShifts, weekEndYmd, weekStartYmd]
  );
  const weekShiftCount = useMemo(
    () => scopedShifts.filter((shift) => shift.date >= weekStartYmd && shift.date <= weekEndYmd).length,
    [scopedShifts, weekEndYmd, weekStartYmd]
  );
  const publishStatusLabel = hasDraftInWeek ? 'DRAFT' : 'PUBLISHED';
  const statusTone = hasDraftInWeek ? 'bg-amber-500 text-zinc-900' : 'bg-emerald-500 text-white';
  const isDraftMode = scheduleMode === 'draft';
  const draftHelperText = 'Changes are not visible to staff until published.';
  const draftBadge = (
    <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-500/20 text-amber-500 text-[11px] font-semibold tracking-wide">
      DRAFT MODE
    </span>
  );
  const isPastWeek = weekEndYmd < todayStr;
  const publishWeekEnabled = isManager && hasDraftInWeek && !isPastWeek;
  const publishWeekDisabledReason = isPastWeek
    ? "Past schedules can't be published."
    : !hasDraftInWeek
    ? 'No draft changes'
    : undefined;
  const showCopyDraftWeek = isManager && isDraftMode && weekShiftCount === 0;

  // Refs for scroll syncing
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const namesScrollRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll state
  const [isDragScrolling, setIsDragScrolling] = useState(false);
  const dragScrollRef = useRef<{
    startX: number;
    scrollLeft: number;
  } | null>(null);

  const cellPointerRef = useRef<{ x: number; y: number; employeeId: string; date: string } | null>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'prev' | 'next' | null>(null);
  const [hoveredShiftId, setHoveredShiftId] = useState<string | null>(null);

  // Calculate grid width based on days
  const gridWidth = 7 * PX_PER_DAY;

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setViewMode('day');
  };

  const handlePrevious = useCallback(() => goToPrevious(), [goToPrevious]);
  const handleNext = useCallback(() => goToNext(), [goToNext]);
  const handlePrevJump = useCallback(() => {
    const weekStart = getWeekStart(selectedDate, weekStartDay);
    weekStart.setDate(weekStart.getDate() - 28);
    setSelectedDate(weekStart);
  }, [selectedDate, setSelectedDate, weekStartDay]);
  const handleNextJump = useCallback(() => {
    const weekStart = getWeekStart(selectedDate, weekStartDay);
    weekStart.setDate(weekStart.getDate() + 28);
    setSelectedDate(weekStart);
  }, [selectedDate, setSelectedDate, weekStartDay]);
  const handleSelectDate = useCallback((date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    setSelectedDate(normalized);
  }, [setSelectedDate]);

  const handlePublishWeek = useCallback(async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const result = await publishDraftRange({ startDate: weekStartYmd, endDate: weekEndYmd });
    if (!result.success) {
      showToast(result.error || 'Unable to publish week.', 'error');
      return;
    }
    await loadRestaurantData(activeRestaurantId);
    showToast(`Published week ${publishWeekLabel}.`, 'success');
  }, [activeRestaurantId, loadRestaurantData, publishDraftRange, publishWeekLabel, showToast, weekEndYmd, weekStartYmd]);

  const handleCreateDraft = useCallback(async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const addDays = (dateStr: string, days: number) => {
      const date = new Date(`${dateStr}T00:00:00`);
      date.setDate(date.getDate() + days);
      return dateToString(date);
    };
    const sourceWeekStart = addDays(weekStartYmd, -7);
    const sourceWeekEnd = addDays(weekEndYmd, -7);
    const result = await apiFetch('/api/shifts/copy', {
      method: 'POST',
      json: {
        mode: 'nextWeek',
        sourceWeekStart,
        sourceWeekEnd,
        targetScheduleState: 'draft',
        sourceScheduleState: 'published',
      },
    });
    if (!result.ok) {
      showToast(result.error || 'Unable to create draft.', 'error');
      return;
    }
    await loadRestaurantData(activeRestaurantId);
    const { selectedEmployeeIds } = useScheduleStore.getState();
    if (!selectedEmployeeIds.length) {
      selectAllEmployeesForRestaurant(activeRestaurantId);
    }
    showToast('Draft schedule created.', 'success');
  }, [activeRestaurantId, loadRestaurantData, selectAllEmployeesForRestaurant, showToast, weekEndYmd, weekStartYmd]);

  const publishDisabledReason = isManager ? undefined : 'Only managers can publish.';

  const handleShiftClick = (shift: typeof scopedShifts[0], e: React.MouseEvent) => {
    e.stopPropagation();
    if (shift.isBlocked) return;
    if (!canEditDate(shift.date)) {
      showToast("Past schedules can't be edited.", 'error');
      return;
    }
    openModal('editShift', shift);
  };

  // Drag-to-scroll handlers
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
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button !== 0) return;
    handleGridDragStart(e.clientX);
  };

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (isDragScrolling) {
      handleGridDragMove(e.clientX);
    }
  };

  const handleGridMouseUp = () => {
    handleGridDragEnd();
  };

  const handleGridMouseLeave = () => {
    handleGridDragEnd();
  };

  // Touch handlers for drag-to-scroll
  const handleGridTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const touch = e.touches[0];
    if (!touch) return;
    handleGridDragStart(touch.clientX);
  };

  const handleGridTouchMove = (e: React.TouchEvent) => {
    if (isDragScrolling) {
      const touch = e.touches[0];
      if (!touch) return;
      handleGridDragMove(touch.clientX);
    }
  };

  const handleGridTouchEnd = () => {
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

  const handleCellMouseDown = (employeeId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEditDate(date)) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    cellPointerRef.current = { x: e.clientX, y: e.clientY, employeeId, date };
  };

  const handleCellMouseUp = (employeeId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEditDate(date)) {
      showToast("Past schedules can't be edited.", 'error');
      return;
    }
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

    // Get effective hour range for this day
    const clickDate = new Date(date);
    const { startHour: HOURS_START, endHour: HOURS_END } = getEffectiveHourRange(clickDate.getDay());
    const TOTAL_HOURS = HOURS_END - HOURS_START;

    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const rawHour = HOURS_START + percentage * TOTAL_HOURS;
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
      <ScheduleToolbar
        viewMode="week"
        selectedDate={selectedDate}
        weekStartDay={weekStartDay}
        onPrev={handlePrevious}
        onNext={handleNext}
        onPrevJump={handlePrevJump}
        onNextJump={handleNextJump}
        onSelectDate={handleSelectDate}
        onViewModeChange={setViewMode}
        showPublish={isManager}
        publishWeekEnabled={publishWeekEnabled}
        onPublishWeek={handlePublishWeek}
        publishDisabledReason={publishDisabledReason}
        publishWeekDisabledReason={publishWeekDisabledReason}
      />

      {isDraftMode && (
        <div className="shrink-0 border-b border-theme-primary bg-theme-secondary/95 backdrop-blur px-2 sm:px-4 py-2 sm:h-12 overflow-x-auto">
          <div className="flex items-center justify-between gap-4 min-w-max">
            <div className="flex items-center gap-2">
              {draftBadge}
              <span className="text-[11px] text-theme-muted whitespace-nowrap">{draftHelperText}</span>
            </div>

            <div className="w-[300px] flex items-center justify-end">
              {showCopyDraftWeek ? (
                <button
                  type="button"
                  onClick={handleCreateDraft}
                  className="w-[300px] h-[40px] flex items-center gap-1.5 px-3 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs sm:text-sm font-medium"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span className="truncate">Copy last published week into draft</span>
                </button>
              ) : (
                <div className="w-[300px] h-[40px] invisible" />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Employee Names Column - compact */}
        <div className="w-36 shrink-0 flex flex-col bg-theme-timeline z-20 border-r border-theme-primary">
          {/* Header spacer */}
          <div className={`h-10 border-b border-theme-primary shrink-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>
            {publishStatusLabel}
          </div>

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

                return (
                  <div
                    key={employee.id}
                    className="h-12 border-b border-theme-primary/50 flex items-center gap-2 px-2 bg-theme-timeline"
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

        {/* Scrollable Week Grid */}
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
            {/* Day Headers */}
            <div className="h-10 border-b border-theme-primary flex shrink-0 sticky top-0 bg-theme-timeline z-10">
              {weekDates.map((date) => {
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);

                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => handleDayClick(date)}
                    className={`border-r border-theme-primary/50 flex flex-col items-center justify-center transition-colors ${
                      isToday
                        ? 'bg-amber-500/10'
                        : isSelected
                        ? 'bg-theme-hover'
                        : 'hover:bg-theme-hover/50'
                    }`}
                    style={{ width: `${PX_PER_DAY}px`, minWidth: `${PX_PER_DAY}px` }}
                  >
                    <span className={`text-[10px] font-medium ${
                      isToday ? 'text-amber-500' : 'text-theme-muted'
                    }`}>
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className={`text-xs font-semibold ${
                      isToday ? 'text-amber-500' : 'text-theme-secondary'
                    }`}>
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Week Grid Rows */}
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
                  return (
                    <div
                      key={employee.id}
                      className="flex h-12 border-b border-theme-primary/50 hover:bg-theme-hover/30 transition-colors group"
                    >
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
                            className={`border-r border-theme-primary/30 p-0.5 group relative overflow-hidden ${
                              isToday ? 'bg-amber-500/5' : ''
                            } ${hasTimeOff ? 'bg-emerald-500/5' : ''} ${hasBlocked ? 'bg-red-500/5' : ''} ${hasOrgBlackout ? 'bg-amber-500/5' : ''}`}
                            style={{ width: `${PX_PER_DAY}px`, minWidth: `${PX_PER_DAY}px` }}
                            onMouseDown={(e) => handleCellMouseDown(employee.id, dateStr, e)}
                            onMouseUp={(e) => handleCellMouseUp(employee.id, dateStr, e)}
                          >
                            {!hasTimeOff && !hasBlocked && !hasOrgBlackout && canEditDate(dateStr) && (
                              <div
                                className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity ${
                                  hoveredShiftId ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                                }`}
                              >
                                <span className="text-[9px] text-theme-muted">+</span>
                              </div>
                            )}
                            {hasTimeOff ? (
                              <div className="h-full flex items-center justify-center">
                                <div className="flex items-center gap-0.5 px-1 py-0.5 bg-emerald-500/20 rounded text-emerald-500">
                                  <Palmtree className="w-2.5 h-2.5" />
                                  <span className="text-[9px] font-medium">OFF</span>
                                </div>
                              </div>
                            ) : hasBlocked ? (
                              <div className="h-full flex items-center justify-center">
                                <div className="flex items-center px-1 py-0.5 bg-red-500/20 rounded text-red-400">
                                  <span className="text-[9px] font-medium">X</span>
                                </div>
                              </div>
                            ) : hasOrgBlackout ? (
                              <div className="h-full flex items-center justify-center">
                                <div className="flex items-center px-1 py-0.5 bg-amber-500/20 rounded text-amber-500">
                                  <span className="text-[9px] font-medium">BO</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5 overflow-hidden h-full">
                                {dayShifts.slice(0, 2).map((shift) => {
                                  const jobColor = getJobColorClasses(shift.job);
                                  const shiftDuration = shift.endHour - shift.startHour;
                                  const isDraftShift = isManager && shift.scheduleState === 'draft';
                                  const isBaselinePublished = scheduleMode === 'draft' && shift.scheduleState !== 'draft';

                                  return (
                                    <div
                                      key={shift.id}
                                      data-shift="true"
                                      onClick={(e) => handleShiftClick(shift, e)}
                                      onMouseEnter={() => setHoveredShiftId(shift.id)}
                                      onMouseLeave={() => setHoveredShiftId(null)}
                                      className={`relative px-1 py-0.5 rounded text-[9px] truncate cursor-pointer hover:scale-[1.02] transition-transform ${
                                        isDraftShift ? 'border border-amber-400/60 border-dashed' : ''
                                      } ${isBaselinePublished ? 'ring-1 ring-emerald-400/40' : ''}`}
                                      style={{
                                        backgroundColor: jobColor.bgColor,
                                        borderLeft: `2px solid ${jobColor.color}`,
                                        color: jobColor.color,
                                      }}
                                      title={`${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}`}
                                    >
                                      {isDraftShift && (
                                        <span className="absolute top-0 right-0 px-1 rounded bg-amber-500/30 text-[7px] font-semibold text-amber-100/90">
                                          DRAFT
                                        </span>
                                      )}
                                      {Math.round(shiftDuration)}h
                                    </div>
                                  );
                                })}
                                {dayShifts.length > 2 && (
                                  <span className="text-[9px] text-theme-muted text-center">
                                    +{dayShifts.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

