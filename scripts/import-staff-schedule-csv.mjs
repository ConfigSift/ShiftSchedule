#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function usage() {
  console.log(
    'Usage: node scripts/import-staff-schedule-csv.mjs "<csvPath>" --org=<ORG_UUID> [--dry-run] [--limit=<n>] [--delete-week] [--week-start=YYYY-MM-DD]'
  );
}

function parseArgs(argv) {
  const args = {
    csvPath: '',
    orgId: '',
    dryRun: false,
    limit: null,
    deleteWeek: false,
    replace: false,
    weekStart: '',
  };
  const parts = argv.slice(2);
  if (parts.length === 0) return args;
  args.csvPath = parts[0];
  for (const part of parts.slice(1)) {
    if (part === '--dry-run') args.dryRun = true;
    if (part === '--delete-week') args.deleteWeek = true;
    if (part === '--replace') args.replace = true;
    if (part.startsWith('--org=')) args.orgId = part.split('=')[1] ?? '';
    if (part.startsWith('--limit=')) {
      const value = Number(part.split('=')[1]);
      if (Number.isFinite(value) && value > 0) args.limit = value;
    }
    if (part.startsWith('--week-start=')) args.weekStart = part.split('=')[1] ?? '';
  }
  return args;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeName(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseDateString(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const mdy = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day);
  }
  return null;
}

const DAY_ALIASES = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

function weekdayToIndex(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(DAY_ALIASES, key) ? DAY_ALIASES[key] : null;
}

function getWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function dateToString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTime(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3];
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function parseTimeRange(text) {
  const match = text.match(/(\d{1,2}(:\d{2})?\s*[ap]m?)\s*[-–]\s*(\d{1,2}(:\d{2})?\s*[ap]m?)/i);
  if (!match) return null;
  const start = parseTime(match[1]);
  const end = parseTime(match[3]);
  if (!start || !end) return null;
  return { start, end };
}

function isUnavailable(text) {
  const lower = text.trim().toLowerCase();
  if (!lower) return true;
  return lower.includes('unavailable') || lower.includes('time off') || lower.includes('off');
}

function isUnavailableToken(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return [
    'all day',
    'time off',
    'off',
    'pto',
    'vacation',
    'unavailable',
    'n/a',
    '-',
  ].includes(normalized);
}

function parseWideCell(cell) {
  const entries = cell
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  return entries;
}

async function main() {
  const { csvPath, orgId, dryRun, limit, deleteWeek, replace, weekStart } = parseArgs(process.argv);
  if (!csvPath || !orgId) {
    usage();
    process.exit(1);
  }

  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`CSV not found: ${resolvedPath}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const csvText = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    console.error('CSV appears empty.');
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());

  const hasLongDate = header.includes('shift_date');
  const hasDay = header.includes('day');
  const hasWide = header.some((h) => Object.keys(DAY_ALIASES).some((day) => h.startsWith(day)));

  if (!hasLongDate && !hasDay && !hasWide) {
    console.error('CSV does not have recognizable date columns.');
    process.exit(1);
  }

  let weekDates = null;
  if (weekStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      console.error('Invalid --week-start format. Use YYYY-MM-DD.');
      process.exit(1);
    }
    const [year, month, day] = weekStart.split('-').map((value) => Number(value));
    weekDates = getWeekDates(new Date(year, month - 1, day));
  }

  if ((hasDay || hasWide) && !weekDates) {
    console.error('CSV uses day columns but --week-start was not provided.');
    process.exit(1);
  }

  if ((deleteWeek || replace) && weekDates) {
    const start = dateToString(weekDates[0]);
    const end = dateToString(weekDates[6]);
    const { count: orgCount, error: orgCountError } = await supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('shift_date', start)
      .lte('shift_date', end);
    if (orgCountError) {
      console.error('Failed to count existing shifts for org:', orgCountError.message);
      process.exit(1);
    }

    const { count: nullOrgCount, error: nullOrgCountError } = await supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .is('organization_id', null)
      .gte('shift_date', start)
      .lte('shift_date', end);
    if (nullOrgCountError) {
      console.error('Failed to count existing shifts for null org:', nullOrgCountError.message);
      process.exit(1);
    }

    const { count: totalCount, error: totalCountError } = await supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .gte('shift_date', start)
      .lte('shift_date', end);
    if (totalCountError) {
      console.error('Failed to count existing shifts for date range:', totalCountError.message);
      process.exit(1);
    }

    console.log(`count_shifts_org: ${orgCount ?? 0}`);
    console.log(`count_shifts_null_org: ${nullOrgCount ?? 0}`);
    console.log(`count_shifts_total: ${totalCount ?? 0}`);

    if (dryRun) {
      console.log(`DRY RUN: would delete ${orgCount ?? 0} shifts for org`);
      if ((orgCount ?? 0) === 0 && (totalCount ?? 0) > 0) {
        console.log(`DRY RUN: would delete ${nullOrgCount ?? 0} shifts where organization_id is null`);
      }
    } else {
      let deletedOrg = 0;
      let deletedNullOrg = 0;
      const { count: orgDeletedCount, error: orgDeleteError } = await supabase
        .from('shifts')
        .delete({ count: 'exact' })
        .eq('organization_id', orgId)
        .gte('shift_date', start)
        .lte('shift_date', end);
      if (orgDeleteError) {
        console.error('Failed to delete existing shifts for org:', orgDeleteError.message);
        process.exit(1);
      }
      deletedOrg = orgDeletedCount ?? 0;

      if (deletedOrg === 0 && (totalCount ?? 0) > 0) {
        const { count: nullDeletedCount, error: nullDeleteError } = await supabase
          .from('shifts')
          .delete({ count: 'exact' })
          .is('organization_id', null)
          .gte('shift_date', start)
          .lte('shift_date', end);
        if (nullDeleteError) {
          console.error('Failed to delete existing shifts with null org:', nullDeleteError.message);
          process.exit(1);
        }
        deletedNullOrg = nullDeletedCount ?? 0;
      }

      console.log(`deleted_shifts_org: ${deletedOrg}`);
      console.log(`deleted_shifts_null_org: ${deletedNullOrg}`);
      console.log(`deleted_shifts_total: ${deletedOrg + deletedNullOrg}`);
    }
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, hourly_rate, hourly_pay, job_pay')
    .eq('organization_id', orgId);

  if (usersError) {
    console.error('Failed to fetch users:', usersError.message);
    process.exit(1);
  }

  const userByName = new Map();
  const userByEmail = new Map();
  for (const user of users ?? []) {
    const fullName = normalizeName(`${user.first_name ?? ''} ${user.last_name ?? ''}`);
    if (fullName) userByName.set(fullName, user);
    const email = user.email ? normalizeEmail(user.email) : '';
    if (email) userByEmail.set(email, user);
  }

  const shifts = [];
  const errors = [];
  const unmatched = [];
  let skippedUnavailable = 0;
  let skippedHeaderRows = 0;

  const maxRows = limit ? Math.min(lines.length - 1, limit) : lines.length - 1;

  for (let i = 1; i <= maxRows; i += 1) {
    const row = parseCsvLine(lines[i]);
    const rowObj = {};
    header.forEach((key, index) => {
      rowObj[key] = row[index] ?? '';
    });

    const headerRowMatch =
      (rowObj.employee_name || '').toLowerCase() === 'employee_name' ||
      (rowObj.day || '').toLowerCase() === 'day' ||
      (rowObj.start_time || '').toLowerCase() === 'start_time' ||
      (rowObj.end_time || '').toLowerCase() === 'end_time';
    if (headerRowMatch) {
      skippedHeaderRows += 1;
      continue;
    }

    const email = rowObj.email ? normalizeEmail(rowObj.email) : '';
    let name = '';
    if (rowObj.employee_name) {
      name = rowObj.employee_name;
    } else if (rowObj.first_name || rowObj.last_name) {
      name = `${rowObj.first_name ?? ''} ${rowObj.last_name ?? ''}`.trim();
    } else if (rowObj.name) {
      name = rowObj.name;
    }
    const normalizedName = normalizeName(name);

    let user = null;
    if (email && userByEmail.has(email)) {
      user = userByEmail.get(email);
    } else if (normalizedName && userByName.has(normalizedName)) {
      user = userByName.get(normalizedName);
    }

    if (!user) {
      unmatched.push({ name, email, row: i + 1 });
      continue;
    }

    const roleValue = rowObj.role || rowObj.job || '';
    if (String(roleValue).trim().toLowerCase() === 'time off') {
      skippedUnavailable += 1;
      continue;
    }

    if (hasWide) {
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const dayHeader = header.find((h) => Object.keys(DAY_ALIASES).some((day) => h.startsWith(day) && DAY_ALIASES[day] === dayIndex));
        if (!dayHeader) continue;
        const cell = rowObj[dayHeader] ?? '';
        if (isUnavailable(cell)) {
          skippedUnavailable += 1;
          continue;
        }
        const entries = parseWideCell(cell);
        for (const entry of entries) {
          const timeRange = parseTimeRange(entry);
          if (!timeRange) {
            errors.push({
              row: i + 1,
              reason: 'invalid time',
              entry,
              employee_name: name,
              day: dayHeader,
              start_time: '',
              end_time: '',
              role: roleValue,
            });
            continue;
          }
          const closeTag = /close/i.test(entry);
          const job = roleValue || null;
          const notes = closeTag ? `Close${rowObj.notes ? `; ${rowObj.notes}` : ''}` : rowObj.notes || null;
          const shiftDate = dateToString(weekDates[dayIndex]);
          shifts.push({
            employee_name: name,
            day: dayHeader,
            organization_id: orgId,
            user_id: user.id,
            shift_date: shiftDate,
            start_time: timeRange.start,
            end_time: timeRange.end,
            position: job,
            job,
            notes,
            status: 'scheduled',
            break_minutes: null,
            is_marketplace: false,
            is_blocked: rowObj.is_blocked ? rowObj.is_blocked.toLowerCase() === 'true' : false,
            pay_rate: user.hourly_rate ?? user.hourly_pay ?? (user.job_pay?.[rowObj.job] ?? 0),
            pay_source: 'import',
            pay_effective_at: new Date().toISOString(),
          });
        }
      }
      continue;
    }

    const dateValue = rowObj.shift_date || rowObj.day || '';
    let shiftDate = null;
    if (rowObj.shift_date) {
      const parsedDate = parseDateString(rowObj.shift_date);
      shiftDate = parsedDate ? dateToString(parsedDate) : null;
    } else if (rowObj.day && weekDates) {
      const dayIndex = weekdayToIndex(rowObj.day);
      if (dayIndex === null) {
        errors.push({
          row: i + 1,
          reason: 'invalid day',
          entry: rowObj.day,
          employee_name: name,
          day: rowObj.day,
          start_time: rowObj.start_time || '',
          end_time: rowObj.end_time || '',
          role: roleValue,
        });
      } else {
        shiftDate = dateToString(weekDates[dayIndex]);
      }
    }

    if (!shiftDate) {
      errors.push({ row: i + 1, reason: 'invalid date', entry: dateValue });
      continue;
    }

    if (isUnavailableToken(rowObj.start_time) || isUnavailableToken(rowObj.end_time)) {
      skippedUnavailable += 1;
      continue;
    }

    const start = parseTime(rowObj.start_time ?? '');
    const end = parseTime(rowObj.end_time ?? '');
    if (!start || !end) {
      errors.push({
        row: i + 1,
        reason: 'invalid time',
        entry: `${rowObj.start_time} ${rowObj.end_time}`,
        employee_name: name,
        day: rowObj.day || '',
        start_time: rowObj.start_time || '',
        end_time: rowObj.end_time || '',
        role: roleValue,
      });
      continue;
    }

    shifts.push({
      employee_name: name,
      day: rowObj.day || '',
      organization_id: orgId,
      user_id: user.id,
      shift_date: shiftDate,
      start_time: start,
      end_time: end,
      position: roleValue || null,
      job: roleValue || null,
      notes: rowObj.notes || null,
      status: 'scheduled',
      break_minutes: null,
      is_marketplace: false,
      is_blocked: rowObj.is_blocked ? rowObj.is_blocked.toLowerCase() === 'true' : false,
      pay_rate: user.hourly_rate ?? user.hourly_pay ?? (user.job_pay?.[rowObj.job] ?? 0),
      pay_source: 'import',
      pay_effective_at: new Date().toISOString(),
    });
  }

  if (dryRun) {
    console.log('DRY RUN: Preview (first 25)');
    shifts.slice(0, 25).forEach((shift) => {
      console.log(
        `${shift.employee_name} | ${shift.day || shift.shift_date} | ${shift.start_time}-${shift.end_time} | ${shift.job ?? ''} | user=${shift.user_id}`
      );
    });
  } else if (shifts.length > 0) {
    const payload = shifts.map((shift) => {
      const row = { ...shift };
      delete row.employee_name;
      delete row.day;
      return row;
    });
    const batches = [];
    for (let i = 0; i < payload.length; i += 50) batches.push(payload.slice(i, i + 50));
    for (const batch of batches) {
      const { error } = await supabase.from('shifts').insert(batch);
      if (error) {
        console.error('Insert failed:', error.message);
        process.exit(1);
      }
    }
  }

  console.log('Summary');
  console.log(`  parsed_shifts: ${shifts.length}`);
  console.log(`  inserted_shifts: ${dryRun ? 0 : shifts.length}`);
  console.log(`  skipped_unavailable: ${skippedUnavailable}`);
  console.log(`  skipped_header_rows: ${skippedHeaderRows}`);
  console.log(`  unmatched_users_count: ${unmatched.length}`);
  console.log(`  errors_count: ${errors.length}`);
  if (errors.length > 0) {
    console.log('  errors (first 20):');
    errors.slice(0, 20).forEach((entry) => {
      console.log(
        `    - row ${entry.row} | ${entry.employee_name || ''} | ${entry.day || ''} | ${entry.start_time || ''}-${entry.end_time || ''} | ${entry.role || ''} | ${entry.reason}`
      );
    });
  }
  unmatched.slice(0, 15).forEach((entry) => {
    console.log(`  unmatched: ${entry.name} ${entry.email} row ${entry.row}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
