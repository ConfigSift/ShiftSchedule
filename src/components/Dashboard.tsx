'use client';

import { Header } from './Header';
import { StaffSidebar } from './StaffSidebar';
import { Timeline } from './Timeline';
import { WeekView } from './WeekView';
import { StatsFooter } from './StatsFooter';
import { AddShiftModal } from './AddShiftModal';
import { AddEmployeeModal } from './AddEmployeeModal';
import { EmployeeProfileModal } from './EmployeeProfileModal';
import { TimeOffRequestModal } from './TimeOffRequestModal';
import { BlockedPeriodModal } from './BlockedPeriodModal';
import { useScheduleStore } from '../store/scheduleStore';

export function Dashboard() {
  const { viewMode } = useScheduleStore();

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
      <EmployeeProfileModal />
      <TimeOffRequestModal />
      <BlockedPeriodModal />
    </div>
  );
}
