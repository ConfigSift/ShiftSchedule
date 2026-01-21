'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useThemeStore } from '../store/themeStore';
import { formatDateHeader, formatDateRange, getWeekDates, isSameDay } from '../utils/timeUtils';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  Plus,
  UserPlus,
  Sun,
  Moon,
  CalendarDays,
  CalendarOff,
  Bell,
  Clock,
} from 'lucide-react';

export function Header() {
  const { 
    selectedDate, 
    viewMode,
    setViewMode,
    goToToday, 
    goToPrevious, 
    goToNext,
    openModal,
    getPendingTimeOffRequests,
    isManager,
  } = useScheduleStore();

  const { theme, toggleTheme } = useThemeStore();

  const isToday = isSameDay(selectedDate, new Date());
  const weekDates = getWeekDates(selectedDate);
  const pendingRequests = getPendingTimeOffRequests();

  const getDateDisplay = () => {
    if (viewMode === 'day') {
      return formatDateHeader(selectedDate);
    }
    return formatDateRange(weekDates[0], weekDates[6]);
  };

  return (
    <header className="h-16 bg-theme-secondary border-b border-theme-primary flex items-center justify-between px-6 shrink-0 transition-theme">
      {/* Left: Logo & Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-zinc-900" />
        </div>
        <span className="font-semibold text-lg tracking-tight text-theme-primary">ShiftFlow</span>
      </div>

      {/* Center: Date Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={goToPrevious}
          className="p-2 rounded-lg hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 px-4 py-2 bg-theme-tertiary rounded-xl min-w-[200px] justify-center transition-theme">
          <span className="text-theme-primary font-medium">{getDateDisplay()}</span>
        </div>

        <button
          onClick={goToNext}
          className="p-2 rounded-lg hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <button
          onClick={goToToday}
          disabled={isToday}
          className={`ml-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isToday 
              ? 'bg-theme-tertiary text-theme-muted cursor-not-allowed' 
              : 'bg-accent-bg text-accent-primary hover:bg-amber-500/20'
          }`}
        >
          Today
        </button>

        {/* View Mode Toggle */}
        <div className="ml-4 flex items-center bg-theme-tertiary rounded-lg p-1 transition-theme">
          <button
            onClick={() => setViewMode('day')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'day'
                ? 'bg-theme-secondary text-theme-primary shadow-sm'
                : 'text-theme-tertiary hover:text-theme-primary'
            }`}
          >
            <Sun className="w-4 h-4" />
            Day
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'week'
                ? 'bg-theme-secondary text-theme-primary shadow-sm'
                : 'text-theme-tertiary hover:text-theme-primary'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Week
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Time Off Request (for employees) */}
        <button
          onClick={() => openModal('timeOffRequest')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
          title="Request Time Off"
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* Pending Requests Indicator (for managers) */}
        {isManager && pendingRequests.length > 0 && (
          <button
            className="relative p-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
            title={`${pendingRequests.length} pending time-off requests`}
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-zinc-900 text-xs font-bold rounded-full flex items-center justify-center">
              {pendingRequests.length}
            </span>
          </button>
        )}

        {/* Blocked Periods (managers only) */}
        {isManager && (
          <button
            onClick={() => openModal('blockedPeriod')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
            title="Manage Blocked Periods"
          >
            <CalendarOff className="w-4 h-4" />
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="w-px h-6 bg-theme-primary mx-1" />

        <button 
          onClick={() => openModal('addEmployee')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
        >
          <UserPlus className="w-4 h-4" />
          Add Staff
        </button>
        <button 
          onClick={() => openModal('addShift')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Shift
        </button>
      </div>
    </header>
  );
}
