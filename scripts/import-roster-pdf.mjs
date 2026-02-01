#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ROLE_ALIASES = {
  manager: 'Manager',
  mgr: 'Manager',
  server: 'Server',
  host: 'Host',
  hostess: 'Host',
  dishwasher: 'Dishwasher',
  dish: 'Dishwasher',
  busser: 'Busser',
  buss: 'Busser',
  prep: 'Prep',
  cook: 'Cook',
};

function usage() {
  console.log(
    'Usage: node scripts/import-roster-pdf.mjs "<PDF_PATH>" --org=<ORG_ID> [--dry-run] [--ocr]'
  );
}

function parseArgs(argv) {
  const args = { pdfPath: '', orgId: '', dryRun: false, ocr: false, weekStart: '' };
  const parts = argv.slice(2);
  if (parts.length === 0) return args;
  args.pdfPath = parts[0];
  for (const part of parts.slice(1)) {
    if (part === '--dry-run') args.dryRun = true;
    if (part === '--ocr') args.ocr = true;
    if (part.startsWith('--org=')) args.orgId = part.split('=')[1] ?? '';
    if (part.startsWith('--week-start=')) args.weekStart = part.split('=')[1] ?? '';
  }
  return args;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseName(name) {
  const trimmed = name.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((s) => s.trim());
    return `${first} ${last}`.trim();
  }
  return trimmed;
}

function parseDateString(input) {
  const mdy = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day);
  }
  const monthName = input.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s*(\d{4})/i
  );
  if (monthName) {
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      sept: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const month = monthMap[monthName[1].toLowerCase()];
    const day = Number(monthName[2]);
    const year = Number(monthName[3]);
    return new Date(year, month, day);
  }
  return null;
}

function findWeekRange(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!/week/i.test(line)) continue;
    const dates = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
    if (dates && dates.length >= 2) {
      const start = parseDateString(dates[0]);
      const end = parseDateString(dates[1]);
      if (start && end) return { start, end };
    }
  }
  const allDates = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g);
  if (allDates && allDates.length >= 2) {
    const start = parseDateString(allDates[0]);
    const end = parseDateString(allDates[1]);
    if (start && end) return { start, end };
  }
  return null;
}

function getWeekDates(startDate) {
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimeToken(raw, fallbackPeriod) {
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m|[ap])?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  let period = match[3]?.toLowerCase();
  if (!period && fallbackPeriod) period = fallbackPeriod;
  if (!period) return { hour, minute, period: null };
  if (period === 'a') period = 'am';
  if (period === 'p') period = 'pm';
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return { hour, minute, period };
}

function parseTimeRange(text) {
  const match = text.match(/(\d{1,2}(?::\d{2})?\s*[ap]m?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*[ap]m?)/i);
  if (!match) return null;
  const startToken = parseTimeToken(match[1]);
  const endToken = parseTimeToken(match[2], startToken?.period ?? null);
  if (!startToken || !endToken) return null;
  let startHour = startToken.hour;
  const startMinute = startToken.minute;
  let endHour = endToken.hour;
  const endMinute = endToken.minute;
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal && startToken.period && !endToken.period) {
    endTotal += 12 * 60;
  }
  if (endTotal <= startTotal) {
    return null;
  }
  return {
    start: { hour: Math.floor(startTotal / 60), minute: startTotal % 60 },
    end: { hour: Math.floor(endTotal / 60), minute: endTotal % 60 },
    matched: match[0],
  };
}

function formatTime({ hour, minute }) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm}`;
}

function normalizeRole(raw) {
  const cleaned = raw.trim().replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const key = cleaned.toLowerCase();
  if (ROLE_ALIASES[key]) return ROLE_ALIASES[key];
  const title = cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return title;
}

function parseCell(cell) {
  const text = cell.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const segments = text.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const shifts = [];
  for (const segment of segments) {
    const range = parseTimeRange(segment);
    if (!range) {
      continue;
    }
    const afterRange = segment.replace(range.matched, '').trim();
    const beforeRange = segment.split(range.matched)[0].trim();
    let roleText = afterRange || beforeRange;
    let tag = null;
    if (roleText.includes('|')) {
      const [rolePart, tagPart] = roleText.split('|').map((s) => s.trim());
      roleText = rolePart;
      tag = tagPart || null;
    }
    const job = normalizeRole(roleText);
    shifts.push({
      startTime: formatTime(range.start),
      endTime: formatTime(range.end),
      job,
      tag,
    });
  }
  return shifts;
}

function detectHeaderIndex(lines) {
  return lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return DAY_NAMES.every((day) => lower.includes(day));
  });
}

function splitColumns(line) {
  return line.split(/\s{2,}/).map((col) => col.trim()).filter(Boolean);
}

async function main() {
  const { pdfPath, orgId, dryRun, ocr, weekStart } = parseArgs(process.argv);
  if (!pdfPath || !orgId) {
    usage();
    process.exit(1);
  }

  const resolvedPath = path.resolve(pdfPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`PDF not found: ${resolvedPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(resolvedPath);
  const parsed = await pdfParse(buffer);
  let text = parsed.text ?? '';

  if (text.trim().length < 100) {
    console.warn('[import-roster] PDF text is sparse. This may be image-based.');
    if (ocr) {
      try {
        const { execFileSync } = await import('child_process');
        const ocrText = execFileSync('tesseract', [resolvedPath, 'stdout', '--dpi', '300'], {
          encoding: 'utf-8',
        });
        text = ocrText;
        console.warn('[import-roster] OCR completed using tesseract.');
      } catch (error) {
        console.warn('[import-roster] OCR failed. Install tesseract CLI to enable OCR fallback.');
        console.warn(error?.message ?? error);
      }
    }
  }

  let weekRange = null;
  if (weekStart) {
    const parsedStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
      ? new Date(`${weekStart}T00:00:00`)
      : null;
    if (!parsedStart || Number.isNaN(parsedStart.getTime())) {
      console.error('[import-roster] Invalid --week-start format. Use YYYY-MM-DD.');
      process.exit(1);
    }
    weekRange = { start: parsedStart, end: parsedStart };
  } else {
    weekRange = findWeekRange(text);
  }
  if (!weekRange) {
    console.error('[import-roster] Unable to determine week range from PDF (pass --week-start).');
    process.exit(1);
  }

  const weekDates = getWeekDates(weekRange.start);

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = detectHeaderIndex(lines);
  if (headerIndex === -1) {
    console.error('[import-roster] Could not locate header row with weekdays.');
    process.exit(1);
  }

  const rows = [];
  let pending = null;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/total|printed|page\s+\d+/i.test(line)) {
      continue;
    }
    const columns = splitColumns(line);
    if (columns.length >= 8) {
      if (pending) {
        rows.push(pending);
        pending = null;
      }
      const name = columns[0];
      const cells = columns.slice(1);
      while (cells.length < 7) cells.push('');
      if (cells.length > 7) {
        const overflow = cells.splice(6);
        cells[6] = [cells[6], ...overflow].filter(Boolean).join(' ');
      }
      rows.push({ name, cells });
    } else if (pending) {
      // append continuation to last cell
      pending.cells[pending.cells.length - 1] = `${pending.cells[pending.cells.length - 1]} ${line}`.trim();
    } else if (columns.length > 0) {
      pending = { name: columns[0], cells: columns.slice(1) };
    }
  }
  if (pending) rows.push(pending);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[import-roster] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, full_name, jobs')
    .eq('organization_id', orgId);

  if (usersError) {
    console.error('[import-roster] Failed to fetch users:', usersError.message);
    process.exit(1);
  }

  const nameMap = new Map();
  for (const user of users ?? []) {
    const rawName = user.full_name ?? '';
    const normalized = normalizeName(rawName);
    if (!normalized) continue;
    if (!nameMap.has(normalized)) nameMap.set(normalized, []);
    nameMap.get(normalized).push(user);
  }

  const shifts = [];
  const skippedEmployees = [];
  const skippedCells = [];

  for (const row of rows) {
    const parsedName = parseName(row.name || '');
    const normalized = normalizeName(parsedName);
    const matches = nameMap.get(normalized) ?? [];
    if (matches.length !== 1) {
      skippedEmployees.push({ name: parsedName, matches: matches.length });
      continue;
    }
    const employee = matches[0];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const cell = row.cells[dayIndex] ?? '';
      const parsedShifts = parseCell(cell);
      if (parsedShifts.length === 0 && cell.trim()) {
        skippedCells.push({ name: parsedName, date: formatDate(weekDates[dayIndex]), cell });
      }
      parsedShifts.forEach((shift) => {
        shifts.push({
          employeeId: employee.id,
          date: formatDate(weekDates[dayIndex]),
          startTime: shift.startTime,
          endTime: shift.endTime,
          job: shift.job,
          tag: shift.tag,
          notes: shift.tag ? `Roster tag: ${shift.tag}` : null,
        });
      });
    }
  }

  if (dryRun) {
    console.log('DRY RUN: Parsed shifts');
    shifts.forEach((shift) => {
      console.log(
        `${shift.employeeId} ${shift.date} ${shift.startTime}-${shift.endTime} ${shift.job ?? 'UNKNOWN'} ${shift.tag ?? ''}`
      );
    });
  } else if (shifts.length > 0) {
    const payload = shifts.map((shift) => ({
      organization_id: orgId,
      user_id: shift.employeeId,
      shift_date: shift.date,
      start_time: shift.startTime,
      end_time: shift.endTime,
      notes: shift.notes,
      is_blocked: false,
      job: shift.job,
      location_id: null,
    }));
    const { error: insertError } = await supabase.from('shifts').insert(payload);
    if (insertError) {
      console.error('[import-roster] Insert failed:', insertError.message);
      process.exit(1);
    }
  }

  console.log('Summary');
  console.log(`  shifts parsed: ${shifts.length}`);
  console.log(`  skipped employees: ${skippedEmployees.length}`);
  skippedEmployees.forEach((entry) => {
    console.log(`    - ${entry.name} (matches: ${entry.matches})`);
  });
  console.log(`  skipped cells: ${skippedCells.length}`);
  skippedCells.slice(0, 10).forEach((entry) => {
    console.log(`    - ${entry.name} ${entry.date} "${entry.cell}"`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
