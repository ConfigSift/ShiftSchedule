import { HOURS_START, TOTAL_HOURS, type WeekStartDay } from '../types';

export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'pm' : 'am';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  
  if (m === 0) {
    return `${displayHour}${period}`;
  }
  return `${displayHour}:${m.toString().padStart(2, '0')}${period}`;
}

export function formatHourShort(hour: number): string {
  const h = Math.floor(hour);
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  if (h > 12) return `${h - 12}p`;
  return `${h}a`;
}

export function formatShiftDuration(startHour: number, endHour: number): string {
  const duration = endHour - startHour;
  const hours = Math.floor(duration);
  const minutes = Math.round((duration - hours) * 60);
  
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function getShiftPosition(startHour: number, endHour: number): { left: string; width: string } {
  const left = ((startHour - HOURS_START) / TOTAL_HOURS) * 100;
  const width = ((endHour - startHour) / TOTAL_HOURS) * 100;
  
  return {
    left: `${left}%`,
    width: `${width}%`,
  };
}

export function formatDateHeader(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateRange(startDate: Date, endDate: Date): string {
  const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const year = endDate.getFullYear();
  
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

export function getWeekStart(date: Date, weekStartDay: WeekStartDay = 'sunday'): Date {
  const start = new Date(date);
  const weekStartsOn = weekStartDay === 'monday' ? 1 : 0;
  const day = start.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getWeekDates(baseDate: Date, weekStartDay: WeekStartDay = 'sunday'): Date[] {
  const dates: Date[] = [];
  const start = getWeekStart(baseDate, weekStartDay);

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }

  return dates;
}

export function getWeekRange(baseDate: Date, weekStartDay: WeekStartDay = 'sunday') {
  const start = getWeekStart(baseDate, weekStartDay);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function getWeekdayHeaders(weekStartDay: WeekStartDay = 'sunday') {
  const full = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const short = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  if (weekStartDay === 'sunday') {
    return { full, short };
  }
  const shiftedFull = [...full.slice(1), full[0]];
  const shiftedShort = [...short.slice(1), short[0]];
  return { full: shiftedFull, short: shiftedShort };
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function dateToString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// PIN Hashing using Web Crypto API
// Password hashing using Web Crypto API (client-side only)
// Check if date ranges overlap
export function datesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 <= end2 && end1 >= start2;
}

// Check if time ranges overlap on same day
export function shiftsOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  return start1 < end2 && end1 > start2;
}

export function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
  options?: { excludeId?: string; compareId?: string }
): boolean {
  const excludeId = options?.excludeId != null ? String(options.excludeId) : null;
  const compareId = options?.compareId != null ? String(options.compareId) : null;
  // Avoid self-overlap when editing an existing shift.
  if (excludeId && compareId && excludeId === compareId) return false;
  const toRanges = (start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    if (start === end) return [];
    if (end > start) {
      return [{ start, end }];
    }
    return [
      { start, end: 24 },
      { start: 0, end },
    ];
  };

  const ranges1 = toRanges(start1, end1);
  const ranges2 = toRanges(start2, end2);
  return ranges1.some((a) => ranges2.some((b) => a.start < b.end && a.end > b.start));
}

// Generate unique ID
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
