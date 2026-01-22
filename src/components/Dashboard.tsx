'use client';

import { Header } from './Header';
import { StaffSidebar } from './StaffSidebar';
import { Timeline } from './Timeline';
import { WeekView } from './WeekView';
import { StatsFooter } from './StatsFooter';
import { AddShiftModal } from './AddShiftModal';
import { AddEmployeeModal } from './AddEmployeeModal';
import { TimeOffRequestModal } from './TimeOffRequestModal';
import { TimeOffReviewModal } from './TimeOffReviewModal';
import { BlockedPeriodModal } from './BlockedPeriodModal';
import { BlockedDayRequestModal } from './BlockedDayRequestModal';
import { Toast } from './Toast';
import { useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';

export function Dashboard() {
  const { viewMode, applyRestaurantScope, loadRestaurantData } = useScheduleStore();
  const { activeRestaurantId } = useAuthStore();

  useEffect(() => {
    applyRestaurantScope(activeRestaurantId);
    loadRestaurantData(activeRestaurantId);
  }, [activeRestaurantId, applyRestaurantScope, loadRestaurantData]);

  return (
    <div className="h-screen flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        <StaffSidebar />
        
        <main className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'day' ? <Timeline /> : <WeekView />}
        </main>
      </div>
      
      <StatsFooter />

      {/* Modals */}
      <AddShiftModal />
      <AddEmployeeModal />
      <TimeOffRequestModal />
      <BlockedDayRequestModal />
      <TimeOffReviewModal />
      <BlockedPeriodModal />
      <Toast />
    </div>
  );
}
