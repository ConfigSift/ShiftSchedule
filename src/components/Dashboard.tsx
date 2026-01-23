'use client';

import { StaffSidebar } from './StaffSidebar';
import { Timeline } from './Timeline';
import { WeekView } from './WeekView';
import { AddShiftModal } from './AddShiftModal';
import { AddEmployeeModal } from './AddEmployeeModal';
import { TimeOffRequestModal } from './TimeOffRequestModal';
import { TimeOffReviewModal } from './TimeOffReviewModal';
import { BlockedPeriodModal } from './BlockedPeriodModal';
import { BlockedDayRequestModal } from './BlockedDayRequestModal';
import { Toast } from './Toast';
import { CopyScheduleModal } from './CopyScheduleModal';
import { useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { formatDateHeader, formatDateRange, getWeekDates, isSameDay } from '../utils/timeUtils';
import { ChevronLeft, ChevronRight, CalendarDays, Sun, Calendar } from 'lucide-react';
import Link from 'next/link';
import { getUserRole, isManagerRole } from '../utils/role';
import { MonthView } from './MonthView';

export function Dashboard() {
  const {
    viewMode,
    selectedDate,
    setViewMode,
    goToToday,
    goToPrevious,
    goToNext,
    openModal,
    applyRestaurantScope,
    loadRestaurantData,
  } = useScheduleStore();
  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const isToday = isSameDay(selectedDate, new Date());
  const weekDates = getWeekDates(selectedDate);

  const dateLabel = viewMode === 'day'
    ? formatDateHeader(selectedDate)
    : formatDateRange(weekDates[0], weekDates[6]);

  useEffect(() => {
    applyRestaurantScope(activeRestaurantId);
    loadRestaurantData(activeRestaurantId);
  }, [activeRestaurantId, applyRestaurantScope, loadRestaurantData]);

  return (
    <div className="h-full flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
      <div className="flex-1 flex overflow-hidden">
        <div className="h-full shrink-0">
          <StaffSidebar />
        </div>
        
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-theme-primary bg-theme-secondary/70 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={goToPrevious}
                  className="p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-4 py-2 rounded-xl bg-theme-tertiary text-theme-primary font-medium text-sm sm:text-base min-w-[160px] text-center">
                  {dateLabel}
                </div>
                <button
                  onClick={goToNext}
                  className="p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={goToToday}
                  disabled={isToday}
                  className={`ml-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    isToday
                      ? 'bg-theme-tertiary text-theme-muted cursor-not-allowed'
                      : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                  }`}
                >
                  Today
                </button>
                <Link
                  href="/shift-exchange"
                  className="px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs sm:text-sm font-medium"
                >
                  Shift Exchange
                </Link>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => openModal('copySchedule')}
                    className="px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs sm:text-sm font-medium"
                  >
                    Copy Schedule
                  </button>
                )}
              </div>

                <div className="flex items-center gap-2 bg-theme-tertiary rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('day')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'day'
                        ? 'bg-theme-secondary text-theme-primary shadow-sm'
                        : 'text-theme-tertiary hover:text-theme-primary'
                    }`}
                  >
                    <Sun className="w-4 h-4" />
                    <span className="hidden sm:inline">Day</span>
                  </button>
                  <button
                    onClick={() => setViewMode('week')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'week'
                        ? 'bg-theme-secondary text-theme-primary shadow-sm'
                        : 'text-theme-tertiary hover:text-theme-primary'
                    }`}
                  >
                    <CalendarDays className="w-4 h-4" />
                    <span className="hidden sm:inline">Week</span>
                  </button>
                  <button
                    onClick={() => setViewMode('month')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'month'
                        ? 'bg-theme-secondary text-theme-primary shadow-sm'
                        : 'text-theme-tertiary hover:text-theme-primary'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span className="hidden sm:inline">Month</span>
                  </button>
                </div>
            </div>
          </div>
          {viewMode === 'day' && <Timeline />}
          {viewMode === 'week' && <WeekView />}
          {viewMode === 'month' && <MonthView />}
        </main>
      </div>

      {/* Modals */}
      <AddShiftModal />
      <AddEmployeeModal />
      <TimeOffRequestModal />
      <BlockedDayRequestModal />
      <TimeOffReviewModal />
      <BlockedPeriodModal />
      <CopyScheduleModal />
      <Toast />
    </div>
  );
}
