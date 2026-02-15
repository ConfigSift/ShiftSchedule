'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useScheduleStore } from '../../store/scheduleStore';
import { AddShiftModal } from '../AddShiftModal';
import {
  formatDateLong,
  formatHour,
  formatShiftDuration,
  getWeekWindow,
  normalizeWeekStartsOn,
  shiftsOverlap,
} from '../../utils/timeUtils';

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateTime = (dateString: string, hourValue: number): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  const hour = Math.floor(hourValue);
  const minutes = Math.round((hourValue - hour) * 60);
  date.setHours(hour, minutes, 0, 0);
  return date;
};

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

const formatDateHeadline = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const getInitials = (value?: string | null) => {
  const text = String(value ?? '').trim();
  if (!text) return '--';
  const parts = text.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

export function EmployeeDashboard() {
  const { currentUser, activeRestaurantId, accessibleRestaurants, isInitialized } = useAuthStore();
  const {
    loadRestaurantData,
    getShiftsForRestaurant,
    getEmployeesForRestaurant,
    openModal,
    scheduleViewSettings,
  } = useScheduleStore();

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [activeShiftIndex, setActiveShiftIndex] = useState(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastSelectedDateRef = useRef<string | null>(null);
  const lastLoadedEmployeeWeekKeyRef = useRef<string | null>(null);

  const activeRestaurant = useMemo(
    () => accessibleRestaurants.find((r) => r.id === activeRestaurantId) ?? null,
    [accessibleRestaurants, activeRestaurantId]
  );

  const restaurantEmployees = useMemo(
    () => (activeRestaurantId ? getEmployeesForRestaurant(activeRestaurantId) : []),
    [activeRestaurantId, getEmployeesForRestaurant],
  );
  const restaurantShifts = useMemo(
    () => (activeRestaurantId ? getShiftsForRestaurant(activeRestaurantId) : []),
    [activeRestaurantId, getShiftsForRestaurant],
  );
  const employeeId = currentUser?.id ?? '';
  const weekStartsOn = normalizeWeekStartsOn(scheduleViewSettings?.weekStartDay ?? 'monday');
  const weekWindow = useMemo(
    () => getWeekWindow(selectedDate, weekStartsOn),
    [selectedDate, weekStartsOn]
  );
  const weekDates = weekWindow.days;
  const weekKey = `${toLocalDateString(weekWindow.weekStart)}:${toLocalDateString(weekWindow.weekEndExclusive)}`;
  const loadReady = Boolean(isInitialized && activeRestaurantId && employeeId && weekKey);
  const employeeWeekLoadKey =
    loadReady && activeRestaurantId ? `${activeRestaurantId}:${employeeId}:${weekKey}` : null;

  useEffect(() => {
    if (!loadReady || !activeRestaurantId || !employeeId || !employeeWeekLoadKey) {
      if (isInitialized) {
        const timer = setTimeout(() => setIsLoading(false), 0);
        return () => clearTimeout(timer);
      }
      return;
    }

    if (lastLoadedEmployeeWeekKeyRef.current === employeeWeekLoadKey) {
      const timer = setTimeout(() => setIsLoading(false), 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    let finishedTimer: ReturnType<typeof setTimeout> | null = null;
    const loadingTimer = setTimeout(() => setIsLoading(true), 0);

    const debugEnabled =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('debugSchedule') === '1';
    if (debugEnabled) {
      console.debug('[employee-schedule] load', {
        userId: employeeId,
        restaurantId: activeRestaurantId,
        weekKey,
        triggered: true,
      });
    }

    void loadRestaurantData(activeRestaurantId).finally(() => {
      if (cancelled) return;
      lastLoadedEmployeeWeekKeyRef.current = employeeWeekLoadKey;
      finishedTimer = setTimeout(() => setIsLoading(false), 0);
    });

    return () => {
      cancelled = true;
      clearTimeout(loadingTimer);
      if (finishedTimer) {
        clearTimeout(finishedTimer);
      }
    };
  }, [
    activeRestaurantId,
    employeeId,
    employeeWeekLoadKey,
    isInitialized,
    loadReady,
    loadRestaurantData,
    weekKey,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const isReady = Boolean(isInitialized && currentUser && activeRestaurantId && !isLoading);
  const currentUserId = employeeId;

  const myShifts = restaurantShifts
    .filter((shift) => shift.employeeId === currentUserId && !shift.isBlocked)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startHour - b.startHour;
    });

  const employeeMap = useMemo(
    () => new Map(restaurantEmployees.map((employee) => [employee.id, employee.name])),
    [restaurantEmployees]
  );

  const today = new Date();
  const todayString = toLocalDateString(today);
  const selectedDateString = toLocalDateString(selectedDate);

  const selectedDayShifts = useMemo(
    () => myShifts.filter((shift) => shift.date === selectedDateString),
    [myShifts, selectedDateString]
  );
  const dayShiftsSorted = useMemo(
    () => [...selectedDayShifts].sort((a, b) => a.startHour - b.startHour),
    [selectedDayShifts]
  );
  const isSelectedToday = selectedDateString === todayString;

  useEffect(() => {
    const prevDate = lastSelectedDateRef.current;
    if (dayShiftsSorted.length === 0) {
      const timer = setTimeout(() => setActiveShiftIndex(0), 0);
      lastSelectedDateRef.current = selectedDateString;
      return () => clearTimeout(timer);
    }

    if (prevDate !== selectedDateString) {
      let nextIndex = 0;
      if (isSelectedToday) {
        const now = new Date();
        const upcomingIndex = dayShiftsSorted.findIndex(
          (shift) => toDateTime(shift.date, shift.startHour) > now
        );
        if (upcomingIndex >= 0) {
          nextIndex = upcomingIndex;
        }
      }
      const timer = setTimeout(() => setActiveShiftIndex(nextIndex), 0);
      lastSelectedDateRef.current = selectedDateString;
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setActiveShiftIndex((prev) => Math.min(Math.max(prev, 0), dayShiftsSorted.length - 1));
    }, 0);
    lastSelectedDateRef.current = selectedDateString;
    return () => clearTimeout(timer);
  }, [dayShiftsSorted, selectedDateString, isSelectedToday]);

  const weekShifts = useMemo(
    () =>
      myShifts.filter((shift) => {
        const shiftDate = new Date(`${shift.date}T00:00:00`);
        if (Number.isNaN(shiftDate.getTime())) return false;
        return shiftDate >= weekWindow.weekStart && shiftDate < weekWindow.weekEndExclusive;
      }),
    [myShifts, weekWindow]
  );
  const weekShiftCount = weekShifts.length;
  const weeklyTotalMinutes = useMemo(() => {
    const total = weekShifts.reduce((sum, shift) => {
      const minutes = Math.round((shift.endHour - shift.startHour) * 60);
      return sum + Math.max(0, minutes);
    }, 0);
    return total;
  }, [weekShifts]);
  const weeklyTotalLabel = useMemo(() => {
    if (weeklyTotalMinutes <= 0) return '0h';
    const hours = Math.floor(weeklyTotalMinutes / 60);
    const minutes = weeklyTotalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }, [weeklyTotalMinutes]);
  const selectedDayCount = selectedDayShifts.length;
  const hasMultipleDayShifts = dayShiftsSorted.length > 1;
  const sliderTranslate = activeShiftIndex * 100;

  const shiftCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shift of myShifts) {
      counts.set(shift.date, (counts.get(shift.date) ?? 0) + 1);
    }
    return counts;
  }, [myShifts]);

  const sectionLabel = useMemo(() => {
    if (!currentUserId) return '--';
    const employee = restaurantEmployees.find((e) => e.id === currentUserId);
    if (!employee?.section) return '--';
    return employee.section.charAt(0).toUpperCase() + employee.section.slice(1);
  }, [currentUserId, restaurantEmployees]);

  const getBadgeForShift = (shift: (typeof dayShiftsSorted)[number] | null) => {
    if (!shift || !isSelectedToday) return null;
    const now = new Date();
    const start = toDateTime(shift.date, shift.startHour);
    const end = toDateTime(shift.date, shift.endHour);
    if (now >= start && now <= end) {
      return {
        label: 'In progress',
        tone: 'bg-emerald-500 text-white',
      };
    }
    if (now > end) {
      return { label: 'Completed', tone: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60' };
    }
    const diffHours = Math.max(0, (start.getTime() - now.getTime()) / (1000 * 60 * 60));
    const rounded = Math.max(1, Math.round(diffHours * 10) / 10);
    return {
      label: `Starts in ${rounded} hours`,
      tone: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
    };
  };

  const getCoworkersForShift = (shift: (typeof dayShiftsSorted)[number]) => {
    if (!currentUserId) return [];
    const overlapping = restaurantShifts.filter(
      (candidate) =>
        candidate.date === shift.date &&
        !candidate.isBlocked &&
        candidate.employeeId !== currentUserId &&
        shiftsOverlap(candidate.startHour, candidate.endHour, shift.startHour, shift.endHour)
    );
    const uniqueIds = Array.from(new Set(overlapping.map((candidate) => candidate.employeeId)));
    return uniqueIds
      .map((id) => ({ id, name: employeeMap.get(id) ?? 'Unknown' }))
      .filter((item) => item.name !== 'Unknown');
  };

  const handleViewDetails = (shift: (typeof dayShiftsSorted)[number]) => {
    openModal('editShift', {
      ...shift,
      restaurantId: shift.restaurantId ?? activeRestaurantId,
    });
  };

  const handleSwipeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dayShiftsSorted.length <= 1) return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleSwipeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || dayShiftsSorted.length <= 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) {
      setActiveShiftIndex((prev) => Math.min(dayShiftsSorted.length - 1, prev + 1));
    } else {
      setActiveShiftIndex((prev) => Math.max(0, prev - 1));
    }
  };

  const handleSwipeCancel = () => {
    swipeStartRef.current = null;
  };

  const renderShiftCard = (shift: (typeof dayShiftsSorted)[number]) => {
    const badge = getBadgeForShift(shift);
    const coworkers = getCoworkersForShift(shift);
    const notesText = shift.notes?.trim();
    const jobLabel = shift.job ?? '—';

    return (
      <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 space-y-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-opacity transition-transform duration-300 ease-out dark:border-white/10 dark:bg-zinc-900 dark:shadow-none">
        <span
          className="absolute left-0 top-0 h-full w-[5px] bg-gradient-to-b from-blue-500 to-blue-800"
          aria-hidden
        />
        {badge && (
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.tone}`}>
            {badge.label}
          </span>
        )}
        <div>
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
          </h3>
          <p className="text-sm text-gray-500 dark:text-white/60 mt-1">
            {shift.job ? `${shift.job} Shift` : 'Shift'}
          </p>
          {notesText && (
            <p className="text-xs text-gray-500 dark:text-white/50 mt-2 line-clamp-2">Notes: {notesText}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 dark:bg-white/5 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-white/60 flex items-center gap-1">
              <span className="text-sm">⏱️</span>
              Duration
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
              {formatShiftDuration(shift.startHour, shift.endHour)}
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 dark:bg-white/5 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-white/60 flex items-center gap-1">
              <span className="text-sm">💼</span>
              Job
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{jobLabel}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 dark:bg-white/5 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-white/60 flex items-center gap-1">
              <span className="text-sm">📍</span>
              Section
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{sectionLabel}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 dark:bg-white/5 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-white/60 flex items-center gap-1">
              <span className="text-sm">🏢</span>
              Location
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
              {activeRestaurant?.name ?? '--'}
            </p>
          </div>
        </div>

        {coworkers.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 dark:bg-white/5 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-white/60">Working with</p>
            <div className="mt-2 flex items-center gap-2">
              {coworkers.slice(0, 4).map((coworker) => (
                <div
                  key={coworker.id}
                  className="h-8 w-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-700 dark:bg-zinc-800 dark:border-white/10 dark:text-white/80"
                >
                  {getInitials(coworker.name)}
                </div>
              ))}
              {coworkers.length > 4 && (
                <div className="h-8 w-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-700 dark:bg-zinc-800 dark:border-white/10 dark:text-white/80">
                  +{coworkers.length - 4}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-white/70 truncate">
                {coworkers
                  .slice(0, 4)
                  .map((coworker) => coworker.name)
                  .join(', ')}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/shift-exchange"
            className="flex-1 text-center px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            Request Swap
          </Link>
          <button
            type="button"
            onClick={() => handleViewDetails(shift)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-400 transition-colors"
          >
            View Details
          </button>
        </div>
      </div>
    );
  };

  const firstName =
    currentUser?.fullName?.split(' ')[0] || currentUser?.email?.split('@')[0] || 'there';
  const greetingPrefix = (() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();

  return (
    <div
      className={`min-h-dvh h-full overflow-y-auto employee-nav-pad bg-gradient-to-br from-orange-50 to-gray-100 text-gray-900 dark:from-zinc-950 dark:to-zinc-900 dark:text-white pb-0 md:pb-8 ${
        !isReady ? 'flex items-center justify-center' : ''
      }`}
    >
      {!isReady ? (
        <p className="text-gray-500 dark:text-white/60">Loading...</p>
      ) : (
        <>
          <div
            className={`max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-4 transition-all duration-500 ease-out ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-3 max-[420px]:hidden">
                <div className="h-10 w-10 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-500 font-semibold dark:bg-orange-500/10 dark:border-orange-400/30 dark:text-orange-300">
                  <CalendarDays className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/60">CrewShyft</p>
                  <p className="text-sm text-gray-600 dark:text-white/70 hidden sm:block">
                    {activeRestaurant
                      ? `${activeRestaurant.name} (${activeRestaurant.restaurantCode})`
                      : 'Active restaurant not set'}
                  </p>
                </div>
              </div>
            </header>

            <section className="space-y-3 -mt-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {greetingPrefix} {firstName}! 👋
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-white/60">
                    You have {selectedDayCount} shift{selectedDayCount === 1 ? '' : 's'} scheduled today.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {weekDates.map((date) => {
                  const dateString = toLocalDateString(date);
                  const isSelected = dateString === selectedDateString;
                  const shiftCount = shiftCountsByDate.get(dateString) ?? 0;
                  const dotCount = Math.min(3, shiftCount);
                  const ariaLabel = date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <button
                      key={dateString}
                      type="button"
                      aria-label={`Select ${ariaLabel}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedDate(date)}
                      className={`rounded-2xl border px-2 py-2 text-center transition-colors transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 ${
                        isSelected
                          ? 'bg-orange-500 border-orange-500 text-white shadow-[0_8px_20px_rgba(249,115,22,0.35)] -translate-y-0.5 dark:bg-orange-500 dark:border-orange-400 dark:text-white dark:shadow-orange-500/30'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-zinc-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="text-[10px] font-semibold tracking-widest">{formatDayLabel(date)}</div>
                      <div className="text-base font-semibold">{date.getDate()}</div>
                      <div className="mt-1 flex items-center justify-center gap-1">
                        {Array.from({ length: dotCount }).map((_, index) => (
                          <span
                            key={`${dateString}-dot-${index}`}
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSelected ? 'bg-white' : 'bg-orange-500'
                            }`}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-6">
              <section className="space-y-4">
                <div className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/50">
                  TODAY - {formatDateHeadline(selectedDate)}
                </div>

                {dayShiftsSorted.length > 0 ? (
                  dayShiftsSorted.length === 1 ? (
                    renderShiftCard(dayShiftsSorted[0])
                  ) : (
                    <div className="relative">
                      <div
                        className="overflow-hidden"
                        onPointerDown={handleSwipeStart}
                        onPointerUp={handleSwipeEnd}
                        onPointerLeave={handleSwipeCancel}
                        onPointerCancel={handleSwipeCancel}
                      >
                        <div
                          className="flex transition-transform duration-300 ease-out"
                          style={{
                            transform: `translateX(-${sliderTranslate}%)`,
                          }}
                        >
                          {dayShiftsSorted.map((shift) => (
                            <div key={shift.id} className="min-w-full">
                              {renderShiftCard(shift)}
                            </div>
                          ))}
                        </div>
                      </div>
                      {hasMultipleDayShifts && (
                        <div className="absolute top-4 right-4 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActiveShiftIndex((prev) => Math.max(0, prev - 1))}
                            disabled={activeShiftIndex === 0}
                            className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10"
                            aria-label="Previous shift"
                          >
                            <ChevronLeft className="h-4 w-4 mx-auto" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveShiftIndex((prev) => Math.min(dayShiftsSorted.length - 1, prev + 1))
                            }
                            disabled={activeShiftIndex === dayShiftsSorted.length - 1}
                            className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10"
                            aria-label="Next shift"
                          >
                            <ChevronRight className="h-4 w-4 mx-auto" aria-hidden />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="bg-white border border-gray-200 rounded-3xl p-6 text-center text-gray-500 dark:bg-zinc-900 dark:border-white/10 dark:text-white/60">
                    <p>No shift scheduled for this day.</p>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">This week</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 border border-gray-200 text-gray-700 dark:bg-white/5 dark:border-white/10 dark:text-white/80">
                      {weekShiftCount} shifts
                    </span>
                    <span className="rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 border border-gray-200 text-gray-700 dark:bg-white/5 dark:border-white/10 dark:text-white/80">
                      {weeklyTotalLabel}
                    </span>
                  </div>
                </div>
                {weekShiftCount === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 text-gray-500 dark:bg-zinc-900 dark:border-white/10 dark:text-white/60">
                    No shifts scheduled this week.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {weekShifts
                      .sort((a, b) =>
                        a.date === b.date ? a.startHour - b.startHour : a.date.localeCompare(b.date)
                      )
                      .map((shift) => (
                        <div
                          key={shift.id}
                          className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl p-4 transition-transform duration-200 ease-out hover:-translate-y-0.5 flex items-center justify-between gap-3 shadow-[0_6px_20px_rgba(0,0,0,0.08)] dark:bg-zinc-900 dark:border-white/10 dark:shadow-none"
                        >
                          <span
                            className="absolute left-0 top-0 h-full w-[5px] bg-gradient-to-b from-blue-500 to-blue-800"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-gray-900 dark:text-white">
                              {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-white/60 mt-1 truncate">
                              {shift.job || 'No job assigned'} - {formatDateLong(shift.date)}
                            </p>
                          </div>
                          <div className="bg-gray-100 border border-gray-200 rounded-xl p-2 min-w-[84px] text-center dark:bg-white/5 dark:border-white/10">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-white/60">
                              Dur
                            </p>
                            <p className="text-xs font-semibold text-gray-900 dark:text-white">
                              {formatShiftDuration(shift.startHour, shift.endHour)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          <AddShiftModal />
        </>
      )}
    </div>
  );
}
