#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const JOB_OPTIONS = [
  'Admin',
  'Bartender',
  'Bartender Training',
  'BOH Train',
  'Busser',
  'Cook',
  'Dishwasher',
  'FOH Train',
  'Food Run',
  'Food Runner',
  'Ghost Bar1',
  'Ghost Bar 2',
  'Host',
  'Manager',
  'Server',
  'Server Training',
];

function usage() {
  console.log(
    'Usage: node scripts/import-staff-csv.mjs "<CSV_PATH>" --org=<ORG_ID> [--dry-run]'
  );
}

function parseArgs(argv) {
  const args = { csvPath: '', orgId: '', dryRun: false, limit: null };
  const parts = argv.slice(2);
  if (parts.length === 0) return args;
  args.csvPath = parts[0];
  for (const part of parts.slice(1)) {
    if (part === '--dry-run') args.dryRun = true;
    if (part.startsWith('--org=')) args.orgId = part.split('=')[1] ?? '';
    if (part.startsWith('--restaurant=')) args.orgId = part.split('=')[1] ?? '';
    if (part.startsWith('--limit=')) {
      const value = Number(part.split('=')[1]);
      if (Number.isFinite(value) && value > 0) args.limit = value;
    }
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function splitFullName(fullName) {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const lastName = parts.pop();
  const firstName = parts.join(' ');
  return { firstName, lastName };
}

function parseJobs(raw, warnings) {
  const text = raw.trim();
  if (!text || text === '-') return [];
  let jobsText = text;
  const match = text.match(/\(([^)]+)\)/);
  if (match) {
    jobsText = match[1];
  }
  const parts = jobsText
    .split(',')
    .map((job) => job.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const jobs = [];
  for (const job of parts.length > 0 ? parts : [jobsText.trim().replace(/\s+/g, ' ')]) {
    if (JOB_OPTIONS.includes(job)) {
      jobs.push(job);
    } else {
      warnings.push(`Unknown job "${job}" skipped`);
    }
  }
  const seen = new Set();
  const deduped = [];
  for (const job of jobs) {
    if (seen.has(job)) continue;
    seen.add(job);
    deduped.push(job);
  }
  return deduped;
}

function mapPermissionSet(raw) {
  const value = raw.trim().toLowerCase();
  if (value === 'manager') return 'MANAGER';
  if (value === 'employee') return 'EMPLOYEE';
  return 'EMPLOYEE';
}

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const { csvPath, orgId, dryRun, limit } = parseArgs(process.argv);
  if (!csvPath || !orgId) {
    usage();
    process.exit(1);
  }

  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`CSV not found: ${resolvedPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    console.error('CSV appears empty.');
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    name: header.indexOf('name'),
    phone: header.indexOf('phone'),
    email: header.indexOf('email'),
    schedules: header.indexOf('schedules'),
    jobs: header.indexOf('jobs'),
    permission: header.indexOf('permission set'),
  };

  if (idx.name === -1 || idx.email === -1 || idx.jobs === -1 || idx.permission === -1) {
    console.error('CSV missing required columns: Name, Email, Jobs, Permission Set');
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

  const { data: existingUsers, error: existingError } = await supabase
    .from('users')
    .select('email')
    .eq('organization_id', orgId);

  if (existingError) {
    console.error('Failed to fetch existing users:', existingError.message);
    process.exit(1);
  }

  const existingEmails = new Set(
    (existingUsers ?? [])
      .map((user) => (user.email ?? '').toLowerCase())
      .filter(Boolean)
  );

  const excludedName = 'marjan djelosevic';
  const preview = [];
  const toInsert = [];
  const skipped = [];
  const errors = [];
  const warnings = [];

  const maxRows = limit ? Math.min(lines.length - 1, limit) : lines.length - 1;
  for (let i = 1; i <= maxRows; i += 1) {
    const row = parseCsvLine(lines[i]);
    const name = normalizeName(row[idx.name] ?? '');
    const phone = (row[idx.phone] ?? '').trim();
    const emailRaw = row[idx.email] ?? '';
    const email = normalizeEmail(emailRaw);
    const permissionRaw = row[idx.permission] ?? '';
    const jobsRaw = row[idx.jobs] ?? '';

    if (!name) {
      errors.push({ row: i + 1, reason: 'missing name' });
      continue;
    }

    if (name.trim().toLowerCase() === excludedName) {
      skipped.push({ name, email: emailRaw, reason: 'excluded name' });
      continue;
    }

    if (!email || !isValidEmail(email)) {
      errors.push({ row: i + 1, name, email: emailRaw, reason: 'invalid email' });
      continue;
    }

    if (existingEmails.has(email)) {
      skipped.push({ name, email, reason: 'duplicate email' });
      continue;
    }

    const userWarnings = [];
    const jobs = parseJobs(jobsRaw, userWarnings);
    warnings.push(...userWarnings.map((message) => `${name}: ${message}`));

    const accountType = mapPermissionSet(permissionRaw);

    const { firstName, lastName } = splitFullName(name);
    const userPayload = {
      organization_id: orgId,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      email,
      role: accountType,
      jobs,
      job_pay: {},
      pin_code: '111111',
    };

    preview.push(userPayload);
    toInsert.push(userPayload);
    existingEmails.add(email);
  }

  if (dryRun) {
    console.log('DRY RUN: Preview (first 10)');
    preview.slice(0, 10).forEach((user) => {
      const fullName = `${user.first_name} ${user.last_name}`.trim();
      console.log(
        `${fullName} | ${user.email} | ${user.role} | ${user.jobs.join(', ')}`
      );
    });
    console.log(`DRY RUN: would create ${toInsert.length} users`);
  } else if (toInsert.length > 0) {
    const batches = chunk(toInsert, 50);
    let insertedCount = 0;
    for (const batch of batches) {
      const { error: insertError } = await supabase.from('users').insert(batch);
      if (insertError) {
        console.error('Insert failed:', insertError.message);
        process.exit(1);
      }
      insertedCount += batch.length;
    }
    console.log(`Inserted ${insertedCount} users`);
  }

  console.log('Summary');
  console.log(`  created: ${dryRun ? 0 : toInsert.length}`);
  console.log(`  skipped: ${skipped.length}`);
  skipped.forEach((entry) => {
    console.log(`    - ${entry.name} (${entry.email || 'no email'}): ${entry.reason}`);
  });
  console.log(`  errors: ${errors.length}`);
  errors.forEach((entry) => {
    const rowLabel = entry.row ? `row ${entry.row}` : entry.name ?? 'row';
    console.log(`    - ${rowLabel} (${entry.email ?? ''}): ${entry.reason}`);
  });
  console.log(`  warnings: ${warnings.length}`);
  warnings.slice(0, 20).forEach((message) => {
    console.log(`    - ${message}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
