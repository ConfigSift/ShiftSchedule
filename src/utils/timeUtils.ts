import { HOURS_START, HOURS_END, TOTAL_HOURS } from '../types';

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

export function getHourFromPosition(position: number, containerWidth: number): number {
  const percentage = position / containerWidth;
  const hour = HOURS_START + (percentage * TOTAL_HOURS);
  // Round to nearest 15 minutes (0.25 hours)
  return Math.round(hour * 4) / 4;
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

export function getWeekDates(baseDate: Date): Date[] {
  const dates: Date[] = [];
  const start = new Date(baseDate);
  start.setDate(start.getDate() - start.getDay()); // Start from Sunday
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }
  
  return dates;
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

export function formatDateLong(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
