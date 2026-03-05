import { createHash } from 'crypto';

export type HashableShift = {
  user_id?: string | null;
  userId?: string | null;
  start?: string | number | Date | null;
  start_time?: string | number | Date | null;
  startTime?: string | number | Date | null;
  end?: string | number | Date | null;
  end_time?: string | number | Date | null;
  endTime?: string | number | Date | null;
  job?: string | null;
  location_id?: string | null;
  locationId?: string | null;
  notes?: string | null;
};

function normalizeValue(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  return String(value);
}

export function hashShift(shift: HashableShift): string {
  const userId = normalizeValue(shift.user_id ?? shift.userId ?? null);
  const start = normalizeValue(shift.start ?? shift.start_time ?? shift.startTime ?? null);
  const end = normalizeValue(shift.end ?? shift.end_time ?? shift.endTime ?? null);
  const job = normalizeValue(shift.job ?? null);
  const locationId = normalizeValue(shift.location_id ?? shift.locationId ?? null);
  const notes = normalizeValue(shift.notes ?? null);
  const payload = `${userId}|${start}|${end}|${job}|${locationId}|${notes}`;

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

