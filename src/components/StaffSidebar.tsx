'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Users, ChevronDown, Check, Eye, EyeOff, User } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export function StaffSidebar() {
  const {
    getEmployeesForRestaurant,
    selectedSections,
    selectedEmployeeIds,
    setSectionSelectedForRestaurant,
    toggleEmployee,
    selectAllEmployeesForRestaurant,
    deselectAllEmployees,
    getShiftsForRestaurant,
    selectedDate,
  } = useScheduleStore();

  const { activeRestaurantId, currentUser } = useAuthStore();

  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleExpanded = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const dateString = selectedDate.toISOString().split('T')[0];

  const scopedEmployees = getEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return scopedEmployees;
    return scopedEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(query)
        || emp.email?.toLowerCase().includes(query)
        || emp.phone?.toLowerCase().includes(query)
    );
  }, [scopedEmployees, searchQuery]);

  const employeesByJob = useMemo(() => {
    const map: Record<string, typeof filteredEmployees> = {};
    filteredEmployees.forEach((emp) => {
      if (!emp.isActive) return;
      const jobs = emp.jobs ?? [];
      if (!jobs.length) {
        map.Unassigned = map.Unassigned ?? [];
        map.Unassigned.push(emp);
        return;
      }
      jobs.forEach((job) => {
        map[job] = map[job] ?? [];
        map[job].push(emp);
      });
    });
    return map;
  }, [filteredEmployees]);

  const hasShiftToday = (employeeId: string) => {
    return scopedShifts.some(s => s.employeeId === employeeId && s.date === dateString && !s.isBlocked);
  };

  const activeEmployees = scopedEmployees.filter((e) => e.isActive);
  const allSelected = selectedEmployeeIds.length === activeEmployees.length && activeEmployees.length > 0;

  // Check if all employees in a section are selected
  const isSectionFullySelected = (group: string) => {
    const sectionEmps = employeesByJob[group] || [];
    if (sectionEmps.length === 0) return false;
    return sectionEmps.every(e => selectedEmployeeIds.includes(e.id));
  };

  // Check if some (but not all) employees in a section are selected
  const isSectionPartiallySelected = (group: string) => {
    const sectionEmps = employeesByJob[group] || [];
    if (sectionEmps.length === 0) return false;
    const selectedCount = sectionEmps.filter(e => selectedEmployeeIds.includes(e.id)).length;
    return selectedCount > 0 && selectedCount < sectionEmps.length;
  };

  const handleSectionToggle = (group: string) => {
    const isFullySelected = isSectionFullySelected(group);
    setSectionSelectedForRestaurant(group, !isFullySelected, activeRestaurantId);
  };

  return (
    <aside className="w-64 min-h-0 h-full bg-theme-secondary border-r border-theme-primary flex flex-col shrink-0 transition-theme">
      <div className="p-4 border-b border-theme-primary">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-theme-tertiary" />
            <span className="font-medium text-theme-primary text-sm">Staff</span>
          </div>
          <span className="text-xs text-theme-muted">
            {selectedEmployeeIds.length} / {activeEmployees.length}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={allSelected ? deselectAllEmployees : () => selectAllEmployeesForRestaurant(activeRestaurantId)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover transition-colors text-xs font-medium"
          >
            {allSelected ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {allSelected ? 'Hide All' : 'Show All'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        <div className="px-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff"
            className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>
        {Object.keys(employeesByJob).length === 0 ? (
          <p className="text-xs text-theme-muted px-2">No staff to show.</p>
        ) : (
          Object.keys(employeesByJob).map((job) => {
            const jobEmployees = employeesByJob[job];
            if (!jobEmployees || jobEmployees.length === 0) return null;
            const isExpanded = expandedSections.includes(job);
            const isFullySelected = isSectionFullySelected(job);
            const isPartiallySelected = isSectionPartiallySelected(job);
            const selectedCount = jobEmployees.filter((e) => selectedEmployeeIds.includes(e.id)).length;

            return (
              <div key={job} className="mb-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleSectionToggle(job)}
                    className="p-2 rounded-lg hover:bg-theme-hover transition-colors"
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isFullySelected
                          ? 'border-amber-500 bg-amber-500'
                          : isPartiallySelected
                          ? 'border-amber-500 bg-amber-500/50'
                          : 'border-theme-secondary'
                      }`}
                    >
                      {(isFullySelected || isPartiallySelected) && (
                        <Check className="w-3 h-3 text-zinc-900" />
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => toggleExpanded(job)}
                    className="flex-1 flex items-center justify-between p-2 rounded-lg hover:bg-theme-hover transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-theme-secondary">{job}</span>
                      <span className="text-xs text-theme-muted">
                        {selectedCount}/{jobEmployees.length}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-theme-muted transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
                {isExpanded && (
                  <div className="ml-2 space-y-0.5">
                    {jobEmployees.map((employee) => {
                      const isSelected = selectedEmployeeIds.includes(employee.id);
                      const hasShift = hasShiftToday(employee.id);

                      return (
                        <div
                          key={`${job}-${employee.id}`}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                            isSelected
                              ? 'bg-theme-tertiary text-theme-primary'
                              : 'text-theme-muted hover:bg-theme-hover hover:text-theme-secondary'
                          }`}
                        >
                          <button
                            onClick={() => toggleEmployee(employee.id)}
                            className="flex items-center gap-2 flex-1"
                          >
                            <div
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'border-amber-500 bg-amber-500' : 'border-theme-secondary'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-zinc-900" />}
                            </div>
                            <div className="flex-1 text-left truncate">{employee.name}</div>
                            {hasShift && (
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Working today" />
                            )}
                          </button>
                          <Link
                            href={`/staff/${employee.id}`}
                            className="p-1 rounded hover:bg-theme-hover text-theme-muted hover:text-theme-primary transition-colors"
                            title="View Profile"
                          >
                            <User className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {currentUser && (
        <div className="border-t border-theme-primary p-4">
          <p className="text-xs text-theme-muted">
            Use Review Requests to track time off and blocked days.
          </p>
        </div>
      )}
    </aside>
  );
}
