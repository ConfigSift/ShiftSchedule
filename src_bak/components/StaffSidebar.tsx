'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { ROLES, Role } from '../types';
import { Users, ChevronDown, Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export function StaffSidebar() {
  const {
    employees,
    selectedRoles,
    selectedEmployeeIds,
    toggleRole,
    toggleEmployee,
    selectAllEmployees,
    deselectAllEmployees,
    shifts,
    selectedDate,
  } = useScheduleStore();

  const [expandedRoles, setExpandedRoles] = useState<Role[]>(['kitchen', 'front', 'bar', 'management']);

  const toggleExpanded = (role: Role) => {
    setExpandedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const dateString = selectedDate.toISOString().split('T')[0];

  // Group employees by role
  const employeesByRole = employees.reduce((acc, emp) => {
    if (!acc[emp.role]) acc[emp.role] = [];
    acc[emp.role].push(emp);
    return acc;
  }, {} as Record<Role, typeof employees>);

  // Check if employee has shift today
  const hasShiftToday = (employeeId: string) => {
    return shifts.some(s => s.employeeId === employeeId && s.date === dateString);
  };

  const allSelected = selectedEmployeeIds.length === employees.filter(e => selectedRoles.includes(e.role)).length;

  return (
    <aside className="w-64 bg-theme-secondary border-r border-theme-primary flex flex-col shrink-0 transition-theme">
      {/* Header */}
      <div className="p-4 border-b border-theme-primary">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-theme-tertiary" />
            <span className="font-medium text-theme-primary text-sm">Staff</span>
          </div>
          <span className="text-xs text-theme-muted">
            {selectedEmployeeIds.length} shown
          </span>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={allSelected ? deselectAllEmployees : selectAllEmployees}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover transition-colors text-xs font-medium"
          >
            {allSelected ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {allSelected ? 'Hide All' : 'Show All'}
          </button>
        </div>
      </div>

      {/* Staff List */}
      <div className="flex-1 overflow-y-auto p-2">
        {(Object.keys(ROLES) as Role[]).map(role => {
          const roleConfig = ROLES[role];
          const roleEmployees = employeesByRole[role] || [];
          const isExpanded = expandedRoles.includes(role);
          const isRoleSelected = selectedRoles.includes(role);
          const selectedCount = roleEmployees.filter(e => selectedEmployeeIds.includes(e.id)).length;

          return (
            <div key={role} className="mb-1">
              {/* Role Header */}
              <button
                onClick={() => toggleExpanded(role)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-theme-hover transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: roleConfig.color }}
                  />
                  <span className="text-sm font-medium text-theme-secondary">
                    {roleConfig.label}
                  </span>
                  <span className="text-xs text-theme-muted">
                    {selectedCount}/{roleEmployees.length}
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-theme-muted transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Role Toggle */}
              {isExpanded && (
                <div className="ml-2 mb-1">
                  <button
                    onClick={() => toggleRole(role)}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs transition-colors ${
                      isRoleSelected
                        ? 'bg-theme-tertiary text-theme-secondary'
                        : 'text-theme-muted hover:bg-theme-hover'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isRoleSelected
                          ? 'border-amber-500 bg-amber-500'
                          : 'border-theme-secondary'
                      }`}
                    >
                      {isRoleSelected && <Check className="w-3 h-3 text-zinc-900" />}
                    </div>
                    Show all {roleConfig.label.toLowerCase()}
                  </button>
                </div>
              )}

              {/* Employees */}
              {isExpanded && isRoleSelected && (
                <div className="ml-2 space-y-0.5">
                  {roleEmployees.map(employee => {
                    const isSelected = selectedEmployeeIds.includes(employee.id);
                    const hasShift = hasShiftToday(employee.id);

                    return (
                      <button
                        key={employee.id}
                        onClick={() => toggleEmployee(employee.id)}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                          isSelected
                            ? 'bg-theme-tertiary text-theme-primary'
                            : 'text-theme-muted hover:bg-theme-hover hover:text-theme-secondary'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500'
                              : 'border-theme-secondary'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-zinc-900" />}
                        </div>
                        
                        {/* Avatar placeholder */}
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                          style={{ 
                            backgroundColor: roleConfig.bgColor,
                            color: roleConfig.color,
                          }}
                        >
                          {employee.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        
                        <span className="flex-1 text-left truncate">
                          {employee.name}
                        </span>

                        {hasShift && (
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: roleConfig.color }}
                            title="Working today"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
