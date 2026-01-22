import { JOB_OPTIONS } from '../types';

export type JobsStorageType = 'array' | 'json' | 'text' | 'unknown' | 'empty';

export function normalizeJobs(value: unknown): string[] {
  if (!value) return [];

  let items: unknown = value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      items = parsed;
    } catch {
      items = trimmed.split(',').map((job) => job.trim()).filter(Boolean);
    }
  }

  if (Array.isArray(items)) {
    return items
      .map((job) => String(job).trim())
      .filter((job) => JOB_OPTIONS.includes(job as (typeof JOB_OPTIONS)[number]));
  }

  if (typeof items === 'object' && items && 'jobs' in (items as Record<string, unknown>)) {
    return normalizeJobs((items as Record<string, unknown>).jobs);
  }

  return [];
}

export function getJobsStorageType(value: unknown): JobsStorageType {
  if (value === null || value === undefined) return 'empty';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'text';
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? 'json' : 'text';
    } catch {
      return 'text';
    }
  }
  return 'unknown';
}

export function serializeJobsForStorage(originalValue: unknown, jobs: string[]) {
  if (Array.isArray(originalValue)) return jobs;
  if (typeof originalValue === 'string') {
    const trimmed = originalValue.trim();
    if (trimmed.startsWith('[')) {
      return JSON.stringify(jobs);
    }
    return jobs.join(', ');
  }
  return jobs;
}
