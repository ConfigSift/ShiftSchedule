'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS, Section } from '../types';
import { Clock, Users, AlertTriangle, DollarSign } from 'lucide-react';

export function StatsFooter() {
  const { selectedDate, getShiftsForRestaurant, getEmployeesForRestaurant } = useScheduleStore();
  const { activeRestaurantId } = useAuthStore();

  const dateString = selectedDate.toISOString().split('T')[0];
  const scopedEmployees = getEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const activeEmployees = scopedEmployees.filter(e => e.isActive);

  const todayShifts = scopedShifts.filter(s => s.date === dateString && !s.isBlocked);
  const totalHours = todayShifts.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);
  const workingCount = new Set(todayShifts.map(s => s.employeeId)).size;

  const shiftsBySection = todayShifts.reduce((acc, shift) => {
    const employee = scopedEmployees.find(e => e.id === shift.employeeId);
    if (employee) {
      acc[employee.section] = (acc[employee.section] || 0) + 1;
    }
    return acc;
  }, {} as Record<Section, number>);

  const estimatedCost = todayShifts.reduce((sum, shift) => {
    const employee = scopedEmployees.find((emp) => emp.id === shift.employeeId);
    const rate = employee?.hourlyPay ?? 0;
    const hours = shift.endHour - shift.startHour;
    return sum + hours * rate;
  }, 0);

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-14 bg-theme-secondary border-t border-theme-primary flex items-center px-6 gap-8 shrink-0 transition-theme z-40">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Clock className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <p className="text-xs text-theme-muted">Total Hours</p>
          <p className="text-sm font-semibold text-theme-primary">{totalHours}h</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-xs text-theme-muted">Staff Working</p>
          <p className="text-sm font-semibold text-theme-primary">
            {workingCount} / {activeEmployees.length}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 bg-theme-tertiary rounded-lg">
        {(Object.keys(SECTIONS) as Section[]).map(section => {
          const count = shiftsBySection[section] || 0;
          return (
            <div key={section} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SECTIONS[section].color }}
              />
              <span className="text-xs text-theme-tertiary">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <DollarSign className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <p className="text-xs text-theme-muted">Est. Labor Cost</p>
          <p className="text-sm font-semibold text-theme-primary">
            ${estimatedCost.toFixed(2)}
          </p>
        </div>
      </div>
    </footer>
  );
}
