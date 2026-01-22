'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { SECTIONS, Section } from '../types';
import { Clock, Users, AlertTriangle, DollarSign } from 'lucide-react';

export function StatsFooter() {
  const { selectedDate, shifts, employees } = useScheduleStore();

  const dateString = selectedDate.toISOString().split('T')[0];
  const activeEmployees = employees.filter(e => e.isActive);

  const todayShifts = shifts.filter(s => s.date === dateString);
  const totalHours = todayShifts.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);
  const workingCount = new Set(todayShifts.map(s => s.employeeId)).size;

  const shiftsBySection = todayShifts.reduce((acc, shift) => {
    const employee = employees.find(e => e.id === shift.employeeId);
    if (employee) {
      acc[employee.section] = (acc[employee.section] || 0) + 1;
    }
    return acc;
  }, {} as Record<Section, number>);

  // Rough cost estimate ($15/hr average)
  const estimatedCost = totalHours * 15;

  return (
    <footer className="h-14 bg-theme-secondary border-t border-theme-primary flex items-center px-6 gap-8 shrink-0 transition-theme">
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
            ${estimatedCost.toLocaleString()}
          </p>
        </div>
      </div>
    </footer>
  );
}
