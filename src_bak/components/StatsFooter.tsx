'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { ROLES, Role } from '../types';
import { Clock, Users, AlertTriangle, DollarSign } from 'lucide-react';

export function StatsFooter() {
  const {
    selectedDate,
    shifts,
    employees,
    getFilteredEmployees,
    viewMode,
  } = useScheduleStore();

  const dateString = selectedDate.toISOString().split('T')[0];
  const filteredEmployees = getFilteredEmployees();

  // Calculate stats for current date
  const todayShifts = shifts.filter(s => s.date === dateString);
  const totalHours = todayShifts.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);
  const activeEmployees = new Set(todayShifts.map(s => s.employeeId)).size;

  // Count shifts by role
  const shiftsByRole = todayShifts.reduce((acc, shift) => {
    const employee = employees.find(e => e.id === shift.employeeId);
    if (employee) {
      acc[employee.role] = (acc[employee.role] || 0) + 1;
    }
    return acc;
  }, {} as Record<Role, number>);

  // Estimate labor cost (example: $15/hour average)
  const avgHourlyRate = 15;
  const estimatedCost = totalHours * avgHourlyRate;

  // Find gaps (simplified: check if any role has no coverage during peak hours 11am-2pm, 5pm-9pm)
  const peakHours = [
    { start: 11, end: 14, label: 'Lunch' },
    { start: 17, end: 21, label: 'Dinner' },
  ];

  const coverageGaps: string[] = [];
  peakHours.forEach(peak => {
    (Object.keys(ROLES) as Role[]).forEach(role => {
      const roleEmployees = employees.filter(e => e.role === role);
      const roleCoverage = todayShifts.filter(shift => {
        const emp = employees.find(e => e.id === shift.employeeId);
        return emp?.role === role && shift.startHour <= peak.start && shift.endHour >= peak.end;
      });
      if (roleEmployees.length > 0 && roleCoverage.length === 0) {
        // Check if there's any partial coverage
        const partialCoverage = todayShifts.filter(shift => {
          const emp = employees.find(e => e.id === shift.employeeId);
          return emp?.role === role && 
            ((shift.startHour <= peak.start && shift.endHour > peak.start) ||
             (shift.startHour < peak.end && shift.endHour >= peak.end));
        });
        if (partialCoverage.length === 0) {
          coverageGaps.push(`${ROLES[role].label} (${peak.label})`);
        }
      }
    });
  });

  return (
    <footer className="h-14 bg-theme-secondary border-t border-theme-primary flex items-center px-6 gap-8 shrink-0 transition-theme">
      {/* Total Hours */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Clock className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <p className="text-xs text-theme-muted">Total Hours</p>
          <p className="text-sm font-semibold text-theme-primary">{totalHours}h</p>
        </div>
      </div>

      {/* Active Employees */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-xs text-theme-muted">Staff Working</p>
          <p className="text-sm font-semibold text-theme-primary">
            {activeEmployees} / {employees.length}
          </p>
        </div>
      </div>

      {/* Shifts by Role */}
      <div className="flex items-center gap-3 px-4 py-2 bg-theme-tertiary rounded-lg transition-theme">
        {(Object.keys(ROLES) as Role[]).map(role => {
          const count = shiftsByRole[role] || 0;
          return (
            <div key={role} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ROLES[role].color }}
              />
              <span className="text-xs text-theme-tertiary">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Coverage Gaps */}
      {coverageGaps.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-theme-muted">Coverage Gaps</p>
            <p className="text-xs font-medium text-amber-400 truncate max-w-[200px]">
              {coverageGaps.slice(0, 2).join(', ')}
              {coverageGaps.length > 2 && ` +${coverageGaps.length - 2}`}
            </p>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Estimated Cost */}
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
