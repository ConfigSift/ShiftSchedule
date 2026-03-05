export type ScheduleReadyShift = {
  dateISO: string;
  startTime: string;
  endTime: string;
  jobLabel: string;
  hours: number;
  note?: string | null;
  comment?: string | null;
};

type RenderScheduleReadyEmailParams = {
  restaurantName: string;
  weekLabel: string;
  shifts: ScheduleReadyShift[];
  totalHours: number;
  viewScheduleUrl: string;
  manageNotificationsUrl?: string;
  employeeName?: string | null;
};

type RenderScheduleReadyEmailResult = {
  subject: string;
  html: string;
  text: string;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseDateISO(dateISO: string): Date | null {
  const match = DATE_RE.exec(String(dateISO ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0));
}

function formatShiftDate(dateISO: string): string {
  const parsed = parseDateISO(dateISO);
  if (!parsed) return dateISO;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = TIME_RE.exec(String(value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes >= 60) return null;
  if (hours === 24 && minutes > 0) return null;
  return { hours, minutes };
}

function formatClockTime(time: string): string | null {
  if (isCloseToken(time)) return null;
  const parsed = parseTime(time);
  if (!parsed) return null;
  const normalizedHours = parsed.hours % 24;
  const date = new Date(Date.UTC(2000, 0, 1, normalizedHours, parsed.minutes, 0));
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);
}

function formatTimeRange(startTime: string, endTime: string): string {
  const startLabel = formatClockTime(startTime);
  const endLabel = formatClockTime(endTime);
  if (startLabel && endLabel) return `${startLabel} \u2013 ${endLabel}`;
  if (startLabel) return startLabel;
  if (endLabel) return endLabel;
  return 'Time TBD';
}

function formatTotalHours(hours: number): string {
  const safe = Number.isFinite(hours) ? hours : 0;
  const rounded = Math.round(safe * 2) / 2;
  if (Number.isInteger(rounded)) return `${rounded}h`;
  return `${rounded.toFixed(1).replace(/\.0$/, '')}h`;
}

function formatDurationHours(hours: number): string {
  const safe = Number.isFinite(hours) ? hours : 0;
  const rounded = Math.round(safe * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}h`;
  return `${rounded.toFixed(1).replace(/\.0$/, '')}h`;
}

function truncateEmailNote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 120).trimEnd()}\u2026`;
}

function resolveShiftNote(shift: ScheduleReadyShift): string | null {
  const candidate = String(shift.note ?? shift.comment ?? '').trim();
  if (!candidate) return null;
  return truncateEmailNote(candidate);
}

function isCloseToken(value: string): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'close' || normalized === 'closed' || normalized === 'closing';
}

function resolveGreeting(employeeName: string | null | undefined): string {
  const raw = String(employeeName ?? '').trim();
  const firstName = raw.split(/\s+/)[0] || 'there';
  return `Hi ${firstName},`;
}

export function renderScheduleReadyEmail(
  params: RenderScheduleReadyEmailParams,
): RenderScheduleReadyEmailResult {
  const restaurantName = String(params.restaurantName ?? '').trim() || 'CrewShyft';
  const weekLabel = String(params.weekLabel ?? '').trim() || 'This week';
  const viewScheduleUrl = String(params.viewScheduleUrl ?? '').trim();
  const manageNotificationsUrl = String(params.manageNotificationsUrl ?? '').trim();
  const safeShifts = Array.isArray(params.shifts) ? params.shifts : [];
  const totalHoursLabel = formatTotalHours(params.totalHours);
  const subtitle = `${restaurantName} \u2022 ${weekLabel}`;
  const greeting = resolveGreeting(params.employeeName);
  const subject = `Your schedule is ready - ${restaurantName}`;

  const groupedShiftEntries = Array.from(
    safeShifts.reduce((map, shift) => {
      const key = String(shift.dateISO ?? '').trim();
      const list = map.get(key) ?? [];
      list.push(shift);
      map.set(key, list);
      return map;
    }, new Map<string, ScheduleReadyShift[]>()),
  ).sort(([a], [b]) => a.localeCompare(b));

  const shiftRowsHtml = groupedShiftEntries.length > 0
    ? groupedShiftEntries
      .map(([dateISO, dayShifts]) => {
        const dayLabel = escapeHtml(formatShiftDate(dateISO));
        const dayRows = dayShifts
          .map((shift, index) => {
            const timeLabel = escapeHtml(formatTimeRange(shift.startTime, shift.endTime));
            const jobLabel = escapeHtml(String(shift.jobLabel ?? '').trim() || 'Shift');
            const hoursLabel = escapeHtml(formatDurationHours(shift.hours));
            const durationPill = `<span style="display:inline-block;vertical-align:middle;margin-left:8px;background:#EEF2FF;color:#1D4ED8;border-radius:999px;padding:2px 8px;font-size:12px;line-height:1.2;font-weight:600;white-space:nowrap;">${hoursLabel}</span>`;
            const note = resolveShiftNote(shift);
            const noteRow = note
              ? `
                              <tr>
                                <td colspan="2" style="padding:6px 0 0 0;color:#6b7280;font-size:12px;line-height:1.45;">Note: ${escapeHtml(note)}</td>
                              </tr>`
              : '';
            const topPadding = index === 0 ? '0' : '10px';
            return `
                          <tr>
                            <td style="padding:${topPadding} 0 0 0;">
                              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                  <td style="color:#111827;font-size:13px;line-height:1.35;font-weight:600;"><span style="display:inline-block;vertical-align:middle;">${timeLabel}</span>${durationPill}</td>
                                  <td align="right" style="padding-left:8px;white-space:nowrap;">
                                    <span style="display:inline-block;vertical-align:middle;background:#e8f3ff;color:#2563eb;border-radius:8px;padding:4px 8px;font-size:12px;line-height:1.2;font-weight:700;">${jobLabel}</span>
                                  </td>
                                </tr>
${noteRow}
                              </table>
                            </td>
                          </tr>`.trimEnd();
          })
          .join('\n');

        return `
                <tr>
                  <td style="padding:0 0 10px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:12px;">
                      <tr>
                        <td style="padding:14px 16px;vertical-align:top;">
                          <div style="margin:0;color:#111827;font-size:14px;line-height:1.3;font-weight:700;">${dayLabel}</div>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;">
${dayRows}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`.trimEnd();
      })
      .join('\n')
    : `
                <tr>
                  <td style="padding:2px 0 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
                    No shifts scheduled for this week.
                  </td>
                </tr>`.trim();

  const manageLineHtml = manageNotificationsUrl
    ? `<a href="${escapeHtml(manageNotificationsUrl)}" style="color:#374151;text-decoration:underline;">Manage notifications</a>`
    : 'Manage notifications';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f7fb;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border:1px solid #e8eaf0;border-radius:16px;">
            <tr>
              <td style="padding:28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding:0 0 20px 0;">
                      <p style="margin:0 0 6px 0;color:#374151;font-size:14px;line-height:1.45;">${escapeHtml(greeting)}</p>
                      <h1 style="margin:0;color:#111827;font-size:28px;line-height:1.2;font-weight:800;">Your schedule is ready</h1>
                      <p style="margin:8px 0 0 0;color:#6b7280;font-size:14px;line-height:1.5;">${escapeHtml(subtitle)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 12px 0;color:#6b7280;font-size:11px;line-height:1.2;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
                      YOUR SHIFTS THIS WEEK
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${shiftRowsHtml}
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0 0 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e8eaf0;">
                        <tr>
                          <td style="padding-top:12px;color:#374151;font-size:14px;line-height:1.4;">Total this week</td>
                          <td align="right" style="padding-top:12px;color:#111827;font-size:16px;line-height:1.2;font-weight:800;">${escapeHtml(totalHoursLabel)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 0 0 0;">
                      <a href="${escapeHtml(viewScheduleUrl)}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:800;font-size:14px;line-height:1;padding:12px 16px;border-radius:12px;">View Full Schedule &rarr;</a>
                      <p style="margin:10px 0 0 0;color:#6b7280;font-size:12px;line-height:1.5;">
                        If the button doesn&#39;t work, use this link:
                        <a href="${escapeHtml(viewScheduleUrl)}" style="color:#111827;word-break:break-all;text-decoration:underline;">${escapeHtml(viewScheduleUrl)}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 0 0 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e8eaf0;">
                        <tr>
                          <td style="padding-top:14px;">
                            <div style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">You&#39;re on the ${escapeHtml(restaurantName)} team</div>
                            <div style="margin:2px 0 0 0;color:#6b7280;font-size:12px;line-height:1.5;">${manageLineHtml}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    subject,
    '',
    greeting,
    '',
    `${restaurantName} - ${weekLabel}`,
    '',
    'YOUR SHIFTS THIS WEEK',
    ...(groupedShiftEntries.length > 0
      ? groupedShiftEntries.flatMap(([dateISO, dayShifts]) => {
        const dayLabel = formatShiftDate(dateISO);
        const lines = [`- ${dayLabel}`];
        for (const shift of dayShifts) {
          const timeLabel = formatTimeRange(shift.startTime, shift.endTime);
          const jobLabel = String(shift.jobLabel ?? '').trim() || 'Shift';
          const note = resolveShiftNote(shift);
          const durationLabel = formatDurationHours(shift.hours);
          const noteSuffix = note ? ` | Note: ${note}` : '';
          lines.push(`  - ${timeLabel} [${durationLabel}] | ${jobLabel}${noteSuffix}`);
        }
        return lines;
      })
      : ['- No shifts scheduled for this week.']),
    '',
    `Total this week: ${totalHoursLabel}`,
    '',
    `View Full Schedule: ${viewScheduleUrl}`,
    manageNotificationsUrl ? `Manage notifications: ${manageNotificationsUrl}` : 'Manage notifications',
  ];

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}
