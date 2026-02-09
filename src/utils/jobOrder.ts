const REPORT_JOB_ORDER = [
  'manager',
  'host',
  'bartender',
  'server',
  'busser',
  'cook',
  'dishwasher',
];

function normalizeJobLabel(job?: string | null): string {
  if (!job) return '';
  const raw = job.trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('manager')) return 'manager';
  if (raw.includes('host')) return 'host';
  if (raw.includes('bartend')) return 'bartender';
  if (raw.includes('server')) return 'server';
  if (raw.includes('busser')) return 'busser';
  if (raw.includes('dish')) return 'dishwasher';
  if (raw.includes('cook') || raw.includes('kitchen')) return 'cook';
  if (raw.endsWith('s') && raw.length > 1) {
    return raw.slice(0, -1);
  }
  return raw;
}

export function getJobRank(job?: string | null): number {
  const normalized = normalizeJobLabel(job);
  const idx = REPORT_JOB_ORDER.indexOf(normalized);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export function compareJobs(a?: string | null, b?: string | null): number {
  const rankA = getJobRank(a);
  const rankB = getJobRank(b);
  if (rankA !== rankB) return rankA - rankB;
  const labelA = normalizeJobLabel(a) || String(a ?? '');
  const labelB = normalizeJobLabel(b) || String(b ?? '');
  const byLabel = labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
  if (byLabel !== 0) return byLabel;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
}
