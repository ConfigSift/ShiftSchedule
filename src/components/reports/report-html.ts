import type { Employee, Shift } from '../../types';
import {
  calculateDailyStats,
  calculateWeeklyHours,
  classifyShift,
  formatHourForReport,
  formatPhoneStrict,
  formatTimeLabel,
  formatReportDate,
  formatReportTimestamp,
  formatReportWeekRange,
  compareJobs,
  getJobColorKey,
  getJobColorClasses,
} from './report-utils';
import { escapeHTML } from './print-styles';

type ReportHeaderInput = {
  restaurantName: string;
  title: string;
  dateLabel: string;
};

function renderHeaderHTML({ restaurantName, title, dateLabel }: ReportHeaderInput): string {
  return `
    <div class="report-header">
      <div class="report-header-left">
        <h1>${escapeHTML(restaurantName)}</h1>
        <div class="report-title">${escapeHTML(title)}</div>
        <div class="report-date">${escapeHTML(dateLabel)}</div>
      </div>
      <div class="report-header-right">
        <div class="report-brand">CrewShyft</div>
      </div>
    </div>
  `;
}

function renderStatsBar(items: Array<{ label: string; value: string; accent?: boolean; className?: string }>): string {
  return `
    <div class="stats-bar">
      ${items
        .map(
          (item) => `
            <div class="stat-item${item.className ? ` ${item.className}` : ''}">
              <span class="stat-label">${escapeHTML(item.label)}</span>
              <span class="stat-value${item.accent ? ' stat-accent' : ''}">${escapeHTML(item.value)}</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderLegendItems(items: Array<{ label: string; className?: string; style?: string }>): string {
  if (!items.length) return '';
  return items
    .map((item) => {
      const extraClass = item.className ? ` ${item.className}` : '';
      const dotStyle = item.style ? `style="${item.style}"` : '';
      return `
        <div class="legend-item">
          <span class="legend-dot${extraClass}" ${dotStyle}></span>
          <span>${escapeHTML(item.label)}</span>
        </div>
      `;
    })
    .join('');
}

function renderFooter(timestamp: string, legendHTML?: string): string {
  return `
    <div class="report-footer">
      <div class="footer-meta">Generated ${escapeHTML(timestamp)}</div>
      ${legendHTML ? `<div class="color-legend">${legendHTML}</div>` : ''}
    </div>
  `;
}

function getActiveRoles(shifts: Shift[]): Array<{ job: string; key: string }> {
  const seen = new Set<string>();
  const roles: Array<{ job: string; key: string }> = [];
  shifts.forEach((shift) => {
    if (shift.isBlocked) return;
    const job = shift.job ?? 'Unassigned';
    if (seen.has(job)) return;
    seen.add(job);
    roles.push({ job, key: getJobColorKey(job) });
  });
  return roles;
}

function formatPhone(emp: Employee): string {
  const phone = emp.phone ?? emp.profile?.phone;
  return formatPhoneStrict(phone);
}

// ---------------------------------------------------------------------------
// Daily Roster HTML
// ---------------------------------------------------------------------------

export function generateDailyRosterHTML(
  date: Date,
  restaurantName: string,
  employees: Employee[],
  shifts: Shift[]
): string {
  const stats = calculateDailyStats(employees, shifts);
  const timestamp = formatReportTimestamp();
  const totalHours = shifts.reduce((sum, shift) => sum + Math.max(0, shift.endHour - shift.startHour), 0);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const employeeIds = new Set(shifts.map((s) => s.employeeId));

  const buildGroups = (period: 'AM' | 'PM') => {
    const groupMap = new Map<string, Array<{ employee: Employee; shift: Shift; isDouble: boolean }>>();
    const doubleSet = new Set<string>();
    employeeIds.forEach((id) => {
      let hasAM = false;
      let hasPM = false;
      shifts.forEach((shift) => {
        if (shift.employeeId !== id) return;
        if (shift.isBlocked) return;
        const classification = classifyShift(shift.startHour);
        if (classification === 'AM') hasAM = true;
        else hasPM = true;
      });
      if (hasAM && hasPM) doubleSet.add(id);
    });

    shifts
      .filter((s) => classifyShift(s.startHour) === period)
      .forEach((shift) => {
        const emp = employeeMap.get(shift.employeeId);
        if (!emp) return;
        const job = shift.job ?? 'Unassigned';
        if (!groupMap.has(job)) groupMap.set(job, []);
        groupMap.get(job)!.push({ employee: emp, shift, isDouble: doubleSet.has(shift.employeeId) });
      });

    groupMap.forEach((entries) =>
      entries.sort((a, b) => a.shift.startHour - b.shift.startHour || a.employee.name.localeCompare(b.employee.name))
    );

    const result: Array<{ job: string; key: string; entries: typeof groupMap extends Map<any, infer T> ? T : never }> = [];
    const jobList = Array.from(groupMap.keys()).sort(compareJobs);
    for (const job of jobList) {
      const entries = groupMap.get(job);
      if (!entries || entries.length === 0) continue;
      result.push({ job, key: getJobColorKey(job), entries });
    }

    return result;
  };

  const amGroups = buildGroups('AM');
  const pmGroups = buildGroups('PM');
  const hasShifts = shifts.length > 0;

  const legendItems = [
    ...(stats.doublesCount > 0
      ? [{ label: 'Double shift', className: 'legend-dot', style: 'background:#f59e0b;' }]
      : []),
    ...getActiveRoles(shifts).map((role) => ({
      label: role.job,
      className: `legend-dot role-${role.key}-solid`,
    })),
  ];

  return `
    <div class="report-page report-roster-root report-print">
      ${renderHeaderHTML({
        restaurantName,
        title: 'Daily Roster',
        dateLabel: formatReportDate(date),
      })}
      ${renderStatsBar(
        [
          { label: 'Staff', value: String(stats.total) },
          { label: 'AM', value: String(stats.amCount) },
          { label: 'PM', value: String(stats.pmCount) },
          ...(stats.doublesCount > 0 ? [{ label: 'Doubles', value: String(stats.doublesCount), accent: true }] : []),
          { label: 'Total Hours', value: `${Math.round(totalHours * 10) / 10}h`, className: 'print-hide-total-hours' },
          ...(stats.estLaborCost > 0
            ? [{ label: 'Est. Labor', value: `$${stats.estLaborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` }]
            : []),
        ]
      )}
      ${
        !hasShifts
          ? `<div class="empty-state">No shifts scheduled.</div>`
          : `
        <div class="roster-columns">
          <div class="roster-column roster-column-am">
            <h2>AM Shift \u2013 ${stats.amCount} staff</h2>
            ${
              amGroups.length === 0
                ? '<div class="employee-row"><span class="employee-name">No AM shifts</span></div>'
                : amGroups
                    .map(
                      (group) => `
                <div class="role-header role-${group.key}-bg role-${group.key}-color">
                  <span class="role-dot role-${group.key}-solid"></span>
                  ${escapeHTML(group.job)}
                  <span style="margin-left:auto; font-size:10px;">${group.entries.length}</span>
                </div>
                ${group.entries
                  .map(
                    (entry) => `
                  <div class="employee-row">
                    <span class="employee-name truncate">
                      ${escapeHTML(entry.employee.name)}${entry.isDouble ? '<span class="double-star">*</span>' : ''}
                    </span>
                    <span class="employee-phone">${escapeHTML(formatPhone(entry.employee))}</span>
                    <span class="employee-time">${escapeHTML(formatTimeLabel(entry.shift.startHour))}</span>
                  </div>
                `
                  )
                  .join('')}
              `
                    )
                    .join('')
            }
          </div>
          <div class="roster-column roster-column-pm">
            <h2>PM Shift \u2013 ${stats.pmCount} staff</h2>
            ${
              pmGroups.length === 0
                ? '<div class="employee-row"><span class="employee-name">No PM shifts</span></div>'
                : pmGroups
                    .map(
                      (group) => `
                <div class="role-header role-${group.key}-bg role-${group.key}-color">
                  <span class="role-dot role-${group.key}-solid"></span>
                  ${escapeHTML(group.job)}
                  <span style="margin-left:auto; font-size:10px;">${group.entries.length}</span>
                </div>
                ${group.entries
                  .map(
                    (entry) => `
                  <div class="employee-row">
                    <span class="employee-name truncate">
                      ${escapeHTML(entry.employee.name)}${entry.isDouble ? '<span class="double-star">*</span>' : ''}
                    </span>
                    <span class="employee-phone">${escapeHTML(formatPhone(entry.employee))}</span>
                    <span class="employee-time">${escapeHTML(formatTimeLabel(entry.shift.startHour))}</span>
                  </div>
                `
                  )
                  .join('')}
              `
                    )
                    .join('')
            }
          </div>
        </div>
      `
      }
      ${renderFooter(timestamp, renderLegendItems(legendItems))}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Daily Timeline HTML
// ---------------------------------------------------------------------------

const TIMELINE_START = 6;
const TIMELINE_END = 24;

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

export function generateDailyTimelineHTML(
  date: Date,
  restaurantName: string,
  employees: Employee[],
  shifts: Shift[]
): string {
  const stats = calculateDailyStats(employees, shifts);
  const timestamp = formatReportTimestamp();
  const totalHours = shifts.reduce((sum, shift) => sum + Math.max(0, shift.endHour - shift.startHour), 0);
  const roles = getActiveRoles(shifts);

  let maxEnd = 23;
  shifts.forEach((shift) => {
    if (shift.endHour > maxEnd) maxEnd = Math.ceil(shift.endHour);
  });
  const effectiveEnd = Math.min(maxEnd, TIMELINE_END);
  const hours: number[] = [];
  for (let h = TIMELINE_START; h < effectiveEnd; h += 1) hours.push(h);
  const effectiveHours = Math.max(1, effectiveEnd - TIMELINE_START);
  const colPct = 100 / effectiveHours;

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const employeeShifts = new Map<string, Shift[]>();
  const employeePrimaryJob = new Map<string, string>();
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
  employeeShifts.forEach((list) => list.sort((a, b) => a.startHour - b.startHour));

  const groupMap = new Map<string, Array<{ employee: Employee; shifts: Shift[] }>>();
  employeesWithShifts.forEach((empId) => {
    const emp = employeeMap.get(empId);
    if (!emp || !emp.isActive) return;
    const job = employeePrimaryJob.get(empId) ?? 'Unassigned';
    if (!groupMap.has(job)) groupMap.set(job, []);
    groupMap.get(job)!.push({ employee: emp, shifts: employeeShifts.get(empId) ?? [] });
  });
  groupMap.forEach((rows) => rows.sort((a, b) => a.employee.name.localeCompare(b.employee.name)));

  const groups: Array<{ job: string; key: string; rows: Array<{ employee: Employee; shifts: Shift[] }> }> = [];
  const jobList = Array.from(groupMap.keys()).sort(compareJobs);
  for (const job of jobList) {
    const rows = groupMap.get(job);
    if (!rows || rows.length === 0) continue;
    groups.push({ job, key: getJobColorKey(job), rows });
  }

  const legendItems = [
    { label: 'AM shift', className: 'am-dot' },
    { label: 'PM shift', className: 'pm-dot' },
    ...roles.map((role) => ({
      label: role.job,
      className: `legend-dot role-${role.key}-solid`,
    })),
  ];

  return `
    <div class="report-page report-timeline-root">
      ${renderHeaderHTML({
        restaurantName,
        title: 'Daily Timeline',
        dateLabel: formatReportDate(date),
      })}
      ${renderStatsBar(
        [
          { label: 'Staff', value: String(stats.total) },
          { label: 'AM', value: String(stats.amCount) },
          { label: 'PM', value: String(stats.pmCount) },
          ...(stats.doublesCount > 0 ? [{ label: 'Doubles', value: String(stats.doublesCount), accent: true }] : []),
          { label: 'Total Hours', value: `${Math.round(totalHours * 10) / 10}h`, className: 'print-hide-total-hours' },
          ...(stats.estLaborCost > 0
            ? [{ label: 'Est. Labor', value: `$${stats.estLaborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` }]
            : []),
        ]
      )}
      ${
        shifts.length === 0
          ? `<div class="empty-state">No shifts scheduled.</div>`
          : `
        <div class="timeline-grid">
          <div class="timeline-header">
            <div class="timeline-header-spacer"></div>
            <div class="timeline-header-hours">
              ${hours
                .map(
                  (h) => `
                    <div class="timeline-hour" style="width:${colPct}%">
                      ${hourLabel(h)}
                    </div>
                  `
                )
                .join('')}
            </div>
          </div>
          ${groups
            .map(
              (group) => `
                <div class="timeline-role-row role-${group.key}-bg role-${group.key}-color">
                  <span class="role-dot role-${group.key}-solid"></span>
                  ${escapeHTML(group.job)} (${group.rows.length})
                </div>
                ${group.rows
                  .map((row) => {
                    const jobColor = getJobColorClasses(row.shifts[0]?.job);
                    return `
                      <div class="timeline-row">
                        <div class="timeline-name-cell">
                          <span class="timeline-avatar" style="background:${jobColor.bgColor}; color:${jobColor.color}">
                            ${escapeHTML(getInitials(row.employee.name))}
                          </span>
                          <span class="truncate">${escapeHTML(row.employee.name)}</span>
                        </div>
                        <div class="timeline-bar-cell">
                          ${hours
                            .map(
                              (h) => `
                                <div
                                  class="timeline-grid-line"
                                  style="left:${(h - TIMELINE_START) * colPct}%;"
                                ></div>
                              `
                            )
                            .join('')}
                          ${row.shifts
                            .map((shift) => {
                              const shiftColor = getJobColorClasses(shift.job);
                              const start = Math.max(shift.startHour, TIMELINE_START);
                              const end = Math.min(shift.endHour, effectiveEnd);
                              if (end <= start) return '';
                              const leftPct = ((start - TIMELINE_START) / effectiveHours) * 100;
                              const widthPct = ((end - start) / effectiveHours) * 100;
                              return `
                                <div class="timeline-bar" style="left:${leftPct}%; width:${widthPct}%; background:${shiftColor.bgColor}; border:1px solid ${shiftColor.color}; border-left:3px solid ${shiftColor.color};">
                                  <div class="timeline-bar-label" style="color:${shiftColor.color};">
                                    ${escapeHTML(formatHourForReport(shift.startHour))}-${escapeHTML(
                                      formatHourForReport(shift.endHour, { isEnd: true })
                                    )}
                                  </div>
                                </div>
                              `;
                            })
                            .join('')}
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              `
            )
            .join('')}
        </div>
      `
      }
      ${renderFooter(timestamp, renderLegendItems(legendItems))}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Weekly Schedule HTML
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

export function generateWeeklyScheduleHTML(
  weekDates: Date[],
  restaurantName: string,
  employees: Employee[],
  shifts: Shift[],
  options?: { loading?: boolean; error?: string | null }
): string {
  const timestamp = formatReportTimestamp();
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const dateStrings = weekDates.map(toYMD);

  const totalStaff = new Set(shifts.filter((s) => !s.isBlocked).map((s) => s.employeeId)).size;
  const totalLaborHours = shifts.reduce((sum, s) => sum + (s.isBlocked ? 0 : Math.max(0, s.endHour - s.startHour)), 0);
  const estLaborCost = (() => {
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    let cost = 0;
    shifts.forEach((s) => {
      if (s.isBlocked) return;
      const hours = Math.max(0, s.endHour - s.startHour);
      const rate = s.payRate ?? employeeMap.get(s.employeeId)?.hourlyPay ?? 0;
      cost += hours * rate;
    });
    return Math.round(cost);
  })();

  const shiftsByEmployee = new Map<string, Shift[]>();
  shifts.forEach((shift) => {
    if (shift.isBlocked) return;
    if (!shiftsByEmployee.has(shift.employeeId)) shiftsByEmployee.set(shift.employeeId, []);
    shiftsByEmployee.get(shift.employeeId)!.push(shift);
  });

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const employeePrimaryJob = new Map<string, string>();
  shiftsByEmployee.forEach((empShifts, empId) => {
    const sorted = [...empShifts].sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
    for (const s of sorted) {
      if (s.job) {
        employeePrimaryJob.set(empId, s.job);
        break;
      }
    }
  });

  const groupMap = new Map<string, Array<{ employee: Employee; shiftsByDay: Map<string, Shift[]>; totalHours: number }>>();
  shiftsByEmployee.forEach((empShifts, empId) => {
    const emp = employeeMap.get(empId);
    if (!emp || !emp.isActive) return;
    const shiftsByDay = new Map<string, Shift[]>();
    dateStrings.forEach((d) => shiftsByDay.set(d, []));
    empShifts.forEach((shift) => {
      const list = shiftsByDay.get(shift.date);
      if (list) list.push(shift);
    });
    shiftsByDay.forEach((list) => list.sort((a, b) => a.startHour - b.startHour));
    const totalHours = calculateWeeklyHours(empId, empShifts);
    const job = employeePrimaryJob.get(empId) ?? 'Unassigned';
    if (!groupMap.has(job)) groupMap.set(job, []);
    groupMap.get(job)!.push({ employee: emp, shiftsByDay, totalHours });
  });
  groupMap.forEach((rows) => rows.sort((a, b) => a.employee.name.localeCompare(b.employee.name)));

  const groups: Array<{ job: string; key: string; rows: Array<{ employee: Employee; shiftsByDay: Map<string, Shift[]>; totalHours: number }> }> = [];
  const jobList = Array.from(groupMap.keys()).sort(compareJobs);
  for (const job of jobList) {
    const rows = groupMap.get(job);
    if (!rows || rows.length === 0) continue;
    groups.push({ job, key: getJobColorKey(job), rows });
  }

  const legendItems = [
    { label: 'AM shift', className: 'am-dot' },
    { label: 'PM shift', className: 'pm-dot' },
  ];

  const hasShifts = shifts.length > 0;

  return `
    <div class="report-page report-weekly-root">
      ${renderHeaderHTML({
        restaurantName,
        title: 'Weekly Schedule',
        dateLabel: formatReportWeekRange(weekStart, weekEnd),
      })}
      ${renderStatsBar(
        [
          { label: 'Staff', value: String(totalStaff) },
          { label: 'Total Hours', value: `${Math.round(totalLaborHours * 10) / 10}h`, className: 'print-hide-total-hours' },
          ...(estLaborCost > 0 ? [{ label: 'Est. Labor', value: `$${estLaborCost.toLocaleString()}` }] : []),
        ]
      )}
      ${
        options?.loading
          ? `<div class="empty-state">Loading shifts...</div>`
          : options?.error
          ? `<div class="empty-state">Error: ${escapeHTML(options.error)}</div>`
          : !hasShifts
          ? `<div class="empty-state">No shifts scheduled.</div>`
          : `
        <table class="week-table">
          <thead>
            <tr>
              <th>Employee</th>
              ${weekDates
                .map((d) => {
                  const { weekday, monthDay } = formatDayHeader(d);
                  return `<th><div>${weekday}</div><div style="font-weight:500; color:#a1a1aa;">${monthDay}</div></th>`;
                })
                .join('')}
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            ${groups
              .map(
                (group) => `
              <tr class="week-role-separator">
                <td colspan="${weekDates.length + 2}" class="role-${group.key}-bg role-${group.key}-color">
                  <span class="role-dot role-${group.key}-solid"></span>
                  ${escapeHTML(group.job)} (${group.rows.length})
                </td>
              </tr>
              ${group.rows
                .map((row) => {
                  return `
                  <tr>
                    <td class="truncate">${escapeHTML(row.employee.name)}</td>
                    ${dateStrings
                      .map((dateStr) => {
                        const cellShifts = row.shiftsByDay.get(dateStr) ?? [];
                        if (!cellShifts.length) return `<td>\u2014</td>`;
                        return `<td>${cellShifts
                          .map((shift) => {
                            const colors = getJobColorClasses(shift.job);
                            const period = classifyShift(shift.startHour);
                            return `
                              <div class="week-shift-cell" style="background:${colors.bgColor}; color:${colors.color}">
                                ${escapeHTML(formatHourForReport(shift.startHour))}-${escapeHTML(
                              formatHourForReport(shift.endHour, { isEnd: true })
                            )}
                                <span class="${period === 'AM' ? 'am-dot' : 'pm-dot'}"></span>
                              </div>
                            `;
                          })
                          .join('')}</td>`;
                      })
                      .join('')}
                    <td>${row.totalHours > 0 ? `${row.totalHours}h` : '\u2014'}</td>
                  </tr>
                `;
                })
                .join('')}
            `
              )
              .join('')}
          </tbody>
        </table>
      `
      }
      ${renderFooter(timestamp, renderLegendItems(legendItems))}
    </div>
  `;
}
