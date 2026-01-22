'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { formatDateHeader, formatDateRange, getWeekDates, isSameDay } from '../utils/timeUtils';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  Plus,
  Sun,
  Moon,
  CalendarDays,
  MessageSquare,
  User,
  LogOut,
  CalendarOff,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getUserRole, isManagerRole } from '../utils/role';

export function Header() {
  const router = useRouter();
  const { 
    selectedDate, 
    viewMode,
    setViewMode,
    goToToday, 
    goToPrevious, 
    goToNext,
    openModal,
    getPendingTimeOffRequests,
  } = useScheduleStore();

  const { currentUser, signOut, clearActiveOrganization } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const currentRole = getUserRole(currentUser?.role);

  const handleLogout = () => {
    signOut();
    router.push('/login');
  };

  const isToday = isSameDay(selectedDate, new Date());
  const weekDates = getWeekDates(selectedDate);
  const pendingRequests = getPendingTimeOffRequests();
  const canSwitchRestaurant = isManagerRole(currentRole);

  const handleSwitchRestaurant = () => {
    clearActiveOrganization();
    router.push('/manager');
  };

  const getDateDisplay = () => {
    if (viewMode === 'day') {
      return formatDateHeader(selectedDate);
    }
    return formatDateRange(weekDates[0], weekDates[6]);
  };

  return (
    <header className="h-16 bg-theme-secondary border-b border-theme-primary flex flex-wrap items-center justify-between px-4 lg:px-6 shrink-0 transition-theme">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-zinc-900" />
        </div>
        <span className="font-semibold text-lg tracking-tight text-theme-primary hidden sm:block">ShiftFlow</span>
      </div>

      {/* Center: Date Navigation */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={goToPrevious}
          className="p-2 rounded-lg hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 px-3 sm:px-4 py-2 bg-theme-tertiary rounded-xl min-w-[140px] sm:min-w-[200px] justify-center">
          <span className="text-theme-primary font-medium text-sm sm:text-base">{getDateDisplay()}</span>
        </div>

        <button
          onClick={goToNext}
          className="p-2 rounded-lg hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <button
          onClick={goToToday}
          disabled={isToday}
          className={`ml-1 sm:ml-2 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            isToday 
              ? 'bg-theme-tertiary text-theme-muted cursor-not-allowed' 
              : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
          }`}
        >
          Today
        </button>

        {/* View Mode Toggle */}
        <div className="hidden md:flex ml-2 items-center bg-theme-tertiary rounded-lg p-1">
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
      <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
        {canSwitchRestaurant && (
          <button
            type="button"
            onClick={handleSwitchRestaurant}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs"
          >
            Switch Restaurant
          </button>
        )}
        {/* Chat Link */}
        <Link
          href="/chat"
          className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
          title="Team Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </Link>

        {/* Manager Only: Notifications */}
        {isManagerRole(currentRole) && (
          <Link
            href="/staff"
            className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
            title="Manage Staff"
          >
            <Users className="w-5 h-5" />
          </Link>
        )}

        {isManagerRole(currentRole) && (
          <Link
            href="/time-off"
            className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors text-sm font-medium"
            title="Time Off Requests"
          >
            <span>Review Requests</span>
            {pendingRequests.length > 0 && (
              <span className="w-5 h-5 bg-amber-500 text-zinc-900 text-xs font-bold rounded-full flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </Link>
        )}

        {/* Manager Only: Blocked Periods */}
        {isManagerRole(currentRole) && (
          <button
            onClick={() => openModal('blockedPeriod')}
            className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
            title="Blocked Periods"
          >
            <CalendarOff className="w-5 h-5" />
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="hidden sm:block w-px h-6 bg-theme-primary mx-1" />

        {/* Add Shift */}
        {isManagerRole(currentRole) && (
          <button 
            onClick={() => openModal('addShift')}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-all hover:scale-105 hover:shadow-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Shift</span>
          </button>
        )}

        {currentUser && (
          <button
            onClick={() => openModal('timeOffRequest', { employeeId: currentUser.id })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
          >
            <CalendarOff className="w-4 h-4" />
            Request Time Off
          </button>
        )}

        {/* Profile */}
        <Link
          href={currentUser?.id ? `/staff/${currentUser.id}` : '/login?notice=login'}
          className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
          title="My Profile"
        >
          <User className="w-5 h-5" />
        </Link>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg hover:bg-red-500/20 text-theme-secondary hover:text-red-400 transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
