'use client';

import type { Employee, Shift } from '../../types';
import { JOB_OPTIONS } from '../../types';
import {
  calculateDailyStats,
  formatReportDate,
  formatReportTimestamp,
  formatHourForReport,
  getJobColorClasses,
} from './report-utils';
import { ReportHeader } from './ReportHeader';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMELINE_START = 6; // 6 AM
const TIMELINE_END = 24; // midnight

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12a';
  if (hour === 12) return '12p';
  if (hour > 12) return `${hour - 12}p`;
  return `${hour}a`;
}

interface TimelineGroup {
  job: string;
  color: string;
  bgColor: string;
  rows: TimelineRow[];
}

interface TimelineRow {
  employee: Employee;
  shifts: Shift[];
}

function buildTimelineGroups(
  employees: Employee[],
  shifts: Shift[]
): TimelineGroup[] {
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  // Find each employee's primary job from their first shift
  const employeePrimaryJob = new Map<string, string>();
  const employeeShifts = new Map<string, Shift[]>();
  const employeesWithShifts = new Set<string>();

  shifts.forEach((shift) => {
    if (shift.isBlocked) return;
    employeesWithShifts.add(shift.employeeId);
    if (!employeePrimaryJob.has(shift.employeeId) && shift.job) {
      employeePrimaryJob.set(shift.employeeId, shift.job);
    }
    if (!employeeShifts.has(shift.employeeId)) {
      employeeShifts.set(shift.employeeId, []);
    }
    employeeShifts.get(shift.employeeId)!.push(shift);
  });

  // Sort each employee's shifts by start time
  employeeShifts.forEach((list) => list.sort((a, b) => a.startHour - b.startHour));

  // Build groups by job
  const groupMap = new Map<string, TimelineRow[]>();
  employeesWithShifts.forEach((empId) => {
    const emp = employeeMap.get(empId);
    if (!emp || !emp.isActive) return;
    const job = employeePrimaryJob.get(empId) ?? 'Unassigned';
    if (!groupMap.has(job)) groupMap.set(job, []);
    groupMap.get(job)!.push({
      employee: emp,
      shifts: employeeShifts.get(empId) ?? [],
    });
  });

  // Sort rows within groups by earliest shift start (ascending), then name.
  groupMap.forEach((rows) =>
    rows.sort((a, b) => {
      const aStart = a.shifts[0]?.startHour;
      const bStart = b.shifts[0]?.startHour;
      const aHas = Number.isFinite(aStart);
      const bHas = Number.isFinite(bStart);
      if (aHas && bHas && aStart !== bStart) return (aStart ?? 0) - (bStart ?? 0);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return a.employee.name.localeCompare(b.employee.name);
    })
  );

  // Build result in JOB_OPTIONS order
  const result: TimelineGroup[] = [];
  const jobList: string[] = [...JOB_OPTIONS];

  for (const job of jobList) {
    const rows = groupMap.get(job);
    if (!rows || rows.length === 0) continue;
    const colors = getJobColorClasses(job);
    result.push({ job, color: colors.color, bgColor: colors.bgColor, rows });
    groupMap.delete(job);
  }

  // Remaining (custom/Unassigned)
  groupMap.forEach((rows, job) => {
    if (rows.length === 0) return;
    const colors = getJobColorClasses(job);
    result.push({ job, color: colors.color, bgColor: colors.bgColor, rows });
  });

  return result;
}

/** Calculate the effective timeline end based on actual shift data. */
function getEffectiveEnd(shifts: Shift[]): number {
  let maxEnd = 23; // default 11p
  for (const shift of shifts) {
    if (shift.endHour > maxEnd) maxEnd = Math.ceil(shift.endHour);
  }
  return Math.min(maxEnd, TIMELINE_END);
}

/** Compute total scheduled hours across all shifts. */
function getTotalHours(shifts: Shift[]): number {
  let total = 0;
  for (const s of shifts) {
    if (!s.isBlocked) total += Math.max(0, s.endHour - s.startHour);
  }
  return Math.round(total * 10) / 10;
}

// Collect active roles for legend
function getActiveRoles(shifts: Shift[]): Array<{ job: string; color: string }> {
  const seen = new Set<string>();
  const roles: Array<{ job: string; color: string }> = [];
  shifts.forEach((s) => {
    const job = s.job ?? 'Unassigned';
    if (seen.has(job)) return;
    seen.add(job);
    roles.push({ job, color: getJobColorClasses(job).color });
  });
  return roles;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DailyTimelineReportProps {
  date: Date;
  restaurantName: string;
  employees: Employee[];
  shifts: Shift[];
}

export function DailyTimelineReport({
  date,
  restaurantName,
  employees,
  shifts,
}: DailyTimelineReportProps) {
  const stats = calculateDailyStats(employees, shifts);
  const groups = buildTimelineGroups(employees, shifts);
  const effectiveEnd = getEffectiveEnd(shifts);
  const effectiveHours = effectiveEnd - TIMELINE_START;
  const totalHours = getTotalHours(shifts);
  const activeRoles = getActiveRoles(shifts);

  // Build hour column headers
  const hours: number[] = [];
  for (let h = TIMELINE_START; h < effectiveEnd; h++) hours.push(h);

  // Each hour column width as percentage
  const colPct = 100 / effectiveHours;

  return (
    <div className="report-timeline-root">
      <ReportHeader
        title="Daily Timeline"
        subtitle={formatReportDate(date)}
        restaurantName={restaurantName}
      />

      {/* Stats bar */}
      <div className="stats-bar flex gap-4 px-3 py-2 bg-zinc-100 rounded-md mb-4 text-[11px]">
        <div className="stat-item flex items-center gap-1">
          <span className="stat-label text-zinc-400 font-medium">Staff</span>
          <span className="stat-value font-bold text-zinc-900">{stats.total}</span>
        </div>
        <div className="stat-item flex items-center gap-1">
          <span className="stat-label text-zinc-400 font-medium">AM</span>
          <span className="stat-value font-bold text-zinc-900">{stats.amCount}</span>
        </div>
        <div className="stat-item flex items-center gap-1">
          <span className="stat-label text-zinc-400 font-medium">PM</span>
          <span className="stat-value font-bold text-zinc-900">{stats.pmCount}</span>
        </div>
        {stats.doublesCount > 0 && (
          <div className="stat-item flex items-center gap-1">
            <span className="stat-label text-zinc-400 font-medium">Doubles</span>
            <span className="stat-value stat-accent font-bold">{stats.doublesCount}</span>
          </div>
        )}
        <div className="stat-item flex items-center gap-1">
          <span className="stat-label text-zinc-400 font-medium">Total Hours</span>
          <span className="stat-value font-bold text-zinc-900">{totalHours}h</span>
        </div>
        {stats.estLaborCost > 0 && (
          <div className="stat-item flex items-center gap-1">
            <span className="stat-label text-zinc-400 font-medium">Est. Labor</span>
            <span className="stat-value font-bold text-zinc-900">
              ${stats.estLaborCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {shifts.length === 0 && (
        <div className="empty-state">No shifts scheduled.</div>
      )}

      {/* Timeline grid */}
      {shifts.length > 0 && (
        <div className="timeline-grid" style={{ display: 'grid', gridTemplateColumns: '160px 1fr' }}>
          {/* Hour headers — name column placeholder + hour labels */}
          <div className="h-6 border-b border-zinc-300" />
          <div className="relative h-6 border-b border-zinc-300">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute top-0 bottom-0 text-center"
                style={{ left: `${(h - TIMELINE_START) * colPct}%`, width: `${colPct}%` }}
              >
                <span className="text-[9px] font-semibold text-zinc-400 leading-6">
                  {hourLabel(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Groups + rows */}
          {groups.map((group) => (
            <div key={group.job} className="contents">
              {/* Role group header — spans both columns */}
              <div
                className="col-span-2 flex items-center gap-1.5 px-2 py-[3px] text-[10px] font-bold uppercase tracking-wide"
                style={{ gridColumn: '1 / -1', backgroundColor: group.bgColor, color: group.color }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                {group.job}
                <span className="ml-1 text-[9px] font-semibold opacity-60">({group.rows.length})</span>
              </div>

              {/* Employee rows */}
              {group.rows.map((row) => {
                const jobColor = getJobColorClasses(row.shifts[0]?.job);
                return (
                  <div key={row.employee.id} className="contents">
                    {/* Name cell */}
                    <div className="flex items-center gap-1.5 px-2 h-7 border-b border-zinc-100 min-w-0">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                        style={{ backgroundColor: jobColor.bgColor, color: jobColor.color }}
                      >
                        {getInitials(row.employee.name)}
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-800 truncate">
                        {row.employee.name}
                      </span>
                    </div>

                    {/* Bar cell */}
                    <div className="relative h-7 border-b border-zinc-100">
                      {/* Grid lines */}
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="absolute top-0 bottom-0"
                          style={{
                            left: `${(h - TIMELINE_START) * colPct}%`,
                            width: '1px',
                            backgroundColor: h % 3 === 0 ? '#e4e4e7' : '#f4f4f5',
                          }}
                        />
                      ))}

                      {/* Shift bars */}
                      {row.shifts.map((shift) => {
                        const shiftColor = getJobColorClasses(shift.job);
                        const start = Math.max(shift.startHour, TIMELINE_START);
                        const end = Math.min(shift.endHour, effectiveEnd);
                        if (end <= start) return null;
                        const leftPct = ((start - TIMELINE_START) / effectiveHours) * 100;
                        const widthPct = ((end - start) / effectiveHours) * 100;
                        const barWidthMinPx = 20;

                        return (
                          <div
                            key={shift.id}
                            className="absolute top-[3px] bottom-[3px] rounded"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              minWidth: `${barWidthMinPx}px`,
                              backgroundColor: shiftColor.bgColor,
                              borderLeft: `3px solid ${shiftColor.color}`,
                              borderTop: `1px solid ${shiftColor.color}`,
                              borderRight: `1px solid ${shiftColor.color}`,
                              borderBottom: `1px solid ${shiftColor.color}`,
                            }}
                          >
                            <div className="h-full flex items-center px-1 overflow-hidden">
                              <span
                                className="text-[8px] font-semibold whitespace-nowrap truncate"
                                style={{ color: shiftColor.color }}
                              >
                                {formatHourForReport(shift.startHour)}-{formatHourForReport(shift.endHour, { isEnd: true })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Footer: legend + summary */}
      <div className="report-footer flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-zinc-200 text-[10px] text-zinc-500">
        <div className="footer-meta">Generated {formatReportTimestamp()}</div>
        {shifts.length > 0 && (
          <div className="color-legend ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="legend-item">
              <span className="legend-dot am-dot" />
              <span>AM shift</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot pm-dot" />
              <span>PM shift</span>
            </div>
            {activeRoles.map((role) => (
              <div key={role.job} className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: role.color }} />
                <span>{role.job}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
