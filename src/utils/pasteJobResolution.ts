type EmployeeJobsSource = {
  id: string;
  jobs?: string[] | null;
};

export type PasteJobOption = {
  name: string;
};

export type PasteJobResolution =
  | { mode: 'auto'; job: string }
  | { mode: 'pick'; options: PasteJobOption[] }
  | { mode: 'fallback'; job: string };

function normalizeJobName(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeJobList(jobs: unknown): string[] {
  if (!Array.isArray(jobs)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of jobs) {
    const job = normalizeJobName(item);
    if (!job || seen.has(job)) continue;
    seen.add(job);
    normalized.push(job);
  }
  return normalized;
}

export function getTargetEmployeeJobs(
  targetUserId: string,
  employees: EmployeeJobsSource[],
): PasteJobOption[] {
  const employee = employees.find((row) => String(row.id) === String(targetUserId));
  return normalizeJobList(employee?.jobs).map((name) => ({ name }));
}

type ResolvePasteJobInput = {
  targetUserId: string;
  sourceUserId?: string | null;
  copiedJob: string;
  employees: EmployeeJobsSource[];
};

export function resolvePasteJob(input: ResolvePasteJobInput): PasteJobResolution {
  const copiedJob = normalizeJobName(input.copiedJob);
  const targetUserId = String(input.targetUserId ?? '').trim();
  const sourceUserId = String(input.sourceUserId ?? '').trim();

  if (targetUserId && sourceUserId && targetUserId === sourceUserId) {
    return { mode: 'auto', job: copiedJob };
  }

  const options = getTargetEmployeeJobs(targetUserId, input.employees);
  if (options.length === 1) {
    return { mode: 'auto', job: options[0].name };
  }
  if (options.length > 1) {
    return { mode: 'pick', options };
  }
  return { mode: 'fallback', job: copiedJob };
}
