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
import { useEffect, useCallback } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { formatDateHeader, formatDateRange, getWeekDates, isSameDay } from '../utils/timeUtils';
import { ChevronLeft, ChevronRight, CalendarDays, Sun, Calendar, ArrowLeftRight, Copy } from 'lucide-react';
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
    : viewMode === 'week'
    ? formatDateRange(weekDates[0], weekDates[6])
    : selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    applyRestaurantScope(activeRestaurantId);
    loadRestaurantData(activeRestaurantId);
  }, [activeRestaurantId, applyRestaurantScope, loadRestaurantData]);

  const handlePrevious = useCallback(() => goToPrevious(), [goToPrevious]);
  const handleNext = useCallback(() => goToNext(), [goToNext]);
  const handleToday = useCallback(() => goToToday(), [goToToday]);
  const handleViewMode = useCallback((mode: 'day' | 'week' | 'month') => setViewMode(mode), [setViewMode]);
  const handleCopySchedule = useCallback(() => openModal('copySchedule'), [openModal]);

  return (
    <div className="h-full flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - handled internally with mobile drawer */}
        <div className="h-full shrink-0 min-h-0">
          <StaffSidebar />
        </div>
        
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Controls bar */}
            <div className={`shrink-0 border-b border-theme-primary bg-theme-secondary/70 px-2 sm:px-4 py-2 sm:py-3 ${viewMode === 'day' ? 'hidden' : ''}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              {/* Date navigation row */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={handlePrevious}
                  className="p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label={`Go to previous ${viewMode}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div className="flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-xl bg-theme-tertiary text-theme-primary font-medium text-sm min-w-0 sm:min-w-[160px] text-center truncate">
                  {dateLabel}
                </div>
                
                <button
                  onClick={handleNext}
                  className="p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label={`Go to next ${viewMode}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                
                <button
                  onClick={handleToday}
                  disabled={isToday}
                  className={`px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors min-h-[40px] ${
                    isToday
                      ? 'bg-theme-tertiary text-theme-muted cursor-not-allowed'
                      : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                  }`}
                >
                  Today
                </button>
              </div>

              {/* Secondary controls row */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                {/* View mode toggle */}
                <div className="flex items-center gap-1 bg-theme-tertiary rounded-lg p-1 shrink-0">
                  <button
                    onClick={() => handleViewMode('day')}
                    className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[32px] ${
                      viewMode === 'day'
                        ? 'bg-theme-secondary text-theme-primary shadow-sm'
                        : 'text-theme-tertiary hover:text-theme-primary'
                    }`}
                    aria-pressed={viewMode === 'day'}
                  >
                    <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Day</span>
                  </button>
                  <button
                    onClick={() => handleViewMode('week')}
                    className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[32px] ${
                      viewMode === 'week'
                        ? 'bg-theme-secondary text-theme-primary shadow-sm'
                        : 'text-theme-tertiary hover:text-theme-primary'
                    }`}
                    aria-pressed={viewMode === 'week'}
                  >
                    <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Week</span>
                  </button>
                  <button
                    onClick={() => handleViewMode('month')}
                    className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[32px] ${
                      viewMode === 'month'
                        ? 'bg-theme-secondary text-theme-primary shadow-sm'
                        : 'text-theme-tertiary hover:text-theme-primary'
                    }`}
                    aria-pressed={viewMode === 'month'}
                  >
                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Month</span>
                  </button>
                </div>

                {/* Action links */}
                <Link
                  href="/shift-exchange"
                  className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs sm:text-sm font-medium shrink-0 min-h-[32px]"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Shift Exchange</span>
                  <span className="sm:hidden">Exchange</span>
                </Link>
                
                {isManager && (
                  <button
                    type="button"
                    onClick={handleCopySchedule}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs sm:text-sm font-medium shrink-0 min-h-[32px]"
                  >
                    <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Copy Schedule</span>
                    <span className="sm:hidden">Copy</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* Schedule views */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'day' && <Timeline />}
            {viewMode === 'week' && <WeekView />}
            {viewMode === 'month' && <MonthView />}
          </div>
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
