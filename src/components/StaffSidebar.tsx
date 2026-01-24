'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { Users, ChevronDown, Check, Eye, EyeOff, User, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { getJobColorClasses } from '../lib/jobColors';

const STORAGE_KEY = 'schedule.sidebarCollapsed';

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
  const { isSidebarOpen, closeSidebar } = useUIStore();

  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Close sidebar on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && isSidebarOpen) {
        closeSidebar();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen, closeSidebar]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        closeSidebar();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isSidebarOpen, closeSidebar]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true');
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
      }
      return next;
    });
  }, []);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  const toggleExpanded = useCallback((section: string) => {
    setExpandedSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  }, []);

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

  const shiftsForDateMap = useMemo(() => {
    const map = new Set<string>();
    scopedShifts.forEach(s => {
      if (s.date === dateString && !s.isBlocked) {
        map.add(s.employeeId);
      }
    });
    return map;
  }, [scopedShifts, dateString]);

  const hasShiftToday = useCallback((employeeId: string) => {
    return shiftsForDateMap.has(employeeId);
  }, [shiftsForDateMap]);

  const activeEmployees = useMemo(() => 
    scopedEmployees.filter((e) => e.isActive),
    [scopedEmployees]
  );
  
  const allSelected = selectedEmployeeIds.length === activeEmployees.length && activeEmployees.length > 0;

  const isSectionFullySelected = useCallback((group: string) => {
    const sectionEmps = employeesByJob[group] || [];
    if (sectionEmps.length === 0) return false;
    return sectionEmps.every(e => selectedEmployeeIds.includes(e.id));
  }, [employeesByJob, selectedEmployeeIds]);

  const isSectionPartiallySelected = useCallback((group: string) => {
    const sectionEmps = employeesByJob[group] || [];
    if (sectionEmps.length === 0) return false;
    const selectedCount = sectionEmps.filter(e => selectedEmployeeIds.includes(e.id)).length;
    return selectedCount > 0 && selectedCount < sectionEmps.length;
  }, [employeesByJob, selectedEmployeeIds]);

  const handleSectionToggle = useCallback((group: string) => {
    const isFullySelected = isSectionFullySelected(group);
    setSectionSelectedForRestaurant(group, !isFullySelected, activeRestaurantId);
  }, [isSectionFullySelected, setSectionSelectedForRestaurant, activeRestaurantId]);

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      deselectAllEmployees();
    } else {
      selectAllEmployeesForRestaurant(activeRestaurantId);
    }
  }, [allSelected, deselectAllEmployees, selectAllEmployeesForRestaurant, activeRestaurantId]);

  const sidebarContent = (
    <>
      <div className="px-2 py-2 border-b border-theme-primary">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-theme-tertiary" />
            <span className="font-medium text-theme-primary text-[11px] uppercase tracking-widest">Staff</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-theme-muted">
              {selectedEmployeeIds.length} / {activeEmployees.length}
            </span>
            <button
              onClick={toggleSidebarCollapsed}
              className="hidden md:inline-flex p-1 rounded-lg hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
            {/* Mobile close button */}
            <button
              onClick={closeSidebar}
              className="md:hidden p-1.5 rounded-lg hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSelectAll}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-theme-tertiary text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover transition-colors text-[11px] font-semibold min-h-[32px]"
          >
            {allSelected ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {allSelected ? 'Hide All' : 'Show All'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1.5">
        <div className="px-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff"
            className="w-full px-2.5 py-1.5 rounded-lg bg-theme-tertiary border border-theme-primary text-[12px] text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40"
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
            const jobColor = getJobColorClasses(job);

            return (
              <div key={job} className="mb-0.5">
                <div className="flex items-center gap-1">
                  <span className={`w-0.5 h-5 rounded-full shrink-0 ${jobColor.indicatorClass}`} aria-hidden="true" />
                  <button
                    onClick={() => handleSectionToggle(job)}
                    className="p-1 rounded-lg hover:bg-theme-hover transition-colors min-w-[30px] min-h-[30px] flex items-center justify-center"
                    aria-label={`Toggle all ${job} employees`}
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
                        <Check className="w-2.5 h-2.5 text-zinc-900" />
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => toggleExpanded(job)}
                    className="flex-1 flex items-center justify-between p-1 px-2 rounded-lg hover:bg-theme-hover transition-colors min-h-[30px] gap-1.5"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold leading-tight ${jobColor.textClass}`}>{job}</span>
                      <span className="text-[11px] text-theme-muted">
                        {selectedCount}/{jobEmployees.length}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-3 h-3 text-theme-muted transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
                {isExpanded && (
                  <div className="ml-1.5 space-y-0.5 mt-0.5">
                    {jobEmployees.map((employee) => {
                      const isSelected = selectedEmployeeIds.includes(employee.id);
                      const hasShift = hasShiftToday(employee.id);

                      return (
                        <div
                          key={`${job}-${employee.id}`}
                          className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] transition-colors border-l-2 ${jobColor.borderClass} ${
                            isSelected
                              ? 'bg-theme-tertiary text-theme-primary'
                              : 'text-theme-muted hover:bg-theme-hover hover:text-theme-secondary'
                          }`}
                        >
                          <button
                            onClick={() => toggleEmployee(employee.id)}
                            className="flex items-center gap-1 flex-1 min-h-[28px]"
                          >
                            <div
                              className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                isSelected ? 'border-amber-500 bg-amber-500' : 'border-theme-secondary'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 text-zinc-900" />}
                            </div>
                            <div className="flex-1 text-left truncate text-[12px] font-medium leading-tight">
                              {employee.name}
                            </div>
                            {hasShift && (
                              <div className={`w-2 h-2 rounded-full ${jobColor.dotClass} shrink-0`} title="Working today" />
                            )}
                          </button>
                          <Link
                            href={`/staff/${employee.id}`}
                            className="p-1 rounded hover:bg-theme-hover text-theme-muted hover:text-theme-primary transition-colors text-[11px]"
                            title="View Profile"
                            onClick={closeSidebar}
                          >
                            <User className="w-3 h-3" />
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
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } min-h-0 h-full bg-theme-secondary border-r border-theme-primary flex-col shrink-0 transition-[width] duration-200 ease-out overflow-hidden`}
      >
        {sidebarCollapsed ? (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <button
              onClick={toggleSidebarCollapsed}
              className="p-2 rounded-full bg-theme-secondary/60 text-theme-secondary hover:text-theme-primary hover:bg-theme-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 transition-colors"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            {sidebarContent}
          </div>
        )}
      </aside>

      {/* Mobile drawer overlay */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-theme-secondary border-r border-theme-primary flex flex-col transition-transform duration-300 ease-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Staff sidebar"
      >
        <div className="pt-14 h-full flex flex-col">
          {sidebarContent}
        </div>
      </aside>
    </>
  );
}
