import { getJobColorClasses } from '../../lib/jobColors';
import type { JobColorKey } from '../../lib/jobColors';

const JOB_KEYS: JobColorKey[] = [
  'bartender',
  'busser',
  'dishwasher',
  'host',
  'kitchen',
  'manager',
  'server',
  'other',
];

/** Build CSS class declarations for each role color (inline in the print document). */
function buildRoleColorCSS(): string {
  return JOB_KEYS.map((key) => {
    const c = getJobColorClasses(key);
    return `
      .role-${key}-color { color: ${c.color}; }
      .role-${key}-bg { background-color: ${c.bgColor}; }
      .role-${key}-solid { background-color: ${c.color}; }
      .role-${key}-border { border-color: ${c.color}; }
      .role-${key}-bar { background-color: ${c.color}; opacity: 0.85; }
    `;
  }).join('\n');
}

/** Complete CSS for the print window documents. */
export function getPrintCSS(options?: { orientation?: 'portrait' | 'landscape'; margin?: string }): string {
  const orientation = options?.orientation ?? 'portrait';
  const margin = options?.margin ?? '0.4in 0.3in';
  return `
    /* Reset & base */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.35;
      color: #18181b;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page {
      margin: ${margin};
      size: ${orientation};
    }

    /* Page setup */
    .report-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 16px 20px;
    }

    /* Header */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #d4d4d8;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .report-header-left h1 {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
    }

    .report-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }

    .report-header-left .report-date {
      font-size: 11px;
      color: #52525b;
      margin-top: 2px;
    }

    .report-header-right {
      text-align: right;
      font-size: 10px;
      color: #71717a;
    }

    .report-brand {
      font-weight: 700;
      font-size: 12px;
      color: #f59e0b;
    }

    .report-footer {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding-top: 12px;
      border-top: 1px solid #e4e4e7;
      margin-top: 16px;
      font-size: 10px;
      color: #52525b;
      align-items: center;
    }

    .report-footer .footer-meta {
      font-size: 10px;
      color: #71717a;
    }

    .empty-state {
      text-align: center;
      padding: 48px 0;
      color: #a1a1aa;
      font-size: 12px;
    }

    /* Stats bar */
    .stats-bar {
      display: flex;
      gap: 12px;
      padding: 6px 10px;
      background: #f4f4f5;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 10px;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stat-label {
      color: #71717a;
      font-weight: 500;
    }

    .stat-value {
      font-weight: 700;
      color: #18181b;
    }

    .stat-accent {
      color: #b45309;
    }

    /* Two-column roster */
    .roster-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .roster-column h2 {
      font-size: 14px;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 8px;
    }

    .roster-column-am h2 {
      background: #dbeafe;
      color: #1e40af;
    }

    .roster-column-pm h2 {
      background: #fef3c7;
      color: #92400e;
    }

    /* Role group header */
    .role-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 6px;
      margin-top: 6px;
      margin-bottom: 3px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .role-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Employee row */
    .employee-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
      padding: 2px 6px;
      border-bottom: 1px solid #f8fafc;
      font-size: 10px;
    }

    .employee-row:last-child {
      border-bottom: none;
    }

    .employee-name {
      font-weight: 600;
    }

    .employee-phone {
      color: #71717a;
      font-size: 10px;
    }

    .employee-time {
      font-weight: 500;
      white-space: nowrap;
    }

    .report-roster-root .employee-row {
      grid-template-columns: 1fr 120px 90px;
    }

    .double-star {
      color: #f59e0b;
      font-weight: 700;
      font-size: 13px;
      margin-left: 2px;
    }

    /* Timeline report */
    .timeline-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .timeline-table th {
      font-size: 9px;
      font-weight: 600;
      text-align: center;
      padding: 4px 2px;
      border-bottom: 1px solid #d4d4d8;
      color: #71717a;
      background: #fafafa;
    }

    .timeline-table th:first-child {
      text-align: left;
      width: 140px;
      min-width: 140px;
    }

    .timeline-name-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 4px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .timeline-avatar {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
    }

    .timeline-row {
      height: 28px;
      position: relative;
    }

    .timeline-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .timeline-header {
      display: grid;
      grid-template-columns: 160px 1fr;
      align-items: end;
      border-bottom: 1px solid #d4d4d8;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }

    .timeline-header-spacer {
      height: 1px;
    }

    .timeline-header-hours {
      display: flex;
      align-items: center;
      gap: 0;
    }

    .timeline-hour {
      text-align: center;
      font-size: 9px;
      font-weight: 600;
      color: #71717a;
    }

    .timeline-row {
      display: grid;
      grid-template-columns: 160px 1fr;
      align-items: center;
      gap: 6px;
    }

    .timeline-bar-cell {
      position: relative;
      border-left: 1px solid #f4f4f5;
      height: 28px;
    }

    .timeline-grid-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: #f4f4f5;
    }

    .timeline-bar {
      position: absolute;
      top: 3px;
      bottom: 3px;
      border-radius: 3px;
      min-width: 2px;
    }

    .timeline-bar-label {
      font-size: 8px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-left: 4px;
      line-height: 20px;
    }

    .timeline-role-row td {
      padding: 4px 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Weekly grid */
    .week-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }

    .week-table th {
      padding: 6px 4px;
      text-align: center;
      font-size: 10px;
      font-weight: 700;
      background: #fafafa;
      border: 1px solid #e4e4e7;
    }

    .week-table th:first-child {
      text-align: left;
      width: 130px;
      min-width: 130px;
    }

    .week-table th:last-child {
      width: 50px;
      min-width: 50px;
    }

    .week-table td {
      padding: 3px 4px;
      border: 1px solid #e4e4e7;
      text-align: center;
      vertical-align: top;
      font-size: 10px;
    }

    .week-table td:first-child {
      text-align: left;
      font-weight: 600;
    }

    .week-table td:last-child {
      font-weight: 700;
      text-align: center;
    }

    .week-role-separator td {
      padding: 5px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: none;
    }

    .week-shift-cell {
      border-radius: 3px;
      padding: 2px 4px;
      margin: 1px 0;
      font-size: 9px;
      font-weight: 500;
      white-space: nowrap;
    }

    .am-dot, .pm-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-left: 3px;
      vertical-align: middle;
    }

    .am-dot { background: #3b82f6; }
    .pm-dot { background: #f59e0b; }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .status-published {
      background: #d1fae5;
      color: #065f46;
    }

    .status-draft {
      background: #fef3c7;
      color: #92400e;
    }

    /* Color legend */
    .color-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-left: auto;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: #52525b;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .truncate {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Role color classes */
    ${buildRoleColorCSS()}

    /* Print rules */
    @media print {
      body { font-size: 10px; }
      .report-page { padding: 0; max-width: none; }
      .no-print { display: none !important; }
      .print-hide-total-hours { display: none !important; }

      /* Prevent row breaks */
      .employee-row,
      .timeline-row,
      .week-table tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      /* Keep group headers with their content */
      .role-header {
        page-break-after: avoid;
        break-after: avoid;
      }

      .week-role-separator {
        page-break-after: avoid;
        break-after: avoid;
      }
    }
  `;
}

/** Wraps body HTML in a full HTML document with the print stylesheet. */
export function wrapInHTMLDocument(
  bodyHTML: string,
  title: string,
  options?: { orientation?: 'portrait' | 'landscape'; margin?: string }
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <style>${getPrintCSS(options)}</style>
</head>
<body>
  ${bodyHTML}
</body>
</html>`;
}

/** Escape HTML special characters for safe insertion. */
export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
