'use client';

import { useMemo } from 'react';
import type { Employee, Shift } from '../../types';
import { JOB_OPTIONS } from '../../types';
import {
  classifyShift,
  calculateWeeklyHours,
  formatReportTimestamp,
  formatReportWeekRange,
  formatHourForReport,
  getJobColorClasses,
  getJobColorKey,
} from './report-utils';
import { ReportHeader } from './ReportHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeeklyGroup {
  job: string;
  color: string;
  bgColor: string;
  rows: WeeklyRow[];
}

interface WeeklyRow {
  employee: Employee;
  /** Shifts keyed by YYYY-MM-DD */
  shiftsByDay: Map<string, Shift[]>;
  totalHours: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayHeader(date: Date): { weekday: string; monthDay: string } {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { weekday, monthDay };
}

function buildWeeklyGroups(
  employees: Employee[],
  shifts: Shift[],
  weekDates: Date[]
): WeeklyGroup[] {
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const dateStrings = weekDates.map(toYMD);

  // Index shifts by employee
  const shiftsByEmployee = new Map<string, Shift[]>();
  shifts.forEach((shift) => {
    if (shift.isBlocked) return;
    if (!shiftsByEmployee.has(shift.employeeId)) {
      shiftsByEmployee.set(shift.employeeId, []);
    }
    shiftsByEmployee.get(shift.employeeId)!.push(shift);
  });

  // Determine each employee's primary job from their shifts this week
  const employeePrimaryJob = new Map<string, string>();
  shiftsByEmployee.forEach((empShifts, empId) => {
    // Use the job from their earliest shift
    const sorted = [...empShifts].sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
    for (const s of sorted) {
      if (s.job) {
        employeePrimaryJob.set(empId, s.job);
        break;
      }
    }
  });

  // Build rows — only for employees with at least one shift
  const groupMap = new Map<string, WeeklyRow[]>();
  shiftsByEmployee.forEach((empShifts, empId) => {
    const emp = employeeMap.get(empId);
    if (!emp || !emp.isActive) return;

    const shiftsByDay = new Map<string, Shift[]>();
    dateStrings.forEach((d) => shiftsByDay.set(d, []));
    empShifts.forEach((shift) => {
      const existing = shiftsByDay.get(shift.date);
      if (existing) existing.push(shift);
    });
    // Sort shifts within each day by start time
    shiftsByDay.forEach((list) => list.sort((a, b) => a.startHour - b.startHour));

    const totalHours = calculateWeeklyHours(empId, empShifts);
    const job = employeePrimaryJob.get(empId) ?? 'Unassigned';

    if (!groupMap.has(job)) groupMap.set(job, []);
    groupMap.get(job)!.push({ employee: emp, shiftsByDay, totalHours });
  });

  // Sort rows within groups alphabetically
  groupMap.forEach((rows) => rows.sort((a, b) => a.employee.name.localeCompare(b.employee.name)));

  // Build result in JOB_OPTIONS order
  const result: WeeklyGroup[] = [];
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ShiftCell({ shifts }: { shifts: Shift[] }) {
  if (shifts.length === 0) {
    return <span className="text-zinc-300">&mdash;</span>;
  }

  return (
    <div className="flex flex-col gap-[2px]">
      {shifts.map((shift) => {
        const colors = getJobColorClasses(shift.job);
        const period = classifyShift(shift.startHour);
        return (
          <div
            key={shift.id}
            className="inline-flex items-center gap-[3px] rounded px-1 py-[1px] text-[9px] font-medium leading-tight whitespace-nowrap"
            style={{ backgroundColor: colors.bgColor, color: colors.color }}
          >
            <span>
              {formatHourForReport(shift.startHour)}-
              {formatHourForReport(shift.endHour, { isEnd: true })}
            </span>
            <span
              className="w-[5px] h-[5px] rounded-full flex-shrink-0"
              style={{ backgroundColor: period === 'AM' ? '#f59e0b' : '#6366f1' }}
              title={period}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WeeklyScheduleReportProps {
  weekDates: Date[];
  restaurantName: string;
  employees: Employee[];
  shifts: Shift[];
  loading?: boolean;
  error?: string | null;
}

export function WeeklyScheduleReport({
  weekDates,
  restaurantName,
  employees,
  shifts,
  loading,
  error,
}: WeeklyScheduleReportProps) {
  const groups = useMemo(
    () => buildWeeklyGroups(employees, shifts, weekDates),
    [employees, shifts, weekDates]
  );

  const dateStrings = useMemo(() => weekDates.map(toYMD), [weekDates]);

  // Summary stats
  const totalStaff = useMemo(() => {
    const ids = new Set<string>();
    shifts.forEach((s) => { if (!s.isBlocked) ids.add(s.employeeId); });
    return ids.size;
  }, [shifts]);

  const totalLaborHours = useMemo(() => {
    let sum = 0;
    shifts.forEach((s) => {
      if (!s.isBlocked) sum += Math.max(0, s.endHour - s.startHour);
    });
    return Math.round(sum * 10) / 10;
  }, [shifts]);

  const estLaborCost = useMemo(() => {
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    let cost = 0;
    shifts.forEach((s) => {
      if (s.isBlocked) return;
      const hours = Math.max(0, s.endHour - s.startHour);
      const rate = s.payRate ?? employeeMap.get(s.employeeId)?.hourlyPay ?? 0;
      cost += hours * rate;
    });
    return Math.round(cost);
  }, [employees, shifts]);

  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const activeRoles = useMemo(
    () =>
      Array.from(
        shifts.reduce((acc, shift) => {
          if (shift.isBlocked) return acc;
          const job = shift.job ?? 'Unassigned';
          if (!acc.has(job)) acc.set(job, getJobColorKey(job));
          return acc;
        }, new Map<string, string>())
      ),
    [shifts]
  );

  return (
    <div className="report-weekly-root">
      <ReportHeader
        title="Weekly Schedule"
        subtitle={formatReportWeekRange(weekStart, weekEnd)}
        restaurantName={restaurantName}
      />

      {/* Stats bar */}
      <div className="stats-bar flex gap-4 px-3 py-2 bg-zinc-100 rounded-md mb-4 text-[11px]">
        <div className="stat-item flex items-center gap-1">
          <span className="stat-label text-zinc-400 font-medium">Staff</span>
          <span className="stat-value font-bold text-zinc-900">{totalStaff}</span>
        </div>
        <div className="stat-item flex items-center gap-1">
          <span className="stat-label text-zinc-400 font-medium">Total Hours</span>
          <span className="stat-value font-bold text-zinc-900">{totalLaborHours}h</span>
        </div>
        {estLaborCost > 0 && (
          <div className="stat-item flex items-center gap-1">
            <span className="stat-label text-zinc-400 font-medium">Est. Labor</span>
            <span className="stat-value font-bold text-zinc-900">
              ${estLaborCost.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div className="text-center py-12 text-zinc-400 text-sm">Loading shifts...</div>
      )}
      {error && (
        <div className="text-center py-8 text-red-500 text-sm">Error: {error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && shifts.length === 0 && (
        <div className="empty-state">No shifts scheduled.</div>
      )}

      {/* Week table */}
      {!loading && !error && shifts.length > 0 && (
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 border border-zinc-200 bg-zinc-50 font-bold text-zinc-700 w-[120px] min-w-[120px]">
                Employee
              </th>
              {weekDates.map((d, i) => {
                const { weekday, monthDay } = formatDayHeader(d);
                const isToday = toYMD(d) === toYMD(new Date());
                return (
                  <th
                    key={i}
                    className={`text-center px-1 py-1.5 border border-zinc-200 font-bold ${
                      isToday ? 'bg-amber-50 text-amber-700' : 'bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <div className="text-[10px]">{weekday}</div>
                    <div className="text-[9px] font-medium text-zinc-400">{monthDay}</div>
                  </th>
                );
              })}
              <th className="text-center px-1 py-1.5 border border-zinc-200 bg-zinc-50 font-bold text-zinc-700 w-[48px] min-w-[48px]">
                Hours
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.job}>
                {/* Role separator */}
                <tr className="week-role-separator">
                  <td
                    colSpan={9}
                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide border-0"
                    style={{ backgroundColor: group.bgColor, color: group.color }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                      {group.job}
                      <span className="text-[9px] font-semibold opacity-60">({group.rows.length})</span>
                    </span>
                  </td>
                </tr>

                {/* Employee rows */}
                {group.rows.map((row) => (
                  <tr key={row.employee.id}>
                    <td className="px-2 py-1 border border-zinc-200 font-semibold text-zinc-800 truncate max-w-[120px]">
                      {row.employee.name}
                    </td>
                    {dateStrings.map((dateStr, i) => (
                      <td
                        key={i}
                        className="px-1 py-1 border border-zinc-200 text-center align-top"
                      >
                        <ShiftCell shifts={row.shiftsByDay.get(dateStr) ?? []} />
                      </td>
                    ))}
                    <td className="px-1 py-1 border border-zinc-200 text-center font-bold text-zinc-700">
                      {row.totalHours > 0 ? `${row.totalHours}h` : '\u2014'}
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      )}

      {/* Footer: legend + totals */}
      <div className="report-footer flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-zinc-200 text-[10px] text-zinc-500">
        <div className="footer-meta">Generated {formatReportTimestamp()}</div>
        <div className="color-legend ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#f59e0b' }} />
            <span>AM shift</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#6366f1' }} />
            <span>PM shift</span>
          </div>
          {activeRoles.map(([job, key]) => (
            <div key={job} className="legend-item">
              <span className={`legend-dot role-${key}-solid`} />
              <span>{job}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
