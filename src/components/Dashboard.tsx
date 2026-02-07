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
import { MonthView } from './MonthView';

type DashboardProps = {
  autoLoad?: boolean;
};

export function Dashboard({ autoLoad = true }: DashboardProps) {
  const {
    viewMode,
    applyRestaurantScope,
    loadRestaurantData,
    scheduleMode,
  } = useScheduleStore();
  const { activeRestaurantId } = useAuthStore();
  const isDraftMode = scheduleMode === 'draft';

  useEffect(() => {
    if (!autoLoad) return;
    applyRestaurantScope(activeRestaurantId);
    loadRestaurantData(activeRestaurantId);
  }, [activeRestaurantId, applyRestaurantScope, autoLoad, loadRestaurantData, scheduleMode]);


  return (
    <div className="h-full flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
      <div
        className={`flex-1 flex min-h-0 overflow-hidden ${
          isDraftMode ? 'border border-amber-500/30 bg-amber-500/5 rounded-xl m-2' : ''
        }`}
      >
        {/* Sidebar - handled internally with mobile drawer */}
        <div className="shrink-0 min-h-0 h-full">
          <StaffSidebar />
        </div>
        
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
          {/* Schedule views */}
          <div className="flex-1 h-full min-h-0 overflow-hidden flex flex-col">
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
