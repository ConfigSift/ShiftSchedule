'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { SECTIONS, Section } from '../types';
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

  const [expandedSections, setExpandedSections] = useState<Section[]>(['kitchen', 'front', 'bar', 'management']);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleExpanded = (section: Section) => {
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
    return scopedEmployees.filter((emp) => emp.name.toLowerCase().includes(query));
  }, [scopedEmployees, searchQuery]);

  const employeesBySection = filteredEmployees.reduce((acc, emp) => {
    if (!emp.isActive) return acc;
    if (!acc[emp.section]) acc[emp.section] = [];
    acc[emp.section].push(emp);
    return acc;
  }, {} as Record<Section, typeof filteredEmployees>);

  const hasShiftToday = (employeeId: string) => {
    return scopedShifts.some(s => s.employeeId === employeeId && s.date === dateString && !s.isBlocked);
  };

  const activeEmployees = scopedEmployees.filter(e => e.isActive);
  const allSelected = selectedEmployeeIds.length === activeEmployees.length && activeEmployees.length > 0;

  // Check if all employees in a section are selected
  const isSectionFullySelected = (section: Section) => {
    const sectionEmps = employeesBySection[section] || [];
    if (sectionEmps.length === 0) return false;
    return sectionEmps.every(e => selectedEmployeeIds.includes(e.id));
  };

  // Check if some (but not all) employees in a section are selected
  const isSectionPartiallySelected = (section: Section) => {
    const sectionEmps = employeesBySection[section] || [];
    if (sectionEmps.length === 0) return false;
    const selectedCount = sectionEmps.filter(e => selectedEmployeeIds.includes(e.id)).length;
    return selectedCount > 0 && selectedCount < sectionEmps.length;
  };

  const handleSectionToggle = (section: Section) => {
    const isFullySelected = isSectionFullySelected(section);
    setSectionSelectedForRestaurant(section, !isFullySelected, activeRestaurantId);
  };

  return (
    <aside className="w-64 h-full bg-theme-secondary border-r border-theme-primary flex flex-col shrink-0 transition-theme">
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

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <div className="px-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff"
            className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>
        {(Object.keys(SECTIONS) as Section[]).map(section => {
          const sectionConfig = SECTIONS[section];
          const sectionEmployees = employeesBySection[section] || [];
          const isExpanded = expandedSections.includes(section);
          const isFullySelected = isSectionFullySelected(section);
          const isPartiallySelected = isSectionPartiallySelected(section);
          const selectedCount = sectionEmployees.filter(e => selectedEmployeeIds.includes(e.id)).length;

          if (sectionEmployees.length === 0) return null;

          return (
            <div key={section} className="mb-1">
              {/* Section Header */}
              <div className="flex items-center gap-1">
                {/* Section Checkbox */}
                <button
                  onClick={() => handleSectionToggle(section)}
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

                {/* Section Expand Toggle */}
                <button
                  onClick={() => toggleExpanded(section)}
                  className="flex-1 flex items-center justify-between p-2 rounded-lg hover:bg-theme-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: sectionConfig.color }}
                    />
                    <span className="text-sm font-medium text-theme-secondary">
                      {sectionConfig.label}
                    </span>
                    <span className="text-xs text-theme-muted">
                      {selectedCount}/{sectionEmployees.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-theme-muted transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Employees */}
              {isExpanded && (
                <div className="ml-2 space-y-0.5">
                  {sectionEmployees.map(employee => {
                    const isSelected = selectedEmployeeIds.includes(employee.id);
                    const hasShift = hasShiftToday(employee.id);

                    return (
                      <div
                        key={employee.id}
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
                              isSelected
                                ? 'border-amber-500 bg-amber-500'
                                : 'border-theme-secondary'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-zinc-900" />}
                          </div>
                          
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                            style={{ 
                              backgroundColor: sectionConfig.bgColor,
                              color: sectionConfig.color,
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
                              style={{ backgroundColor: sectionConfig.color }}
                              title="Working today"
                            />
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
        })}
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
