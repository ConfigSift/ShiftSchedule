'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarDays } from 'lucide-react';
import { getWeekRange, getWeekStart, getWeekdayHeaders, isSameDay } from '../utils/timeUtils';
import type { WeekStartDay } from '../types';

type ScheduleDateControlProps = {
  viewMode: 'day' | 'week' | 'month';
  selectedDate: Date;
  weekStartDay: WeekStartDay;
  onSelectDate: (date: Date) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onPrevJump?: () => void;
  onNextJump?: () => void;
  showNavButtons?: boolean;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatWeekLabel(start: Date, end: Date) {
  const startMonthDay = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endMonthDay = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear !== endYear) {
    return `${startMonthDay}, ${startYear} – ${endMonthDay}, ${endYear}`;
  }
  return `${startMonthDay} – ${endMonthDay}, ${startYear}`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function buildLabel(viewMode: 'day' | 'week' | 'month', selectedDate: Date, weekStartDay: WeekStartDay) {
  if (viewMode === 'month') {
    return selectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  if (viewMode === 'week') {
    const range = getWeekRange(selectedDate, weekStartDay);
    return formatWeekLabel(range.start, range.end);
  }
  return formatDayLabel(selectedDate);
}

export function ScheduleDateControl({
  viewMode,
  selectedDate,
  weekStartDay,
  onSelectDate,
  onPrev,
  onNext,
  onPrevJump,
  onNextJump,
  showNavButtons = true,
}: ScheduleDateControlProps) {
  const [open, setOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfDay(selectedDate));
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open) return;
    const nextCursor = startOfDay(selectedDate);
    const timer = setTimeout(() => setMonthCursor(nextCursor), 0);
    return () => clearTimeout(timer);
  }, [open, selectedDate]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 320;
    const dropdownHeight = 360;
    const margin = 8;
    let left = rect.left + rect.width / 2 - dropdownWidth / 2;
    let top = rect.bottom + 8;

    if (left < margin) left = margin;
    if (left + dropdownWidth > window.innerWidth - margin) {
      left = window.innerWidth - dropdownWidth - margin;
    }

    if (top + dropdownHeight > window.innerHeight - margin) {
      const above = rect.top - dropdownHeight - 8;
      if (above > margin) {
        top = above;
      }
    }

    setDropdownPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setDropdownPosition(null), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => updateDropdownPosition(), 0);
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;
    const focusables = dropdownRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables?.[0];
    first?.focus();
  }, [open]);

  const label = useMemo(() => buildLabel(viewMode, selectedDate, weekStartDay), [viewMode, selectedDate, weekStartDay]);
  const weekdayHeaders = useMemo(() => getWeekdayHeaders(weekStartDay).short, [weekStartDay]);
  const displayMonth = monthCursor.getMonth();
  const displayYear = monthCursor.getFullYear();

  const years = useMemo(() => {
    const base = displayYear;
    return Array.from({ length: 11 }, (_, idx) => base - 5 + idx);
  }, [displayYear]);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(displayYear, displayMonth, 1);
    const calendarStart = getWeekStart(monthStart, weekStartDay);
    return Array.from({ length: 42 }, (_, idx) => addDays(calendarStart, idx));
  }, [displayMonth, displayYear, weekStartDay]);

  const handleSelectDate = useCallback((date: Date) => {
    onSelectDate(startOfDay(date));
    setOpen(false);
  }, [onSelectDate]);

  const handlePrevMonth = useCallback(() => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handleSelectToday = useCallback(() => {
    handleSelectDate(new Date());
  }, [handleSelectDate]);

  const showNav = showNavButtons && Boolean(onPrev) && Boolean(onNext);
  const showJump = showNav && Boolean(onPrevJump) && Boolean(onNextJump);

  return (
    <div className="relative inline-flex items-center gap-1">
      {showJump && (
        <button
          type="button"
          onClick={onPrevJump}
          className="h-9 w-9 rounded-lg border border-theme-primary bg-theme-secondary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors flex items-center justify-center"
          aria-label="Jump back"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      )}
      {showNav && (
        <button
          type="button"
          onClick={onPrev}
          className="h-9 w-9 rounded-lg border border-theme-primary bg-theme-secondary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors flex items-center justify-center"
          aria-label="Previous"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-9 min-w-[240px] px-3 rounded-lg border border-theme-primary bg-theme-tertiary text-theme-primary shadow-sm hover:bg-theme-hover transition-colors flex items-center justify-center gap-2"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarDays className="w-4 h-4 text-theme-muted" />
        <span className="text-sm font-medium">{label}</span>
      </button>
      {showNav && (
        <button
          type="button"
          onClick={onNext}
          className="h-9 w-9 rounded-lg border border-theme-primary bg-theme-secondary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors flex items-center justify-center"
          aria-label="Next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
      {showJump && (
        <button
          type="button"
          onClick={onNextJump}
          className="h-9 w-9 rounded-lg border border-theme-primary bg-theme-secondary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors flex items-center justify-center"
          aria-label="Jump forward"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      )}

      {open && dropdownPosition && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-80 rounded-xl border border-theme-primary bg-theme-secondary shadow-xl p-3"
            role="dialog"
            aria-modal="false"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const focusables = dropdownRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
              );
              if (!focusables || focusables.length === 0) return;
              const first = focusables[0];
              const last = focusables[focusables.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="h-8 w-8 rounded-lg border border-theme-primary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors flex items-center justify-center"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={displayMonth}
                  onChange={(e) => setMonthCursor(new Date(displayYear, Number(e.target.value), 1))}
                  className="h-8 rounded-lg border border-theme-primary bg-theme-tertiary px-2 text-sm text-theme-primary"
                >
                  {MONTHS.map((month, idx) => (
                    <option key={month} value={idx}>{month}</option>
                  ))}
                </select>
                <select
                  value={displayYear}
                  onChange={(e) => setMonthCursor(new Date(Number(e.target.value), displayMonth, 1))}
                  className="h-8 rounded-lg border border-theme-primary bg-theme-tertiary px-2 text-sm text-theme-primary"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="h-8 w-8 rounded-lg border border-theme-primary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors flex items-center justify-center"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-[11px] text-theme-muted mb-2 text-center">
              {weekdayHeaders.map((day, idx) => (
                <span key={`${day}-${idx}`}>{day}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((date, idx) => {
              const isCurrentMonth = date.getMonth() === displayMonth;
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, new Date());
              const isDisabled = false;
              return (
                <button
                  key={`${date.toISOString()}-${idx}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    handleSelectDate(date);
                  }}
                  className={`h-8 w-8 rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    isDisabled
                      ? 'text-theme-muted cursor-not-allowed opacity-50'
                      : 'cursor-pointer hover:bg-theme-hover/60 hover:outline hover:outline-1 hover:outline-theme-primary/40'
                  } ${
                    isSelected
                      ? 'bg-amber-500 text-zinc-900 font-semibold'
                      : isToday
                      ? 'border border-amber-400 text-theme-primary'
                      : isCurrentMonth
                      ? 'text-theme-primary'
                      : 'text-theme-muted'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
            </div>

            <div className="mt-3 flex justify-between items-center">
              <button
                type="button"
                onClick={handleSelectToday}
                className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
              >
                TODAY
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-theme-muted hover:text-theme-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )
      }
    </div>
  );
}
