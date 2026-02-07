'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS } from '../types';
import { formatHourShort, formatHour, shiftsOverlap } from '../utils/timeUtils';
import { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from 'react';
import { Palmtree, ArrowLeftRight, UploadCloud } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';
import { getJobColorClasses } from '../lib/jobColors';
import { ScheduleToolbar } from './ScheduleToolbar';

// Compact timeline sizing - pixels per hour
const DEFAULT_PX_PER_HOUR = 48;

// LocalStorage key for continuous days toggle
const CONTINUOUS_DAYS_KEY = 'schedule_continuous_days';

// Continuous mode: 3-day window (72 hours)
const CONTINUOUS_DAYS_COUNT = 3;
const CONTINUOUS_TOTAL_HOURS = 24 * CONTINUOUS_DAYS_COUNT;
// Continuous mode bounds are locked to ±1 day from the anchor date.
const CONTINUOUS_ANCHOR_RANGE_DAYS = 1;
const HOUR_MS = 60 * 60 * 1000;

const GRID_BACKGROUND_SELECTOR = '[data-grid-background="true"]';
const NON_GRAB_SCROLL_SELECTOR = [
  '[data-shift]',
  '.shift',
  '[data-resize-handle]',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[contenteditable="true"]',
].join(',');

// Helper to get date string (YYYY-MM-DD) from Date using LOCAL timezone
// Note: Using local timezone ensures consistent date comparison for now-line positioning
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get midnight of a date
function getMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Helper to add days to a date
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Format date for day separator label
function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function dateFromDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function Timeline() {
  const {
    selectedDate,
    setSelectedDate,
    getFilteredEmployeesForRestaurant,
    getEmployeesForRestaurant,
    getShiftsForRestaurant,
    businessHours,
    locations,
    hoveredShiftId,
    setHoveredShift,
    openModal,
    modalType,
    showToast,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
    hasOrgBlackoutOnDate,
    dateNavDirection,
    dateNavKey,
    getEffectiveHourRange,
    viewMode,
    workingTodayOnly,
    scheduleViewSettings,
    scheduleMode,
    publishDraftRange,
    copyPreviousDayIntoDraft,
    shifts,
    loadRestaurantData,
  } = useScheduleStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false);
  const timelineResizeRafRef = useRef<number | null>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'prev' | 'next' | null>(null);
  const [timelineWidthPx, setTimelineWidthPx] = useState(0);
  const [tooltip, setTooltip] = useState<{
    shiftId: string;
    left: number;
    top: number;
    employeeName: string;
    job?: string;
    location?: string;
    time: string;
  } | null>(null);
  const [activeDragShiftId, setActiveDragShiftId] = useState<string | null>(null);
  const [activeDragMode, setActiveDragMode] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [dragPreview, setDragPreview] = useState<Record<string, { startHour: number; endHour: number; date?: string }>>({});
  const [commitOverridesVersion, setCommitOverridesVersion] = useState(0);
  const commitOverridesRef = useRef<Record<string, { startDate: string; startHour: number; endDate: string; endHour: number }>>({});
  const pendingShiftChangeRef = useRef<{
    shiftId: string;
    original: { date: string; startHour: number; endHour: number };
    proposed: { date: string; startHour: number; endHour: number };
  } | null>(null);
  const lastModalTypeRef = useRef(modalType);
  const [hoveredAddSlot, setHoveredAddSlot] = useState<{
    employeeId: string;
    date: string;
    startHour: number;
    absHoursFromWindowStart?: number;
  } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const hoverPendingRef = useRef<{ employeeId: string; clientX: number; target: EventTarget | null } | null>(null);
  const lastPointerTypeRef = useRef<'mouse' | 'pen' | 'touch' | null>(null);
  const pointerCaptureElRef = useRef<HTMLElement | null>(null);
  const activeDragRef = useRef<{
    pointerId: number;
    mode: 'move' | 'resize-left' | 'resize-right';
    shiftId: string;
    employeeId: string | null;
    anchorStartMin: number;
    anchorEndMin: number;
    anchorPointerMin: number;
    startClientX: number;
    startClientY: number;
    startedAt: number;
    activated: boolean;
    moved: boolean;
    lastStartMin: number;
    lastEndMin: number;
    dayIndex?: number;
  } | null>(null);

  // Drag-to-scroll state
  const [isDragScrolling, setIsDragScrolling] = useState(false);
  const dragScrollRef = useRef<{
    startX: number;
    scrollLeft: number;
    currentX: number;
  } | null>(null);
  const isDragScrollingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const scrollToDateRef = useRef<(date: Date, options?: { reanchor?: boolean }) => void>(() => {});

  // Continuous Days state
  const [continuousDays, setContinuousDays] = useState(false);
  // Window start date for continuous mode (first of 3 days)
  const [windowStartDate, setWindowStartDate] = useState<Date>(() => addDays(getMidnight(new Date()), -1));
  const continuousAnchorDateRef = useRef<Date | null>(null);

  // Displayed date for the header (based on scroll center in continuous mode)
  const [displayedDate, setDisplayedDate] = useState<Date>(selectedDate);

  const lanePointerRef = useRef<{ x: number; y: number; employeeId: string } | null>(null);
  const lastDragAtRef = useRef(0);

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const isDraftMode = scheduleMode === 'draft';
  const todayYmd = toDateString(new Date());
  const isEditableDate = useCallback((dateStr: string) => dateStr >= todayYmd, [todayYmd]);
  const draftHelperText = 'Changes are not visible to staff until published.';
  const draftBadge = (
    <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-semibold tracking-wide">
      DRAFT MODE
    </span>
  );
  const selectedDateYmd = useMemo(() => toDateString(selectedDate), [selectedDate]);
  const rangeStartDate = continuousDays ? windowStartDate : selectedDate;
  const rangeEndDate = continuousDays ? addDays(windowStartDate, CONTINUOUS_DAYS_COUNT - 1) : selectedDate;
  const rangeStartYmd = useMemo(() => toDateString(rangeStartDate), [rangeStartDate]);
  const rangeEndYmd = useMemo(() => toDateString(rangeEndDate), [rangeEndDate]);
  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';
  const canEditSelectedDate = isManager && isEditableDate(selectedDateYmd);
  const hasDraftOnSelectedDate = useMemo(
    () =>
      shifts.some(
        (shift) =>
          shift.restaurantId === activeRestaurantId &&
          shift.scheduleState === 'draft' &&
          shift.date === selectedDateYmd
      ),
    [activeRestaurantId, selectedDateYmd, shifts]
  );
  const hasDraftInRange = useMemo(
    () =>
      shifts.some(
        (shift) =>
          shift.restaurantId === activeRestaurantId &&
          shift.scheduleState === 'draft' &&
          shift.date >= rangeStartYmd &&
          shift.date <= rangeEndYmd
      ),
    [activeRestaurantId, rangeEndYmd, rangeStartYmd, shifts]
  );
  const publishStatusLabel = hasDraftInRange ? 'DRAFT' : 'PUBLISHED';
  const publishStatusTone = hasDraftInRange
    ? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
    : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40';
  const statusBadge = (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${publishStatusTone}`}>
      {publishStatusLabel}
    </span>
  );
  const showPublishDay = isManager && hasDraftOnSelectedDate;
  const handlePublishDay = useCallback(async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const result = await publishDraftRange({
      startDate: selectedDateYmd,
      endDate: selectedDateYmd,
    });
    if (!result.success) {
      showToast(result.error || 'Unable to publish day.', 'error');
      return;
    }
    await loadRestaurantData(activeRestaurantId);
    showToast('Published day.', 'success');
  }, [activeRestaurantId, loadRestaurantData, publishDraftRange, selectedDateYmd, showToast]);
  const handleCopyPreviousDayIntoDraft = useCallback(async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const result = await copyPreviousDayIntoDraft(selectedDate);
    if (!result.success) {
      showToast(result.error || 'Unable to copy previous day into draft.', 'error');
      return;
    }
    if ((result.sourceCount ?? 0) === 0) {
      showToast('No shifts found for previous day.', 'error');
      return;
    }
    const inserted = result.insertedCount ?? 0;
    const skipped = result.skippedCount ?? 0;
    const countsLabel = ` (${inserted} added${skipped ? `, ${skipped} skipped` : ''})`;
    showToast(`Copied previous day into draft.${countsLabel}`, 'success');
  }, [activeRestaurantId, copyPreviousDayIntoDraft, selectedDate, showToast]);
  const filteredEmployees = getFilteredEmployeesForRestaurant(activeRestaurantId);
  const scopedEmployees = getEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations]
  );

  const jobOrder = useMemo(() => {
    const order: string[] = [];
    scopedEmployees.forEach((employee) => {
      if (!employee.isActive) return;
      const jobs = employee.jobs ?? [];
      jobs.forEach((job) => {
        if (!order.includes(job)) {
          order.push(job);
        }
      });
    });
    return order;
  }, [scopedEmployees]);

  const groupedRows = useMemo(() => {
    if (filteredEmployees.length === 0) return [];
    const rangeStartDate = continuousDays ? windowStartDate : selectedDate;
    const rangeEndDate = continuousDays ? addDays(windowStartDate, CONTINUOUS_DAYS_COUNT - 1) : selectedDate;
    const rangeStart = toDateString(rangeStartDate);
    const rangeEnd = toDateString(rangeEndDate);
    const jobIndex = (job: string) => {
      const idx = jobOrder.indexOf(job);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };

    const filteredIds = new Set(filteredEmployees.map((employee) => employee.id));
    const earliestByEmployee = new Map<string, { date: string; startHour: number; job: string }>();

    scopedShifts.forEach((shift) => {
      if (shift.isBlocked) return;
      if (!filteredIds.has(shift.employeeId)) return;
      if (shift.date < rangeStart || shift.date > rangeEnd) return;
      const jobName = shift.job ?? 'Unassigned';
      const existing = earliestByEmployee.get(shift.employeeId);
      if (!existing) {
        earliestByEmployee.set(shift.employeeId, { date: shift.date, startHour: shift.startHour, job: jobName });
        return;
      }
      if (shift.date < existing.date) {
        earliestByEmployee.set(shift.employeeId, { date: shift.date, startHour: shift.startHour, job: jobName });
        return;
      }
      if (shift.date === existing.date) {
        if (shift.startHour < existing.startHour) {
          earliestByEmployee.set(shift.employeeId, { date: shift.date, startHour: shift.startHour, job: jobName });
          return;
        }
        if (shift.startHour === existing.startHour && jobIndex(jobName) < jobIndex(existing.job)) {
          earliestByEmployee.set(shift.employeeId, { date: shift.date, startHour: shift.startHour, job: jobName });
        }
      }
    });

    const groups = new Map<string, typeof filteredEmployees>();
    const assignToGroup = (job: string, employee: (typeof filteredEmployees)[number]) => {
      if (!groups.has(job)) groups.set(job, []);
      groups.get(job)!.push(employee);
    };

    filteredEmployees.forEach((employee) => {
      const earliest = earliestByEmployee.get(employee.id);
      const preferredJob = earliest?.job && jobOrder.includes(earliest.job) ? earliest.job : 'Unassigned';
      assignToGroup(preferredJob, employee);
    });

    const rows: Array<
      | { type: 'group'; job: string; count: number }
      | { type: 'employee'; employee: (typeof filteredEmployees)[number]; group: string }
    > = [];

    jobOrder.forEach((job) => {
      const list = groups.get(job);
      if (!list || list.length === 0) return;
      rows.push({ type: 'group', job, count: list.length });
      list.forEach((employee) => rows.push({ type: 'employee', employee, group: job }));
    });

    const unassigned = groups.get('Unassigned');
    if (unassigned && unassigned.length > 0) {
      rows.push({ type: 'group', job: 'Unassigned', count: unassigned.length });
      unassigned.forEach((employee) => rows.push({ type: 'employee', employee, group: 'Unassigned' }));
    }

    return rows;
  }, [filteredEmployees, scopedShifts, jobOrder, selectedDate, continuousDays, windowStartDate]);

  // Load continuous days preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(CONTINUOUS_DAYS_KEY);
    if (saved === 'true') {
      setContinuousDays(true);
    }
  }, []);

  useEffect(() => {
    if (continuousDays) {
      if (!continuousAnchorDateRef.current) {
        continuousAnchorDateRef.current = getMidnight(selectedDate);
      }
    } else if (continuousAnchorDateRef.current) {
      continuousAnchorDateRef.current = null;
    }
  }, [continuousDays, selectedDate]);


  // Fit timeline grid width to available space
  useLayoutEffect(() => {
    if (continuousDays) return;
    const el = gridScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateWidth = (nextWidth: number) => {
      setTimelineWidthPx((prev) => (Math.abs(prev - nextWidth) > 0.5 ? nextWidth : prev));
    };

    updateWidth(el.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = entry.contentRect.width;
      if (timelineResizeRafRef.current !== null) {
        cancelAnimationFrame(timelineResizeRafRef.current);
      }
      timelineResizeRafRef.current = requestAnimationFrame(() => {
        timelineResizeRafRef.current = null;
        updateWidth(nextWidth);
      });
    });

    observer.observe(el);

    return () => {
      if (timelineResizeRafRef.current !== null) {
        cancelAnimationFrame(timelineResizeRafRef.current);
        timelineResizeRafRef.current = null;
      }
      observer.disconnect();
    };
  }, [continuousDays]);

  // Save continuous days preference to localStorage
  const toggleContinuousDays = useCallback(() => {
    setContinuousDays((prev) => {
      const next = !prev;
      if (next) {
        continuousAnchorDateRef.current = getMidnight(selectedDate);
      } else {
        continuousAnchorDateRef.current = null;
      }
      localStorage.setItem(CONTINUOUS_DAYS_KEY, String(next));
      return next;
    });
  }, [selectedDate]);

  // Single-day mode values
  const dayOfWeek = selectedDate.getDay();
  const { startHour: HOURS_START, endHour: HOURS_END } = getEffectiveHourRange(dayOfWeek);
  const TOTAL_HOURS = HOURS_END - HOURS_START;
  const totalHoursForScale = Math.max(1, TOTAL_HOURS);
  const gridViewportWidth = timelineWidthPx > 0 ? timelineWidthPx : totalHoursForScale * DEFAULT_PX_PER_HOUR;
  const pxPerHour = continuousDays ? DEFAULT_PX_PER_HOUR : gridViewportWidth / totalHoursForScale;
  const singleDayHours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);
  const singleDayGridWidth = TOTAL_HOURS * pxPerHour;
  const dateString = toDateString(selectedDate);

  // Continuous mode values
  const continuousGridWidth = CONTINUOUS_TOTAL_HOURS * pxPerHour;

  const continuousDaysData = useMemo(() => {
    if (!continuousDays) return [];
    return Array.from({ length: CONTINUOUS_DAYS_COUNT }, (_, dayIndex) => {
      const date = addDays(windowStartDate, dayIndex);
      return {
        dayIndex,
        date,
        dateString: toDateString(date),
        hours: Array.from({ length: 24 }, (_, h) => h),
      };
    });
  }, [continuousDays, windowStartDate]);

  const continuousShifts = useMemo(() => {
    if (!continuousDays) return [];
    const dateStrings = continuousDaysData.map((d) => d.dateString);
    return scopedShifts.filter((s) => dateStrings.includes(s.date) && !s.isBlocked);
  }, [continuousDays, continuousDaysData, scopedShifts]);

  const getDayIndexForDateString = useCallback(
    (targetDate: string) => continuousDaysData.findIndex((d) => d.dateString === targetDate),
    [continuousDaysData]
  );


  // Parse business hours for a specific day of week
  const parseTimeToDecimal = (value?: string | null) => {
    if (!value) return 0;
    const [hours, minutes = '0'] = value.split(':');
    const hour = Number(hours);
    const minute = Number(minutes);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
    return hour + minute / 60;
  };

  const getBusinessHoursForDate = useCallback((date: Date) => {
    const dow = date.getDay();
    const hoursRow = businessHours.find((row) => row.dayOfWeek === dow && row.enabled);
    if (!hoursRow) return null;
    const openHour = parseTimeToDecimal(hoursRow.openTime);
    const closeHour = parseTimeToDecimal(hoursRow.closeTime);
    if (!closeHour || closeHour <= openHour) return null;
    return { openHour, closeHour };
  }, [businessHours]);

  const getBusinessHoursForDateString = useCallback(
    (dateString: string) => getBusinessHoursForDate(dateFromDateString(dateString)),
    [getBusinessHoursForDate]
  );

  const getCenteredStartHour = useCallback(
    (hoveredHour: number, businessStart: number, businessEnd: number) => {
      const hoveredMinutes = hoveredHour * 60;
      const centeredStartMinutes = hoveredMinutes - 30;
      const roundedStartMinutes = Math.round(centeredStartMinutes / 30) * 30;
      const minStartMinutes = businessStart * 60;
      const maxStartMinutes = businessEnd * 60 - 60;
      const clampedStartMinutes = Math.max(minStartMinutes, Math.min(maxStartMinutes, roundedStartMinutes));
      return clampedStartMinutes / 60;
    },
    []
  );

  const businessHoursForDay = useMemo(() => {
    return getBusinessHoursForDate(selectedDate);
  }, [getBusinessHoursForDate, selectedDate]);

  const anchorDate = useMemo(() => {
    return continuousAnchorDateRef.current ?? getMidnight(selectedDate);
  }, [selectedDate, continuousDays]);

  const minAllowedDate = useMemo(() => {
    return getMidnight(addDays(anchorDate, -CONTINUOUS_ANCHOR_RANGE_DAYS));
  }, [anchorDate]);

  const maxAllowedDate = useMemo(() => {
    return endOfDay(addDays(anchorDate, CONTINUOUS_ANCHOR_RANGE_DAYS));
  }, [anchorDate]);

  const clampDateToContinuousBounds = useCallback((date: Date) => {
    const time = date.getTime();
    if (time < minAllowedDate.getTime()) return new Date(minAllowedDate);
    if (time > maxAllowedDate.getTime()) return new Date(maxAllowedDate);
    return date;
  }, [minAllowedDate, maxAllowedDate]);

  // ─────────────────────────────────────────────────────────────────
  // Position helpers
  // ─────────────────────────────────────────────────────────────────

  // Single-day mode: position as percentage
  const getShiftPositionForRange = useCallback((startHour: number, endHour: number) => {
    const left = ((startHour - HOURS_START) / TOTAL_HOURS) * 100;
    const width = ((endHour - startHour) / TOTAL_HOURS) * 100;
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - Math.max(0, left), Math.max(0, width))}%`,
    };
  }, [HOURS_START, TOTAL_HOURS]);

  // Continuous mode: position in pixels based on absolute time within window
  const getShiftPositionContinuous = useCallback((shiftDate: string, startHour: number, endHour: number) => {
    // Find which day this shift belongs to
    const dayIndex = continuousDaysData.findIndex(d => d.dateString === shiftDate);
    if (dayIndex === -1) return null;

    // Calculate pixel offset from window start
    const hoursFromWindowStart = dayIndex * 24 + startHour;
    const leftPx = hoursFromWindowStart * pxPerHour;
    const widthPx = (endHour - startHour) * pxPerHour;

    return { leftPx, widthPx };
  }, [continuousDaysData, pxPerHour]);

  // ─────────────────────────────────────────────────────────────────
  // Current time indicator
  // ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isToday = selectedDate.toDateString() === now.toDateString();

  // Single-day current time position
  const currentTimePosition = isToday && currentHour >= HOURS_START && currentHour <= HOURS_END
    ? ((currentHour - HOURS_START) / TOTAL_HOURS) * 100
    : null;

  // Continuous mode current time position (in pixels)
  const currentTimePositionContinuous = useMemo(() => {
    if (!continuousDays) return null;
    const todayString = toDateString(now);
    const dayIndex = continuousDaysData.findIndex(d => d.dateString === todayString);
    if (dayIndex === -1) return null;
    return (dayIndex * 24 + currentHour) * pxPerHour;
  }, [continuousDays, continuousDaysData, currentHour, now, pxPerHour]);

  // ─────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────


  // Recenter scroll to a specific date in continuous mode.
  // Keep this above any hooks that call it to avoid TDZ in dependency arrays.
  // When reanchor=true, bypass clamping (used for Today button to avoid stale closure issue).
  const scrollToDate = useCallback((targetDate: Date, options?: { reanchor?: boolean }) => {
    if (!continuousDays || !gridScrollRef.current) return;
    const normalizedTarget = getMidnight(targetDate);
    // When reanchoring, use the target directly (no clamping to old anchor bounds)
    const effectiveTarget = options?.reanchor ? normalizedTarget : clampDateToContinuousBounds(normalizedTarget);
    // Reset window around target date (yesterday/target/tomorrow)
    const nextWindowStart = addDays(effectiveTarget, -1);
    setWindowStartDate(nextWindowStart);
    setDisplayedDate(effectiveTarget);
    // Use double-RAF to ensure DOM has updated with new windowStartDate before scrolling
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gridScrollRef.current) {
          const el = gridScrollRef.current;
          // Target is day index 1 in the new window (yesterday=0, target=1, tomorrow=2)
          // Center around business hours start or noon
          const targetDayBusinessHours = getBusinessHoursForDate(effectiveTarget);
          const centerHour = targetDayBusinessHours ? targetDayBusinessHours.openHour + 2 : 12;
          const hoursFromWindowStart = 24 + centerHour; // day 1 (24h offset) + center hour
          const desired = hoursFromWindowStart * pxPerHour - el.clientWidth / 2;
          const maxScroll = el.scrollWidth - el.clientWidth;
          el.scrollLeft = Math.max(0, Math.min(maxScroll, desired));
        }
      });
    });
  }, [continuousDays, clampDateToContinuousBounds, getBusinessHoursForDate, pxPerHour]);

  useEffect(() => {
    scrollToDateRef.current = scrollToDate;
  }, [scrollToDate]);

  // When toggling continuous mode ON, initialize window around selectedDate.
  // Note: handleGoToDate handles scrolling for navigation, so this only triggers on mode toggle.
  const prevContinuousDaysRef = useRef(continuousDays);
  useEffect(() => {
    const wasOff = !prevContinuousDaysRef.current;
    const isNowOn = continuousDays;
    prevContinuousDaysRef.current = continuousDays;
    // Only initialize when toggling from OFF to ON
    if (wasOff && isNowOn) {
      continuousAnchorDateRef.current = getMidnight(selectedDate);
      scrollToDateRef.current(selectedDate, { reanchor: true });
    }
  }, [continuousDays, selectedDate]);

  const handleGoToDate = useCallback((targetDate: Date, options?: { reanchor?: boolean }) => {
    const normalized = getMidnight(targetDate);
    if (continuousDays) {
      if (options?.reanchor) {
        // Update anchor BEFORE scrolling so the new window is centered on the target
        continuousAnchorDateRef.current = normalized;
      }
      setSelectedDate(normalized);
      // Pass reanchor option to scrollToDate to bypass stale clamp bounds
      scrollToDateRef.current(normalized, { reanchor: options?.reanchor });
      return;
    }
    setSelectedDate(normalized);
  }, [continuousDays, setSelectedDate]);

  const handleToday = useCallback(() => {
    handleGoToDate(new Date(), { reanchor: true });
  }, [handleGoToDate]);

  // ─────────────────────────────────────────────────────────────────
  // Continuous mode: Recycling (infinite scroll feel)
  // ─────────────────────────────────────────────────────────────────
  const checkAndRecycle = useCallback(() => {}, []);

  const displayRafRef = useRef<number | null>(null);

  // Update displayed date based on scroll center
  const updateDisplayedDateFromScroll = useCallback(() => {
    if (!continuousDays || !gridScrollRef.current) return;
    if (displayRafRef.current !== null) return;
    displayRafRef.current = requestAnimationFrame(() => {
      displayRafRef.current = null;
      if (!gridScrollRef.current) return;
      const el = gridScrollRef.current;
      const scrollCenter = el.scrollLeft + el.clientWidth / 2;
      const hoursFromStart = scrollCenter / pxPerHour;
      const dayIndex = Math.floor(hoursFromStart / 24);

      if (dayIndex >= 0 && dayIndex < CONTINUOUS_DAYS_COUNT) {
        const centerDate = addDays(windowStartDate, dayIndex);
        if (centerDate.toDateString() !== displayedDate.toDateString()) {
          setDisplayedDate(centerDate);
        }
      }
    });
  }, [continuousDays, windowStartDate, displayedDate, pxPerHour]);

  // ─────────────────────────────────────────────────────────────────
  // Shift interaction helpers
  // ─────────────────────────────────────────────────────────────────
  const getSingleDayXInGridPx = useCallback((clientX: number) => {
    if (!gridScrollRef.current) return null;
    const el = gridScrollRef.current;
    const rect = el.getBoundingClientRect();
    const xInGrid = clientX - rect.left + el.scrollLeft;
    return { rect, xInGrid, scrollWidth: el.scrollWidth };
  }, []);

  const getHourFromClientX = useCallback((clientX: number): number => {
    const metrics = getSingleDayXInGridPx(clientX);
    if (!metrics) return HOURS_START;
    const percentage = metrics.xInGrid / (metrics.scrollWidth || metrics.rect.width);
    const hour = HOURS_START + percentage * TOTAL_HOURS;
    return Math.max(HOURS_START, Math.min(HOURS_END, Math.round(hour * 4) / 4));
  }, [HOURS_START, HOURS_END, TOTAL_HOURS, getSingleDayXInGridPx]);

  const getSnappedStartHourFromClientX = useCallback((clientX: number): number | null => {
    const metrics = getSingleDayXInGridPx(clientX);
    if (!metrics) return null;
    const hourIndex = Math.floor(metrics.xInGrid / pxPerHour);
    const clampedIndex = Math.max(0, Math.min(TOTAL_HOURS - 1, hourIndex));
    return HOURS_START + clampedIndex;
  }, [HOURS_START, TOTAL_HOURS, getSingleDayXInGridPx, pxPerHour]);

  // Absolute grid mapping for move/resize - use full scroll width, not view hours.
  const getDayMinutesFromClientX = useCallback((clientX: number): number => {
    if (!gridScrollRef.current) return 0;
    const el = gridScrollRef.current;
    const rect = el.getBoundingClientRect();
    const xInGrid = clientX - rect.left + el.scrollLeft;
    const totalMinutes = 24 * 60;
    const minutes = (xInGrid / el.scrollWidth) * totalMinutes;
    return Math.max(0, Math.min(totalMinutes, minutes));
  }, []);

  const getContinuousMinutesFromClientX = useCallback((clientX: number): number => {
    if (!gridScrollRef.current) return 0;
    const el = gridScrollRef.current;
    const rect = el.getBoundingClientRect();
    const xInGrid = clientX - rect.left + el.scrollLeft;
    const totalMinutes = CONTINUOUS_TOTAL_HOURS * 60;
    const minutes = (xInGrid / el.scrollWidth) * totalMinutes;
    return Math.max(0, Math.min(totalMinutes, minutes));
  }, []);

  const getContinuousGridMetrics = useCallback((clientX: number) => {
    if (!gridScrollRef.current) return null;
    const el = gridScrollRef.current;
    const rect = el.getBoundingClientRect();
    const gridLeft = rect.left;
    const scrollLeft = el.scrollLeft;
    const xInGrid = clientX - gridLeft + scrollLeft;
    return { el, gridLeft, scrollLeft, xInGrid, pxPerHour, windowStartDate };
  }, [windowStartDate, pxPerHour]);

  const getContinuousHourInfoFromClientX = useCallback((clientX: number) => {
    const metrics = getContinuousGridMetrics(clientX);
    if (!metrics) return null;
    const hoursFromStart = metrics.xInGrid / pxPerHour;
    const dayIndex = Math.floor(hoursFromStart / 24);
    const hourInDay = hoursFromStart % 24;
    return { hoursFromStart, dayIndex, hourInDay, el: metrics.el, scrollLeft: metrics.scrollLeft, xInGrid: metrics.xInGrid };
  }, [getContinuousGridMetrics, pxPerHour]);

  // For continuous mode: get hour and date from clientX
  const getHourAndDateFromClientX = useCallback((clientX: number): { hour: number; date: string } | null => {
    if (!continuousDays || !gridScrollRef.current) return null;

    const info = getContinuousHourInfoFromClientX(clientX);
    if (!info) return null;
    const { dayIndex, hourInDay } = info;

    if (dayIndex < 0 || dayIndex >= CONTINUOUS_DAYS_COUNT) return null;

    const targetDate = addDays(windowStartDate, dayIndex);
    return {
      hour: Math.max(0, Math.min(24, Math.round(hourInDay * 4) / 4)),
      date: toDateString(targetDate),
    };
  }, [continuousDays, windowStartDate, getContinuousHourInfoFromClientX]);

  const openShiftEditor = useCallback(
    (shift: typeof scopedShifts[0]) => {
      if (shift.isBlocked) return;
      if (!isManager) return;
      if (!isEditableDate(shift.date)) {
        showToast("Past schedules can't be edited.", 'error');
        return;
      }
      openModal('editShift', shift);
    },
    [isEditableDate, isManager, openModal, showToast]
  );

  const showTooltipFn = (shiftId: string, target: HTMLElement) => {
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

  const handleEmptyClick = (employeeId: string, e: React.MouseEvent, targetDate?: string) => {
    const dateToUse = targetDate || dateString;
    if (!isManager) return;
    if (!isEditableDate(dateToUse)) {
      showToast("Past schedules can't be edited.", 'error');
      return;
    }
    const baseHour = continuousDays
      ? (getHourAndDateFromClientX(e.clientX)?.hour ?? 9)
      : getHourFromClientX(e.clientX);
    const hour = hoveredAddSlot?.employeeId === employeeId && hoveredAddSlot.date === dateToUse
      ? hoveredAddSlot.startHour
      : baseHour;
    const businessHours = continuousDays
      ? getBusinessHoursForDateString(dateToUse)
      : businessHoursForDay;
    if (!businessHours) return;
    if (hour < businessHours.openHour || hour + 1 > businessHours.closeHour) return;
    const defaultEnd = Math.round((hour + 1) * 4) / 4;

    const hasOverlap = scopedShifts.some(
      (shift) =>
        shift.employeeId === employeeId &&
        shift.date === dateToUse &&
        !shift.isBlocked &&
        shiftsOverlap(hour, defaultEnd, shift.startHour, shift.endHour)
    );
    if (hasOverlap) {
      showToast('Shift overlaps with existing shift', 'error');
      return;
    }
    openModal('addShift', {
      employeeId,
      date: dateToUse,
      startHour: hour,
      endHour: defaultEnd,
    });
  };
  const updateHoverAddSlot = useCallback((employeeId: string, clientX: number, target: EventTarget | null) => {
    if (lastPointerTypeRef.current === 'touch') {
      setHoveredAddSlot(null);
      return;
    }
    if (isDragScrolling || activeDragRef.current) {
      setHoveredAddSlot(null);
      return;
    }
    const element = target as HTMLElement | null;
    if (element?.closest(NON_GRAB_SCROLL_SELECTOR)) {
      setHoveredAddSlot(null);
      return;
    }
    if (continuousDays) {
      const info = getContinuousHourInfoFromClientX(clientX);
      if (!info) {
        setHoveredAddSlot(null);
        return;
      }
      if (info.dayIndex < 0 || info.dayIndex >= CONTINUOUS_DAYS_COUNT) {
        setHoveredAddSlot(null);
        return;
      }
      const targetDate = addDays(windowStartDate, info.dayIndex);
      const dateValue = toDateString(targetDate);
      if (!isEditableDate(dateValue)) {
        setHoveredAddSlot(null);
        return;
      }
      const bh = getBusinessHoursForDate(targetDate);
      if (!bh) {
        setHoveredAddSlot(null);
        return;
      }
      const startHour = getCenteredStartHour(info.hourInDay, bh.openHour, bh.closeHour);
      const inside = startHour >= bh.openHour && startHour + 1 <= bh.closeHour;
      if (!inside) {
        setHoveredAddSlot(null);
        return;
      }
      setHoveredAddSlot((prev) => {
        if (
          prev &&
          prev.employeeId === employeeId &&
          prev.date === dateValue &&
          prev.startHour === startHour &&
          prev.absHoursFromWindowStart === info.dayIndex * 24 + startHour
        ) {
          return prev;
        }
        return { employeeId, date: dateValue, startHour, absHoursFromWindowStart: info.dayIndex * 24 + startHour };
      });
      return;
    }
    if (!businessHoursForDay) {
      setHoveredAddSlot(null);
      return;
    }
    if (!isEditableDate(dateString)) {
      setHoveredAddSlot(null);
      return;
    }
    const startHour = getSnappedStartHourFromClientX(clientX);
    if (startHour === null) {
      setHoveredAddSlot(null);
      return;
    }
    const inside = startHour >= businessHoursForDay.openHour && startHour + 1 <= businessHoursForDay.closeHour;
    if (!inside) {
      setHoveredAddSlot(null);
      return;
    }
    setHoveredAddSlot((prev) => {
      if (prev && prev.employeeId === employeeId && prev.date === dateString && prev.startHour === startHour) {
        return prev;
      }
      return { employeeId, date: dateString, startHour };
    });
  }, [
    isDragScrolling,
    continuousDays,
    isEditableDate,
    getContinuousHourInfoFromClientX,
    getBusinessHoursForDate,
    getHourFromClientX,
    getSnappedStartHourFromClientX,
    businessHoursForDay,
    dateString,
    windowStartDate,
  ]);

  const clearHoverAddSlot = useCallback(() => {
    if (hoverRafRef.current !== null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    hoverPendingRef.current = null;
    setHoveredAddSlot(null);
  }, []);
  const handleLanePointerMove = useCallback((employeeId: string, e: React.PointerEvent) => {
    if (!isManager) return;
    lastPointerTypeRef.current = e.pointerType as 'mouse' | 'pen' | 'touch';
    if (e.pointerType === 'touch') {
      clearHoverAddSlot();
      return;
    }
    hoverPendingRef.current = { employeeId, clientX: e.clientX, target: e.target };
    if (hoverRafRef.current !== null) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      const pending = hoverPendingRef.current;
      hoverPendingRef.current = null;
      hoverRafRef.current = null;
      if (!pending) return;
      updateHoverAddSlot(pending.employeeId, pending.clientX, pending.target);
    });
  }, [clearHoverAddSlot, isManager, updateHoverAddSlot]);

  const handleLaneMouseDown = (employeeId: string, e: React.MouseEvent) => {
    if (!isManager) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    lanePointerRef.current = { x: e.clientX, y: e.clientY, employeeId };
  };

  const handleLaneMouseUp = (employeeId: string, e: React.MouseEvent, targetDate?: string) => {
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
    handleEmptyClick(employeeId, e, targetDate);
  };

  const isWithinBusinessHours = useCallback((clientX: number) => {
    if (continuousDays) {
      const info = getHourAndDateFromClientX(clientX);
      // If we can't determine position, allow grab scroll (return false = not in business hours)
      if (!info) return false;
      const bh = getBusinessHoursForDate(dateFromDateString(info.date));
      if (!bh) return false;
      return info.hour >= bh.openHour && info.hour <= bh.closeHour;
    }
    if (!businessHoursForDay) return false;
    const hour = getHourFromClientX(clientX);
    return hour >= businessHoursForDay.openHour && hour <= businessHoursForDay.closeHour;
  }, [continuousDays, getHourAndDateFromClientX, getBusinessHoursForDate, businessHoursForDay, getHourFromClientX]);

  const shouldStartGrabScroll = useCallback((target: EventTarget | null, clientX: number) => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (!element.closest(GRID_BACKGROUND_SELECTOR)) return false;
    if (element.closest(NON_GRAB_SCROLL_SELECTOR)) return false;
    if (isWithinBusinessHours(clientX)) return false;
    return true;
  }, [isWithinBusinessHours]);

  // ─────────────────────────────────────────────────────────────────
  // Drag-to-scroll handlers
  // ─────────────────────────────────────────────────────────────────
  const handleGridDragStart = useCallback((clientX: number) => {
    if (!gridScrollRef.current) return;
    setIsDragScrolling(true);
    isDragScrollingRef.current = true;
    setHoveredAddSlot(null);
    dragScrollRef.current = {
      startX: clientX,
      scrollLeft: gridScrollRef.current.scrollLeft,
      currentX: clientX,
    };
  }, []);

  const handleGridDragMove = useCallback((clientX: number) => {
    if (!isDragScrolling || !dragScrollRef.current || !gridScrollRef.current) return;

    const el = gridScrollRef.current;
    dragScrollRef.current.currentX = clientX;

    const dx = clientX - dragScrollRef.current.startX;
    const desired = dragScrollRef.current.scrollLeft - dx;
    if (continuousDays) {
      const maxScroll = el.scrollWidth - el.clientWidth;
      el.scrollLeft = Math.max(0, Math.min(maxScroll, desired));
    } else {
      el.scrollLeft = desired;
    }

    // In continuous mode, check for recycling
    if (continuousDays) {
      updateDisplayedDateFromScroll();
    }
  }, [isDragScrolling, continuousDays, updateDisplayedDateFromScroll]);

  const handleGridDragEnd = useCallback(() => {
    setIsDragScrolling(false);
    isDragScrollingRef.current = false;
    activePointerIdRef.current = null;
    dragScrollRef.current = null;
  }, []);

  const getGridBackgroundContext = useCallback((target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    if (!element) return null;
    const gridBgEl = element.closest(GRID_BACKGROUND_SELECTOR) as HTMLElement | null;
    if (!gridBgEl) return null;
    const employeeId = gridBgEl.getAttribute('data-employee-id');
    if (!employeeId) return null;
    return { gridBgEl, employeeId };
  }, []);

  const SNAP_MINUTES = 15;
  const MIN_DURATION_MINUTES = 15;
  const DRAG_ACTIVATION_DISTANCE = 4;
  const CLICK_DISTANCE = 2;
  const CLICK_DURATION_MS = 250;

  const snapMinutes = (value: number) => Math.round(value / SNAP_MINUTES) * SNAP_MINUTES;

  const resolveAbsoluteMinutes = useCallback(
    (absMinutes: number) => {
      const totalMinutes = CONTINUOUS_TOTAL_HOURS * 60;
      const clamped = Math.max(0, Math.min(totalMinutes, absMinutes));
      let dayOffset = Math.floor(clamped / (24 * 60));
      let minutesOfDay = clamped - dayOffset * 24 * 60;
      if (minutesOfDay < 0) {
        minutesOfDay += 24 * 60;
        dayOffset -= 1;
      }
      if (minutesOfDay >= 24 * 60) {
        minutesOfDay -= 24 * 60;
        dayOffset += 1;
      }
      return {
        date: toDateString(addDays(windowStartDate, dayOffset)),
        hour: minutesOfDay / 60,
      };
    },
    [windowStartDate]
  );

  const clampMoveRange = (startMinutes: number, endMinutes: number, minMinutes: number, maxMinutes: number) => {
    let nextStart = startMinutes;
    let nextEnd = endMinutes;
    if (nextStart < minMinutes) {
      const offset = minMinutes - nextStart;
      nextStart += offset;
      nextEnd += offset;
    }
    if (nextEnd > maxMinutes) {
      const offset = nextEnd - maxMinutes;
      nextStart -= offset;
      nextEnd -= offset;
    }
    if (nextEnd - nextStart < MIN_DURATION_MINUTES) {
      nextEnd = Math.min(maxMinutes, nextStart + MIN_DURATION_MINUTES);
      nextStart = Math.max(minMinutes, nextEnd - MIN_DURATION_MINUTES);
    }
    return { start: nextStart, end: nextEnd };
  };

  const clampResizeRange = (
    startMinutes: number,
    endMinutes: number,
    minMinutes: number,
    maxMinutes: number,
    edge: 'left' | 'right'
  ) => {
    let nextStart = startMinutes;
    let nextEnd = endMinutes;
    if (edge === 'left') {
      nextStart = Math.min(nextStart, nextEnd - MIN_DURATION_MINUTES);
      nextStart = Math.max(minMinutes, nextStart);
    } else {
      nextEnd = Math.max(nextEnd, nextStart + MIN_DURATION_MINUTES);
      nextEnd = Math.min(maxMinutes, nextEnd);
    }
    if (nextEnd - nextStart < MIN_DURATION_MINUTES) {
      nextEnd = Math.min(maxMinutes, nextStart + MIN_DURATION_MINUTES);
      nextStart = Math.max(minMinutes, nextEnd - MIN_DURATION_MINUTES);
    }
    return { start: nextStart, end: nextEnd };
  };
  const clearActiveDrag = useCallback(() => {
    const drag = activeDragRef.current;
    if (drag && pointerCaptureElRef.current) {
      try {
        pointerCaptureElRef.current.releasePointerCapture(drag.pointerId);
      } catch {
        // noop
      }
    }
    pointerCaptureElRef.current = null;
    activePointerIdRef.current = null;
    activeDragRef.current = null;
    setActiveDragShiftId(null);
    setActiveDragMode(null);
    setDragPreview((prev) => {
      if (!drag) return prev;
      const next = { ...prev };
      delete next[drag.shiftId];
      return next;
    });
    if (gridScrollRef.current) {
      gridScrollRef.current.style.touchAction = 'pan-y';
    }
  }, []);

  useEffect(() => {
    const overrides = commitOverridesRef.current;
    const ids = Object.keys(overrides);
    if (ids.length === 0) return;
    const EPS = 0.25;
    let changed = false;
    for (const shiftId of ids) {
      const override = overrides[shiftId];
      const shift = scopedShifts.find((s) => String(s.id) === String(shiftId));
      if (!shift) {
        delete overrides[shiftId];
        changed = true;
        continue;
      }
      if (shift.date !== override.startDate) continue;
      const startMatch = Math.abs(shift.startHour - override.startHour) <= EPS;
      const endMatch = Math.abs(shift.endHour - override.endHour) <= EPS;
      if (startMatch && endMatch) {
        delete overrides[shiftId];
        changed = true;
      }
    }
    if (changed) {
      setCommitOverridesVersion((v) => v + 1);
    }
  }, [scopedShifts, commitOverridesVersion]);

  useEffect(() => {
    const wasEdit = lastModalTypeRef.current === 'editShift';
    if (wasEdit && modalType !== 'editShift') {
      const pending = pendingShiftChangeRef.current;
      if (pending) {
        delete commitOverridesRef.current[pending.shiftId];
        setCommitOverridesVersion((v) => v + 1);
        setDragPreview((prev) => {
          if (!prev[pending.shiftId]) return prev;
          const next = { ...prev };
          delete next[pending.shiftId];
          return next;
        });
        pendingShiftChangeRef.current = null;
      }
    }
    lastModalTypeRef.current = modalType;
  }, [modalType]);

  const handleGridPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    lastPointerTypeRef.current = e.pointerType as 'mouse' | 'pen' | 'touch';
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (activeDragRef.current) return;

    const target = e.target as HTMLElement | null;
    const handleEl = target?.closest('[data-resize-handle="true"]') as HTMLElement | null;
    const bodyEl = target?.closest('[data-shift-body="true"]') as HTMLElement | null;
    const rootEl = (handleEl ?? bodyEl ?? target)?.closest('[data-shift-root="true"]') as HTMLElement | null;

    if ((handleEl || bodyEl || rootEl) && isManager) {
      const shiftIdRaw = rootEl?.getAttribute('data-shift-id');
      const shift = shiftIdRaw ? scopedShifts.find((s) => String(s.id) === String(shiftIdRaw)) : null;
      if (!shift) return;
      if (!isEditableDate(shift.date)) {
        showToast("Past schedules can't be edited.", 'error');
        return;
      }

      const edge = handleEl?.getAttribute('data-edge');
      const mode: 'move' | 'resize-left' | 'resize-right' = handleEl
        ? edge === 'left'
          ? 'resize-left'
          : 'resize-right'
        : 'move';

      const anchorPointerMin = continuousDays
        ? getContinuousMinutesFromClientX(e.clientX)
        : getDayMinutesFromClientX(e.clientX);
      const dayIndex = continuousDays ? getDayIndexForDateString(shift.date) : undefined;
      const effectiveDayIndex = dayIndex !== undefined && dayIndex >= 0 ? dayIndex : 0;
      const anchorStartMin = continuousDays
        ? effectiveDayIndex * 24 * 60 + shift.startHour * 60
        : shift.startHour * 60;
      const anchorEndMin = continuousDays
        ? effectiveDayIndex * 24 * 60 + shift.endHour * 60
        : shift.endHour * 60;

      activeDragRef.current = {
        pointerId: e.pointerId,
        mode,
        shiftId: String(shift.id),
        employeeId: shift.employeeId ? String(shift.employeeId) : null,
        anchorStartMin,
        anchorEndMin,
        anchorPointerMin,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startedAt: Date.now(),
        activated: false,
        moved: false,
        lastStartMin: anchorStartMin,
        lastEndMin: anchorEndMin,
        dayIndex: continuousDays ? effectiveDayIndex : undefined,
      };

      activePointerIdRef.current = e.pointerId;
      setHoveredAddSlot(null);
      if (gridScrollRef.current) {
        gridScrollRef.current.style.touchAction = 'none';
      }
      const captureEl = gridScrollRef.current ?? e.currentTarget;
      pointerCaptureElRef.current = captureEl;
      try {
        captureEl.setPointerCapture(e.pointerId);
      } catch {
        // noop
      }
      if (e.pointerType === 'mouse' && e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
      return;
    }

    const ctx = getGridBackgroundContext(e.target);
    if (!ctx) return;
    if (shouldStartGrabScroll(e.target, e.clientX)) {
      e.preventDefault();
      activePointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // noop
      }
      handleGridDragStart(e.clientX);
      return;
    }
    if (e.pointerType !== 'touch') {
      handleLaneMouseDown(ctx.employeeId, e as unknown as React.MouseEvent);
    }
  }, [
    continuousDays,
    getContinuousMinutesFromClientX,
    getDayMinutesFromClientX,
    getDayIndexForDateString,
    getGridBackgroundContext,
    handleGridDragStart,
    handleLaneMouseDown,
    isEditableDate,
    isManager,
    scopedShifts,
    shouldStartGrabScroll,
    showToast,
  ]);

  const handleGridPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (drag) {
      if (drag.pointerId !== e.pointerId) return;
      if (e.cancelable) e.preventDefault();
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (!drag.activated && dist >= DRAG_ACTIVATION_DISTANCE) {
        drag.activated = true;
        setActiveDragShiftId(drag.shiftId);
        setActiveDragMode(drag.mode);
      }
      if (!drag.activated) return;

      const pointerMin = continuousDays
        ? getContinuousMinutesFromClientX(e.clientX)
        : getDayMinutesFromClientX(e.clientX);
      const deltaMinutes = pointerMin - drag.anchorPointerMin;

      let nextStart = drag.anchorStartMin;
      let nextEnd = drag.anchorEndMin;
      if (drag.mode === 'move') {
        nextStart += deltaMinutes;
        nextEnd += deltaMinutes;
      } else if (drag.mode === 'resize-left') {
        nextStart += deltaMinutes;
      } else {
        nextEnd += deltaMinutes;
      }

      nextStart = snapMinutes(nextStart);
      nextEnd = snapMinutes(nextEnd);

      if (continuousDays) {
        const totalWindowMinutes = CONTINUOUS_TOTAL_HOURS * 60;
        let clamped;
        if (drag.mode === 'move') {
          const moved = clampMoveRange(nextStart, nextEnd, 0, totalWindowMinutes);
          const dayIndex = Math.floor(moved.start / (24 * 60));
          const dayStart = dayIndex * 24 * 60;
          const dayEnd = dayStart + 24 * 60;
          clamped = clampMoveRange(moved.start, moved.end, dayStart, dayEnd);
        } else {
          const dayIndex = drag.dayIndex ?? Math.floor(drag.anchorStartMin / (24 * 60));
          const dayStart = dayIndex * 24 * 60;
          const dayEnd = dayStart + 24 * 60;
          clamped = clampResizeRange(nextStart, nextEnd, dayStart, dayEnd, drag.mode === 'resize-left' ? 'left' : 'right');
        }
        drag.lastStartMin = clamped.start;
        drag.lastEndMin = clamped.end;
        drag.moved = true;
        const startInfo = resolveAbsoluteMinutes(clamped.start);
        const endInfo = resolveAbsoluteMinutes(clamped.end);
        setDragPreview((prev) => ({
          ...prev,
          [drag.shiftId]: { startHour: startInfo.hour, endHour: endInfo.hour, date: startInfo.date },
        }));
        return;
      }

      const clamped = drag.mode === 'move'
        ? clampMoveRange(nextStart, nextEnd, 0, 24 * 60)
        : clampResizeRange(nextStart, nextEnd, 0, 24 * 60, drag.mode === 'resize-left' ? 'left' : 'right');

      drag.lastStartMin = clamped.start;
      drag.lastEndMin = clamped.end;
      drag.moved = true;
      setDragPreview((prev) => ({
        ...prev,
        [drag.shiftId]: { startHour: clamped.start / 60, endHour: clamped.end / 60 },
      }));
      return;
    }

    if (isDragScrollingRef.current) {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      e.preventDefault();
      handleGridDragMove(e.clientX);
      return;
    }

    const ctx = getGridBackgroundContext(e.target);
    if (!ctx) {
      clearHoverAddSlot();
      return;
    }
    handleLanePointerMove(ctx.employeeId, e);
  }, [
    clearHoverAddSlot,
    continuousDays,
    getContinuousMinutesFromClientX,
    getDayMinutesFromClientX,
    getGridBackgroundContext,
    handleGridDragMove,
    handleLanePointerMove,
  ]);

  const handleGridPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const duration = Date.now() - drag.startedAt;
      if (drag.activated) {
        lastDragAtRef.current = Date.now();
        const shift = scopedShifts.find((s) => String(s.id) === String(drag.shiftId));
        if (shift) {
          if (continuousDays) {
            const startInfo = resolveAbsoluteMinutes(drag.lastStartMin);
            const endInfo = resolveAbsoluteMinutes(drag.lastEndMin);
            if (!isEditableDate(startInfo.date)) {
              showToast("Past schedules can't be edited.", 'error');
              clearActiveDrag();
              return;
            }
            const sameDate = shift.date === startInfo.date;
            const sameStart = Math.abs(shift.startHour - startInfo.hour) < 0.001;
            const sameEnd = Math.abs(shift.endHour - endInfo.hour) < 0.001;
            if (!sameDate || !sameStart || !sameEnd) {
              commitOverridesRef.current[drag.shiftId] = {
                startDate: startInfo.date,
                startHour: startInfo.hour,
                endDate: endInfo.date,
                endHour: endInfo.hour,
              };
              pendingShiftChangeRef.current = {
                shiftId: String(shift.id),
                original: { date: shift.date, startHour: shift.startHour, endHour: shift.endHour },
                proposed: { date: startInfo.date, startHour: startInfo.hour, endHour: endInfo.hour },
              };
              openModal('editShift', {
                ...shift,
                date: startInfo.date,
                startHour: startInfo.hour,
                endHour: endInfo.hour,
                draftDate: startInfo.date,
                draftStartHour: startInfo.hour,
                draftEndHour: endInfo.hour,
                modalKey: `${shift.id}:${startInfo.date}:${startInfo.hour.toFixed(2)}:${endInfo.hour.toFixed(2)}`,
              });
              setCommitOverridesVersion((v) => v + 1);
            }
          } else {
            const selectedDateString = toDateString(selectedDate);
            if (!isEditableDate(selectedDateString)) {
              showToast("Past schedules can't be edited.", 'error');
              clearActiveDrag();
              return;
            }
            const nextStart = drag.lastStartMin / 60;
            const nextEnd = drag.lastEndMin / 60;
            const sameDate = shift.date === selectedDateString;
            const sameStart = Math.abs(shift.startHour - nextStart) < 0.001;
            const sameEnd = Math.abs(shift.endHour - nextEnd) < 0.001;
            if (!sameDate || !sameStart || !sameEnd) {
              commitOverridesRef.current[drag.shiftId] = {
                startDate: selectedDateString,
                startHour: nextStart,
                endDate: selectedDateString,
                endHour: nextEnd,
              };
              pendingShiftChangeRef.current = {
                shiftId: String(shift.id),
                original: { date: shift.date, startHour: shift.startHour, endHour: shift.endHour },
                proposed: { date: selectedDateString, startHour: nextStart, endHour: nextEnd },
              };
              openModal('editShift', {
                ...shift,
                date: selectedDateString,
                startHour: nextStart,
                endHour: nextEnd,
                draftDate: selectedDateString,
                draftStartHour: nextStart,
                draftEndHour: nextEnd,
                modalKey: `${shift.id}:${selectedDateString}:${nextStart.toFixed(2)}:${nextEnd.toFixed(2)}`,
              });
              setCommitOverridesVersion((v) => v + 1);
            }
          }
        }
      } else if (dist < CLICK_DISTANCE && duration < CLICK_DURATION_MS) {
        const shift = scopedShifts.find((s) => String(s.id) === String(drag.shiftId));
        if (shift) {
          openShiftEditor(shift);
        }
      }
      clearActiveDrag();
      return;
    }

    if (isDragScrollingRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // noop
      }
      handleGridDragEnd();
      return;
    }

    const ctx = getGridBackgroundContext(e.target);
    if (!ctx) return;
    if (e.pointerType !== 'touch') {
      handleLaneMouseUp(
        ctx.employeeId,
        e as unknown as React.MouseEvent,
        continuousDays ? getHourAndDateFromClientX(e.clientX)?.date : undefined
      );
    }
  }, [
    clearActiveDrag,
    continuousDays,
    getGridBackgroundContext,
    getHourAndDateFromClientX,
    handleGridDragEnd,
    handleLaneMouseUp,
    isEditableDate,
    openModal,
    openShiftEditor,
    resolveAbsoluteMinutes,
    scopedShifts,
    selectedDate,
    showToast,
  ]);

  const handleGridPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      clearActiveDrag();
      return;
    }
    if (!isDragScrollingRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
    handleGridDragEnd();
  }, [clearActiveDrag, handleGridDragEnd]);

  // Scroll handler
  const handleGridScroll = useCallback(() => {
    if (headerScrollRef.current && gridScrollRef.current) {
      if (!isSyncingScrollRef.current) {
        isSyncingScrollRef.current = true;
        headerScrollRef.current.scrollLeft = gridScrollRef.current.scrollLeft;
        requestAnimationFrame(() => {
          isSyncingScrollRef.current = false;
        });
      }
    }
    if (continuousDays) {
      updateDisplayedDateFromScroll();
    }
  }, [continuousDays, updateDisplayedDateFromScroll]);

  const handleHeaderScroll = useCallback(() => {
    if (headerScrollRef.current && gridScrollRef.current) {
      if (!isSyncingScrollRef.current) {
        isSyncingScrollRef.current = true;
        gridScrollRef.current.scrollLeft = headerScrollRef.current.scrollLeft;
        requestAnimationFrame(() => {
          isSyncingScrollRef.current = false;
        });
      }
    }
  }, []);

  // Slide animation effect (only for single-day mode)
  useEffect(() => {
    if (continuousDays) return; // Disable slide animation in continuous mode
    if (!dateNavDirection) return;
    setSlideDirection(dateNavDirection);
    setIsSliding(true);
    const timeout = setTimeout(() => setIsSliding(false), 220);
    return () => clearTimeout(timeout);
  }, [dateNavKey, dateNavDirection, continuousDays]);


  // Determine if we should show every-other-hour labels for very compact views
  const showEveryOtherLabel = pxPerHour < 40;

  // ─────────────────────────────────────────────────────────────────
  // DEBUG: DOM Probe for scroll container identification
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  // Render: Single-day mode
  // ─────────────────────────────────────────────────────────────────
  const renderSingleDayHeader = () => (
    <div
      className={`flex h-8 border-b border-theme-primary ${
        isSliding
          ? slideDirection === 'next'
            ? '-translate-x-2 opacity-90'
            : 'translate-x-2 opacity-90'
          : 'translate-x-0 opacity-100'
      }`}
      style={{ width: `${singleDayGridWidth}px`, minWidth: `${singleDayGridWidth}px` }}
    >
      {singleDayHours.map((hour, idx) => (
        <div
          key={hour}
          className="border-r border-theme-primary/50 flex items-center justify-center"
          style={{ width: `${pxPerHour}px`, minWidth: `${pxPerHour}px` }}
        >
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
  );

  const renderSingleDayRows = () => (
    <div
      className={`transition-transform transition-opacity duration-200 ${
        isSliding
          ? slideDirection === 'next'
            ? '-translate-x-2 opacity-90'
            : 'translate-x-2 opacity-90'
          : 'translate-x-0 opacity-100'
      }`}
      style={{ width: `${singleDayGridWidth}px`, minWidth: `${singleDayGridWidth}px` }}
    >
      <div>
        {filteredEmployees.length === 0 ? (
          <div className="flex items-center justify-center h-full text-theme-muted">
            <div className="text-center">
              <p className="text-sm font-medium mb-1">
                {workingTodayOnly ? 'No staff working today' : 'No staff selected'}
              </p>
              <p className="text-xs">
                {workingTodayOnly
                  ? 'No shifts scheduled for this day, or try disabling the "Working today" filter'
                  : 'Use the sidebar to select employees'}
              </p>
            </div>
          </div>
        ) : (
          groupedRows.map((row) => {
            if (row.type === 'group') {
              return (
                <div
                  key={`group-${row.job}`}
                  className="h-7 border-b border-theme-primary/50 bg-theme-tertiary/40 pointer-events-none"
                  aria-hidden="true"
                />
              );
            }
            const employee = row.employee;
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
                data-row={employee.id}
                className={`h-11 border-b border-theme-primary/50 transition-colors group ${
                  rowBackground
                } ${allowHover ? 'hover:bg-theme-hover/50' : ''}`}
              >
                <div className="relative h-full w-full">
                  {/* VISUAL LAYER */}
                  <div data-row-overlay className="absolute inset-0 z-0 pointer-events-none">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex">
                      {singleDayHours.map((hour) => (
                        <div
                          key={hour}
                          className="border-r border-theme-primary/30"
                          style={{ width: `${pxPerHour}px`, minWidth: `${pxPerHour}px` }}
                        />
                      ))}
                    </div>

                    {/* Business hours highlight */}
                    {businessHoursForDay && (
                      <div
                        className="absolute top-0.5 bottom-0.5 rounded bg-emerald-500/5 border border-emerald-500/20"
                        style={getShiftPositionForRange(businessHoursForDay.openHour, businessHoursForDay.closeHour)}
                      />
                    )}

                    {/* Current time indicator */}
                    {currentTimePosition !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-0"
                        style={{ left: `${currentTimePosition}%` }}
                      >
                        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
                      </div>
                    )}

                    {/* Time Off / Blocked / Blackout Indicators */}
                    {hasTimeOff && (
                      <div className="absolute inset-1 bg-emerald-500/20 border border-dashed border-emerald-500/50 rounded flex items-center justify-center gap-1 z-0">
                        <Palmtree className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] font-medium text-emerald-500">OFF</span>
                      </div>
                    )}
                    {!hasTimeOff && hasBlocked && (
                      <div className="absolute inset-1 bg-red-500/15 border border-dashed border-red-500/50 rounded flex items-center justify-center gap-1 z-0">
                        <span className="text-[10px] font-medium text-red-400">BLOCKED</span>
                      </div>
                    )}
                    {hasOrgBlackout && (
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[9px] font-semibold text-amber-500">
                        BLACKOUT
                      </div>
                    )}
                  </div>

                  {/* INTERACTIVE LAYER */}
                  <div data-row-interactive className="relative z-20 pointer-events-auto h-full">
                    <div
                      data-grid-background="true"
                      data-employee-id={employee.id}
                      className="absolute inset-0 z-0 pointer-events-auto"
                    />

                    {/* Hover add ghost */}
                    {canEditSelectedDate && !hasTimeOff && !hasBlocked && hoveredAddSlot?.employeeId === employee.id && hoveredAddSlot.date === dateString && (() => {
                      const metrics = gridScrollRef.current ? gridScrollRef.current.getBoundingClientRect() : null;
                      if (!metrics) {
                        return (
                          <div
                            className="absolute top-1 bottom-1 rounded border border-amber-400/50 bg-amber-400/10 flex items-center justify-center text-amber-500/80 text-sm font-semibold pointer-events-none"
                            style={getShiftPositionForRange(hoveredAddSlot.startHour, hoveredAddSlot.startHour + 1)}
                          >
                            +
                          </div>
                        );
                      }
                      const leftPx = (hoveredAddSlot.startHour - HOURS_START) * pxPerHour;
                      const widthPx = pxPerHour;
                      return (
                        <div
                          className="absolute top-1 bottom-1 rounded border border-amber-400/50 bg-amber-400/10 flex items-center justify-center text-amber-500/80 text-sm font-semibold pointer-events-none box-border"
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                        >
                          +
                        </div>
                      );
                    })()}

                    {/* Shifts */}
                    {!hasTimeOff && !hasBlocked && employeeShifts.map((shift) => {
                      const override = commitOverridesRef.current[String(shift.id)];
                      const preview = dragPreview[String(shift.id)];
                      const startHour = preview?.startHour ?? (override ? override.startHour : shift.startHour);
                      const endHour = preview?.endHour ?? (override ? override.endHour : shift.endHour);
                      const position = getShiftPositionForRange(startHour, endHour);
                      const isHovered = hoveredShiftId === shift.id;
                      const isDraggingShift = activeDragShiftId === String(shift.id);
                      const isStartDrag = isDraggingShift && activeDragMode === 'resize-left';
                      const isEndDrag = isDraggingShift && activeDragMode === 'resize-right';
                      const jobColor = getJobColorClasses(shift.job);
                      const shiftDuration = endHour - startHour;
                      const shiftWidth = shiftDuration * pxPerHour;
                      const showTimeText = shiftWidth > 60;
                      const showJobText = shiftWidth > 80;
                      const shiftNotes = typeof shift.notes === 'string' ? shift.notes.trim() : '';
                      const isDraftShift = isManager && shift.scheduleState === 'draft';
                      const isBaselinePublished = isDraftMode && shift.scheduleState !== 'draft';

                      return (
                        <div
                          key={shift.id}
                          data-shift="true"
                          data-shift-root="true"
                          data-shift-id={shift.id}
                          data-employee-id={employee.id}
                          className={`absolute top-1 bottom-1 rounded transition-all pointer-events-auto z-30 ${
                            isDraggingShift ? 'z-40 shadow-xl cursor-grabbing' : isHovered ? 'shadow-lg cursor-pointer' : 'cursor-pointer'
                          }`}
                          style={{
                            left: position.left,
                            width: position.width,
                            backgroundColor: isHovered || isDraggingShift ? jobColor.hoverBgColor : jobColor.bgColor,
                            borderWidth: '1px',
                            borderColor: jobColor.color,
                            borderStyle: isDraftShift ? 'dashed' : 'solid',
                            transform: isHovered && !isDraggingShift ? 'scale(1.02)' : 'scale(1)',
                          }}
                          onMouseEnter={(e) => {
                            setHoveredShift(shift.id);
                            showTooltipFn(shift.id, e.currentTarget);
                          }}
                          onMouseLeave={() => {
                            setHoveredShift(null);
                            setTooltip(null);
                          }}
                        >
                          {isDraftShift && (
                            <span className="absolute top-0.5 right-1 px-1 rounded bg-amber-500/30 text-[8px] font-semibold text-amber-100/90">
                              DRAFT
                            </span>
                          )}
                          {isBaselinePublished && !isDraftShift && (
                            <span className="absolute top-0.5 right-1 px-1 rounded bg-emerald-500/20 text-[8px] font-semibold text-emerald-100/90">
                              PUBLISHED
                            </span>
                          )}
                          <div
                            data-shift-body="true"
                            className="absolute left-2 right-2 top-0 bottom-0 cursor-grab active:cursor-grabbing touch-none overflow-hidden pointer-events-auto"
                          >
                            <div className="h-full flex items-center px-0.5 overflow-hidden min-w-0">
                              {showTimeText ? (
                                <span
                                  className={`text-[10px] font-medium truncate shrink-0 ${
                                    isHovered || isDraggingShift ? 'text-white' : ''
                                  }`}
                                  style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                                >
                                  {formatHour(startHour)}-{formatHour(endHour)}
                                </span>
                            ) : (
                                <span
                                  className={`text-[9px] font-medium truncate shrink-0 ${
                                    isHovered || isDraggingShift ? 'text-white' : ''
                                  }`}
                                  style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                                >
                                  {Math.round(shiftDuration)}h
                                </span>
                              )}
                              {shiftNotes && (
                                <span
                                  className={`ml-2 text-[9px] truncate text-right flex-1 min-w-0 ${
                                    isHovered || isDraggingShift ? 'text-white/80' : ''
                                  }`}
                                  style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                                  title={shiftNotes}
                                >
                                  {shiftNotes}
                                </span>
                              )}
                            </div>
                            {showJobText && shift.job && (
                              <span
                                className={`absolute left-0.5 bottom-0 text-[9px] truncate max-w-full ${
                                  isHovered || isDraggingShift ? 'text-white/90' : ''
                                }`}
                                style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                              >
                                {shift.job}
                              </span>
                            )}
                          </div>

                          <div
                            data-resize-handle="true"
                          data-edge="right"
                            className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r flex items-center justify-center touch-none group/edge transition-colors z-40 ${
                              isEndDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                            }`}
                          >
                            <span
                              className={`w-0.5 h-4 rounded-full transition-colors ${
                                isEndDrag ? 'bg-amber-200' : 'bg-white/50'
                              } group-hover/edge:bg-white/80`}
                            />
                          </div>
                          <div
                            data-resize-handle="true"
                          data-edge="left"
                            className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l flex items-center justify-center touch-none group/edge transition-colors z-40 ${
                              isStartDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                            }`}
                          >
                            <span
                              className={`w-0.5 h-4 rounded-full transition-colors ${
                                isStartDrag ? 'bg-amber-200' : 'bg-white/50'
                              } group-hover/edge:bg-white/80`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  // Render: Continuous mode (3-day window)
  // ─────────────────────────────────────────────────────────────────
  const renderContinuousHeader = () => (
    <div
      className="flex h-8 border-b border-theme-primary"
      style={{
        width: `${continuousGridWidth}px`,
        minWidth: `${continuousGridWidth}px`,
        maxWidth: `${continuousGridWidth}px`,
      }}
    >
      {continuousDaysData.map((dayData) => (
        <div key={dayData.dateString} className="flex" style={{ width: `${24 * pxPerHour}px` }}>
          {dayData.hours.map((hour) => {
            const isFirstHour = hour === 0;
            return (
              <div
                key={`${dayData.dateString}-${hour}`}
                className={`flex items-center justify-center relative ${
                  isFirstHour ? 'border-l-2 border-theme-primary' : 'border-r border-theme-primary/50'
                }`}
                style={{ width: `${pxPerHour}px`, minWidth: `${pxPerHour}px` }}
              >
                {/* Day label at midnight */}
                {isFirstHour && (
                  <span className="absolute left-1 top-0.5 text-[9px] font-semibold text-amber-500 whitespace-nowrap">
                    {formatDayLabel(dayData.date)}
                  </span>
                )}
                {/* Hour label (skip 0 since we show day label there) */}
                {hour > 0 && (!showEveryOtherLabel || hour % 2 === 0) && (
                  <span className={`text-[10px] font-medium ${
                    hour % 2 === 0 ? 'text-theme-tertiary' : 'text-theme-muted'
                  }`}>
                    {formatHourShort(hour)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const renderContinuousRows = () => (
    <div
      style={{
        width: `${continuousGridWidth}px`,
        minWidth: `${continuousGridWidth}px`,
        maxWidth: `${continuousGridWidth}px`,
      }}
    >
      <div>
        {filteredEmployees.length === 0 ? (
          <div className="flex items-center justify-center h-full text-theme-muted">
            <div className="text-center">
              <p className="text-sm font-medium mb-1">
                {workingTodayOnly ? 'No staff working today' : 'No staff selected'}
              </p>
              <p className="text-xs">
                {workingTodayOnly
                  ? 'No shifts scheduled for this day, or try disabling the "Working today" filter'
                  : 'Use the sidebar to select employees'}
              </p>
            </div>
          </div>
        ) : (
          groupedRows.map((row) => {
            if (row.type === 'group') {
              return (
                <div
                  key={`group-${row.job}`}
                  className="h-7 border-b border-theme-primary/50 bg-theme-tertiary/40 pointer-events-none"
                  style={{ width: `${continuousGridWidth}px`, maxWidth: `${continuousGridWidth}px` }}
                  aria-hidden="true"
                />
              );
            }
            const employee = row.employee;
            // Get shifts for this employee across all 3 days
            const employeeShifts = continuousShifts.filter(s => s.employeeId === employee.id);

            return (
              <div
                key={employee.id}
                className="h-11 border-b border-theme-primary/50 transition-colors group hover:bg-theme-hover/50"
                style={{ width: `${continuousGridWidth}px`, maxWidth: `${continuousGridWidth}px` }}
              >
                <div className="relative h-full w-full">
                  {/* VISUAL LAYER */}
                  <div data-row-overlay className="absolute inset-0 z-0 pointer-events-none">
                    {/* Grid lines with day separators */}
                    <div className="absolute inset-0 flex">
                    {continuousDaysData.map((dayData, dayIdx) => (
                      <div key={dayData.dateString} className="flex">
                        {dayData.hours.map((hour) => {
                          const isFirstHour = hour === 0;
                          // Alternate day background for visual clarity
                          const dayBg = dayIdx % 2 === 1 ? 'bg-theme-secondary/20' : '';
                          return (
                            <div
                              key={`${dayData.dateString}-${hour}`}
                              className={`${
                                isFirstHour ? 'border-l-2 border-theme-primary' : 'border-r border-theme-primary/30'
                              } ${dayBg}`}
                              style={{ width: `${pxPerHour}px`, minWidth: `${pxPerHour}px` }}
                            />
                          );
                        })}
                      </div>
                    ))}
                    </div>

                    {/* Business hours highlight for each day */}
                    {continuousDaysData.map((dayData, dayIdx) => {
                    const bh = getBusinessHoursForDate(dayData.date);
                    if (!bh) return null;
                    const leftPx = (dayIdx * 24 + bh.openHour) * pxPerHour;
                    const widthPx = (bh.closeHour - bh.openHour) * pxPerHour;
                    return (
                      <div
                        key={`bh-${dayData.dateString}`}
                        className="absolute top-0.5 bottom-0.5 rounded bg-emerald-500/5 border border-emerald-500/20"
                        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                      />
                    );
                    })}

                    {/* Current time indicator */}
                    {currentTimePositionContinuous !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-0"
                      style={{ left: `${currentTimePositionContinuous}px` }}
                    >
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
                    </div>
                    )}

                    {/* Time Off / Blocked / Blackout indicators for each day */}
                    {continuousDaysData.map((dayData, dayIdx) => {
                    const dayHasTimeOff = hasApprovedTimeOff(employee.id, dayData.dateString);
                    const dayHasBlocked = hasBlockedShiftOnDate(employee.id, dayData.dateString);
                    const dayHasOrgBlackout = hasOrgBlackoutOnDate(dayData.dateString);
                    if (!dayHasTimeOff && !dayHasBlocked && !dayHasOrgBlackout) return null;
                    const leftPx = dayIdx * 24 * pxPerHour;
                    const widthPx = 24 * pxPerHour;
                    return (
                      <div key={`blocker-${dayData.dateString}`}>
                        {/* Time Off Indicator */}
                        {dayHasTimeOff && (
                          <div
                            className="absolute top-1 bottom-1 bg-emerald-500/20 border border-dashed border-emerald-500/50 rounded flex items-center justify-center gap-1 z-0"
                            style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          >
                            <Palmtree className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] font-medium text-emerald-500">OFF</span>
                          </div>
                        )}
                        {/* Blocked Indicator */}
                        {!dayHasTimeOff && dayHasBlocked && (
                          <div
                            className="absolute top-1 bottom-1 bg-red-500/15 border border-dashed border-red-500/50 rounded flex items-center justify-center gap-1 z-0"
                            style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          >
                            <span className="text-[10px] font-medium text-red-400">BLOCKED</span>
                          </div>
                        )}
                        {/* Org Blackout badge */}
                        {dayHasOrgBlackout && (
                          <div
                            className="absolute top-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[9px] font-semibold text-amber-500 z-0"
                            style={{ left: `${leftPx + widthPx - 60}px` }}
                          >
                            BLACKOUT
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>

                  {/* INTERACTIVE LAYER */}
                  <div data-row-interactive className="relative z-20 pointer-events-auto h-full">
                    <div
                      data-grid-background="true"
                      data-employee-id={employee.id}
                      className="absolute inset-0 z-0 pointer-events-auto"
                    />
                    {/* Hover add ghost */}
                    {isManager && hoveredAddSlot?.employeeId === employee.id && (() => {
                      // Don't show ghost on days with time-off or blocked status
                      const ghostDayHasTimeOff = hasApprovedTimeOff(employee.id, hoveredAddSlot.date);
                      const ghostDayHasBlocked = hasBlockedShiftOnDate(employee.id, hoveredAddSlot.date);
                      if (ghostDayHasTimeOff || ghostDayHasBlocked) return null;
                      const absHours =
                        typeof hoveredAddSlot.absHoursFromWindowStart === 'number'
                          ? hoveredAddSlot.absHoursFromWindowStart
                          : (() => {
                              const dayIndex = continuousDaysData.findIndex((d) => d.dateString === hoveredAddSlot.date);
                              return dayIndex === -1 ? null : dayIndex * 24 + hoveredAddSlot.startHour;
                            })();
                      if (absHours === null) return null;
                      // Ghost is inside scrollable content, so use absolute grid coordinates (no scrollLeft subtraction)
                      const ghostLeftPx = absHours * pxPerHour;
                      const ghostWidthPx = pxPerHour;
                      return (
                        <div
                          className="absolute top-1 bottom-1 rounded border border-amber-400/50 bg-amber-400/10 flex items-center justify-center text-amber-500/80 text-sm font-semibold pointer-events-none z-30"
                          style={{ left: `${ghostLeftPx}px`, width: `${ghostWidthPx}px` }}
                        >
                          +
                        </div>
                      );
                    })()}

                    {/* Shifts */}
                    {employeeShifts.map((shift) => {
                    const override = commitOverridesRef.current[String(shift.id)];
                    const preview = dragPreview[String(shift.id)];
                    const startHour = preview?.startHour ?? (override ? override.startHour : shift.startHour);
                    const endHour = preview?.endHour ?? (override ? override.endHour : shift.endHour);
                    const shiftDate = preview?.date ?? override?.startDate ?? shift.date;
                    const pos = getShiftPositionContinuous(shiftDate, startHour, endHour);
                    if (!pos) return null;
                    // Don't render shifts on days with time-off or blocked status
                    const shiftDayHasTimeOff = hasApprovedTimeOff(employee.id, shiftDate);
                    const shiftDayHasBlocked = hasBlockedShiftOnDate(employee.id, shiftDate);
                    if (shiftDayHasTimeOff || shiftDayHasBlocked) return null;

                    const isHovered = hoveredShiftId === shift.id;
                    const isDraggingShift = activeDragShiftId === String(shift.id);
                    const isStartDrag = isDraggingShift && activeDragMode === 'resize-left';
                    const isEndDrag = isDraggingShift && activeDragMode === 'resize-right';
                    const jobColor = getJobColorClasses(shift.job);
                    const shiftDuration = endHour - startHour;
                    const showTimeText = pos.widthPx > 60;
                    const showJobText = pos.widthPx > 80;
                    const shiftNotes = typeof shift.notes === 'string' ? shift.notes.trim() : '';
                    const isDraftShift = isManager && shift.scheduleState === 'draft';
                    const isBaselinePublished = isDraftMode && shift.scheduleState !== 'draft';

                    return (
                      <div
                        key={shift.id}
                        data-shift="true"
                        data-shift-root="true"
                        data-shift-id={shift.id}
                        data-employee-id={employee.id}
                        className={`absolute top-1 bottom-1 rounded transition-all pointer-events-auto z-30 ${
                          isDraggingShift ? 'z-40 shadow-xl cursor-grabbing' : isHovered ? 'shadow-lg cursor-pointer' : 'cursor-pointer'
                        }`}
                        style={{
                          left: `${pos.leftPx}px`,
                          width: `${pos.widthPx}px`,
                          backgroundColor: isHovered || isDraggingShift ? jobColor.hoverBgColor : jobColor.bgColor,
                          borderWidth: '1px',
                          borderColor: jobColor.color,
                          borderStyle: isDraftShift ? 'dashed' : 'solid',
                          transform: isHovered && !isDraggingShift ? 'scale(1.02)' : 'scale(1)',
                        }}
                        onMouseEnter={(e) => {
                          setHoveredShift(shift.id);
                          showTooltipFn(shift.id, e.currentTarget);
                        }}
                        onMouseLeave={() => {
                          setHoveredShift(null);
                          setTooltip(null);
                        }}
                      >
                        {isDraftShift && (
                          <span className="absolute top-0.5 right-1 px-1 rounded bg-amber-500/30 text-[8px] font-semibold text-amber-100/90">
                            DRAFT
                          </span>
                        )}
                        {isBaselinePublished && !isDraftShift && (
                          <span className="absolute top-0.5 right-1 px-1 rounded bg-emerald-500/20 text-[8px] font-semibold text-emerald-100/90">
                            PUBLISHED
                          </span>
                        )}
                        <div
                          data-shift-body="true"
                          className="absolute left-2 right-2 top-0 bottom-0 cursor-grab active:cursor-grabbing touch-none overflow-hidden pointer-events-auto"
                        >
                          <div className="h-full flex items-center px-0.5 overflow-hidden min-w-0">
                            {showTimeText ? (
                              <span
                                className={`text-[10px] font-medium truncate shrink-0 ${
                                  isHovered || isDraggingShift ? 'text-white' : ''
                                }`}
                                style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                              >
                                {formatHour(startHour)}-{formatHour(endHour)}
                              </span>
                          ) : (
                              <span
                                className={`text-[9px] font-medium truncate shrink-0 ${
                                  isHovered || isDraggingShift ? 'text-white' : ''
                                }`}
                                style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                              >
                                {Math.round(shiftDuration)}h
                              </span>
                            )}
                            {shiftNotes && (
                              <span
                                className={`ml-2 text-[9px] truncate text-right flex-1 min-w-0 ${
                                  isHovered || isDraggingShift ? 'text-white/80' : ''
                                }`}
                                style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                                title={shiftNotes}
                              >
                                {shiftNotes}
                              </span>
                            )}
                          </div>
                          {showJobText && shift.job && (
                            <span
                              className={`absolute left-0.5 bottom-0 text-[9px] truncate max-w-full ${
                                isHovered || isDraggingShift ? 'text-white/90' : ''
                              }`}
                              style={{ color: isHovered || isDraggingShift ? '#fff' : jobColor.color }}
                            >
                              {shift.job}
                            </span>
                          )}
                        </div>

                        <div
                          data-resize-handle="true"
                          data-edge="right"
                          className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r flex items-center justify-center touch-none group/edge transition-colors z-40 ${
                            isEndDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                          }`}
                        >
                          <span
                            className={`w-0.5 h-4 rounded-full transition-colors ${
                              isEndDrag ? 'bg-amber-200' : 'bg-white/50'
                            } group-hover/edge:bg-white/80`}
                          />
                        </div>
                        <div
                          data-resize-handle="true"
                          data-edge="left"
                          className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l flex items-center justify-center touch-none group/edge transition-colors z-40 ${
                            isStartDrag ? 'bg-amber-400/20 ring-1 ring-amber-400/60' : 'hover:bg-white/20'
                          }`}
                        >
                          <span
                            className={`w-0.5 h-4 rounded-full transition-colors ${
                              isStartDrag ? 'bg-amber-200' : 'bg-white/50'
                            } group-hover/edge:bg-white/80`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────
  const continuousButtonLabel = continuousDays ? 'Continuous: ON' : 'Continuous: OFF';
  const continuousButtonClasses = continuousDays
    ? 'bg-amber-500 text-zinc-900 hover:bg-amber-400'
    : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary';
  const rightActions = (
    <>
      {showPublishDay ? (
        <button
          type="button"
          onClick={handlePublishDay}
          className="w-[140px] h-[40px] flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors text-xs font-semibold"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Publish Day</span>
        </button>
      ) : (
        <div className="w-[140px] h-[40px] invisible" />
      )}
      <button
        type="button"
        onClick={toggleContinuousDays}
        className={`w-[160px] h-[40px] rounded-lg text-xs font-semibold transition-colors ${continuousButtonClasses}`}
      >
        {continuousButtonLabel}
      </button>
    </>
  );

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col min-h-0 bg-theme-timeline overflow-hidden relative transition-theme"
    >
      <ScheduleToolbar
        viewMode="day"
        selectedDate={continuousDays ? displayedDate : selectedDate}
        weekStartDay={weekStartDay}
        isToday={isToday}
        onToday={handleToday}
        onPrev={() => {
          const baseDate = continuousDays ? displayedDate : selectedDate;
          handleGoToDate(addDays(baseDate, -1));
        }}
        onNext={() => {
          const baseDate = continuousDays ? displayedDate : selectedDate;
          handleGoToDate(addDays(baseDate, 1));
        }}
        onPrevJump={() => {
          const baseDate = continuousDays ? displayedDate : selectedDate;
          handleGoToDate(addDays(baseDate, -7), { reanchor: true });
        }}
        onNextJump={() => {
          const baseDate = continuousDays ? displayedDate : selectedDate;
          handleGoToDate(addDays(baseDate, 7), { reanchor: true });
        }}
        onSelectDate={(date) => handleGoToDate(date, { reanchor: true })}
        rightActions={rightActions}
      />

      {isDraftMode && (
        <div className="shrink-0 border-b border-theme-primary bg-theme-secondary/95 backdrop-blur px-2 sm:px-4 py-2 sm:h-12 overflow-x-auto">
          <div className="flex items-center justify-between gap-4 min-w-max">
            <div className="flex items-center gap-2">
              {draftBadge}
              <span className="text-[11px] text-theme-muted whitespace-nowrap">{draftHelperText}</span>
            </div>

            <div className="flex items-center gap-2">
              {isManager && viewMode === 'day' ? (
                <button
                  type="button"
                  onClick={handleCopyPreviousDayIntoDraft}
                  className="w-[200px] h-[40px] flex items-center justify-center gap-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs font-medium"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span className="truncate">Copy previous day</span>
                </button>
              ) : (
                <div className="w-[200px] h-[40px] invisible" />
              )}
            </div>
          </div>
        </div>
      )}
      {/* Single vertical scroll container for names + grid */}
      <div
        ref={timelineScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative"
      >
        {/* Sticky header row: names header + hour header */}
        <div className="sticky top-0 z-50 bg-theme-timeline border-b border-theme-primary flex">
          <div className="w-36 shrink-0 bg-theme-timeline border-r border-theme-primary h-8 flex items-center justify-center">
            {statusBadge}
          </div>
          <div className="flex-1 min-w-0 overflow-x-hidden">
            <div
              ref={headerScrollRef}
              className="w-full overflow-x-auto overflow-y-hidden"
              onScroll={handleHeaderScroll}
            >
              <div style={{ width: continuousDays ? continuousGridWidth : singleDayGridWidth }}>
                {continuousDays ? renderContinuousHeader() : renderSingleDayHeader()}
              </div>
            </div>
          </div>
        </div>

        {/* Flex row: names column + grid area - both scroll vertically together */}
        <div className="flex">
          {/* Names Column - scrolls with parent, no separate overflow */}
          <div className="w-36 shrink-0 bg-theme-timeline z-20 border-r border-theme-primary">
            {/* Employee names - natural height, scrolls with parent */}
            <div>
              {filteredEmployees.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-theme-muted text-xs">
                  No staff
                </div>
              ) : (
                groupedRows.map((row) => {
                  if (row.type === 'group') {
                    return (
                      <div
                        key={`group-${row.job}`}
                        className="h-7 border-b border-theme-primary/50 flex items-center px-2 text-[10px] uppercase tracking-widest text-theme-muted bg-theme-tertiary/40 pointer-events-none"
                        style={{ boxShadow: '4px 0 8px rgba(0,0,0,0.08)' }}
                      >
                        {row.job} ({row.count})
                      </div>
                    );
                  }
                  const employee = row.employee;
                  const sectionConfig = SECTIONS[employee.section];
                  return (
                    <div
                      key={employee.id}
                      data-name-row={employee.id}
                      className="h-11 border-b border-theme-primary/50 flex items-center gap-2 px-2"
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

          {/* Grid Area - horizontal scroll wrapper */}
          <div className="flex-1 min-w-0 overflow-x-hidden">
            <div
              ref={gridScrollRef}
              className={`w-full overflow-x-auto overflow-y-hidden ${isDragScrolling ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ scrollBehavior: isDragScrolling ? 'auto' : 'smooth', touchAction: 'pan-y' }}
              onPointerDown={handleGridPointerDown}
              onPointerMove={handleGridPointerMove}
              onPointerUp={handleGridPointerUp}
              onPointerCancel={handleGridPointerCancel}
              onPointerLeave={clearHoverAddSlot}
              onScroll={handleGridScroll}
            >
              {/* Fixed width content for horizontal scroll */}
              <div style={{ width: continuousDays ? continuousGridWidth : singleDayGridWidth }}>
                {/* Grid rows - natural height */}
                {continuousDays ? renderContinuousRows() : renderSingleDayRows()}
              </div>
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


