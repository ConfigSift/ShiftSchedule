'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
} from 'lucide-react';
import { DemoProvider, useDemoContext } from '../../../demo/DemoProvider';
import { DemoHeader } from '../DemoHeader';
import { useScheduleStore } from '../../../store/scheduleStore';
import { useAuthStore } from '../../../store/authStore';
import { dateToString, getWeekDates } from '../../../utils/timeUtils';
import { DailyRosterReport } from '../../../components/reports/DailyRosterReport';
import { compareJobs, getPublishedShiftsForDate, getPublishedShiftsForWeek } from '../../../components/reports/report-utils';
import { getAppBase, getIsLocalhost } from '@/lib/routing/getBaseUrls';

type DemoReportView = 'roster' | 'weekly-summary';

type DemoReportsContentProps = {
  initialView?: 'roster' | 'timeline' | 'weekly';
  initialDate?: string;
};

function parseDateParam(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function mapInitialView(value?: 'roster' | 'timeline' | 'weekly'): DemoReportView {
  if (value === 'weekly') return 'weekly-summary';
  return 'roster';
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatWeekNav(start: Date, end: Date): string {
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} - ${endLabel}`;
}

function WeeklySummaryReport({
  startDate,
  endDate,
  restaurantName,
  roleRows,
  totalHours,
  totalLabor,
  totalShifts,
}: {
  startDate: Date;
  endDate: Date;
  restaurantName: string;
  roleRows: Array<{ role: string; shifts: number; hours: number; labor: number }>;
  totalHours: number;
  totalLabor: number;
  totalShifts: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Weekly Summary</h2>
          <p className="text-sm text-zinc-500">
            {restaurantName} · {formatWeekNav(startDate, endDate)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div className="rounded-lg bg-zinc-100 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Shifts</p>
            <p className="text-sm font-semibold text-zinc-900">{totalShifts}</p>
          </div>
          <div className="rounded-lg bg-zinc-100 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Hours</p>
            <p className="text-sm font-semibold text-zinc-900">{totalHours.toFixed(1)}h</p>
          </div>
          <div className="rounded-lg bg-zinc-100 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Est. Labor</p>
            <p className="text-sm font-semibold text-zinc-900">${Math.round(totalLabor)}</p>
          </div>
        </div>
      </div>

      {roleRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
          No published shifts in this week.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-zinc-600">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Role</th>
                <th className="px-4 py-2 text-right font-semibold">Shifts</th>
                <th className="px-4 py-2 text-right font-semibold">Hours</th>
                <th className="px-4 py-2 text-right font-semibold">Est. Labor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {roleRows.map((row) => (
                <tr key={row.role}>
                  <td className="px-4 py-2 text-zinc-800">{row.role}</td>
                  <td className="px-4 py-2 text-right text-zinc-700">{row.shifts}</td>
                  <td className="px-4 py-2 text-right text-zinc-700">{row.hours.toFixed(1)}h</td>
                  <td className="px-4 py-2 text-right text-zinc-700">${Math.round(row.labor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DemoReportsInner({ initialView, initialDate }: DemoReportsContentProps) {
  const router = useRouter();
  const demo = useDemoContext();
  const { activeRestaurantId, accessibleRestaurants } = useAuthStore();
  const { employees, scheduleViewSettings, selectedDate, getShiftsForRestaurant } = useScheduleStore();

  const [activeReport, setActiveReport] = useState<DemoReportView>(mapInitialView(initialView));
  const [reportDate, setReportDate] = useState<Date>(parseDateParam(initialDate) ?? selectedDate);

  useEffect(() => {
    const parsed = parseDateParam(initialDate);
    if (parsed) setReportDate(parsed);
  }, [initialDate]);

  useEffect(() => {
    setActiveReport(mapInitialView(initialView));
  }, [initialView]);

  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';
  const weekDates = useMemo(() => getWeekDates(reportDate, weekStartDay), [reportDate, weekStartDay]);
  const weekStartYmd = dateToString(weekDates[0]);
  const weekEndYmd = dateToString(weekDates[6]);
  const dateYmd = dateToString(reportDate);
  const isWeekly = activeReport === 'weekly-summary';

  const restaurantName = useMemo(() => {
    return accessibleRestaurants.find((item) => item.id === activeRestaurantId)?.name ?? 'Restaurant';
  }, [accessibleRestaurants, activeRestaurantId]);

  const scopedEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive && employee.restaurantId === activeRestaurantId),
    [activeRestaurantId, employees],
  );

  const scopedShifts = useMemo(
    () => (activeRestaurantId ? getShiftsForRestaurant(activeRestaurantId) : []),
    [activeRestaurantId, getShiftsForRestaurant],
  );

  const dailyPublishedShifts = useMemo(
    () => getPublishedShiftsForDate(scopedShifts, dateYmd),
    [dateYmd, scopedShifts],
  );

  const weeklyPublishedShifts = useMemo(
    () => getPublishedShiftsForWeek(scopedShifts, weekStartYmd, weekEndYmd),
    [scopedShifts, weekEndYmd, weekStartYmd],
  );

  const employeeMap = useMemo(
    () => new Map(scopedEmployees.map((employee) => [employee.id, employee])),
    [scopedEmployees],
  );

  const weeklyRoleRows = useMemo(() => {
    const totals = new Map<string, { shifts: number; hours: number; labor: number }>();

    weeklyPublishedShifts.forEach((shift) => {
      const role = shift.job ?? 'Unassigned';
      const hours = Math.max(0, shift.endHour - shift.startHour);
      const employee = employeeMap.get(shift.employeeId);
      const rate =
        shift.payRate ??
        (shift.job && employee?.jobPay ? employee.jobPay[shift.job] : undefined) ??
        employee?.hourlyPay ??
        0;

      const current = totals.get(role) ?? { shifts: 0, hours: 0, labor: 0 };
      current.shifts += 1;
      current.hours += hours;
      current.labor += hours * rate;
      totals.set(role, current);
    });

    return Array.from(totals.entries())
      .map(([role, values]) => ({
        role,
        shifts: values.shifts,
        hours: values.hours,
        labor: values.labor,
      }))
      .sort((a, b) => compareJobs(a.role, b.role));
  }, [employeeMap, weeklyPublishedShifts]);

  const weeklyTotals = useMemo(() => {
    return weeklyRoleRows.reduce(
      (acc, row) => ({
        shifts: acc.shifts + row.shifts,
        hours: acc.hours + row.hours,
        labor: acc.labor + row.labor,
      }),
      { shifts: 0, hours: 0, labor: 0 },
    );
  }, [weeklyRoleRows]);

  const navLabel = isWeekly
    ? formatWeekNav(weekDates[0], weekDates[6])
    : formatShortDate(reportDate);

  const shiftDate = useCallback(
    (direction: 'prev' | 'next') => {
      setReportDate((current) => {
        const next = new Date(current);
        next.setDate(next.getDate() + (direction === 'next' ? 1 : -1) * (isWeekly ? 7 : 1));
        return next;
      });
    },
    [isWeekly],
  );

  const handleGetStartedClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (getIsLocalhost(window.location.host)) return;
    event.preventDefault();
    window.location.assign(`${getAppBase(window.location.origin)}/start`);
  }, []);

  return (
    <div className="h-[100dvh] flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
      <div className="shrink-0 bg-amber-500 text-zinc-900" data-analytics="demo_reports_viewed">
        <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-center justify-between gap-3">
          <p className="text-xs sm:text-sm font-medium truncate">
            You are exploring demo reports for <span className="font-bold">CrewShyft</span>
          </p>
          <Link
            href="/start"
            onClick={handleGetStartedClick}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg bg-zinc-900 text-amber-400 hover:bg-zinc-800 transition-colors text-xs sm:text-sm font-semibold"
            data-analytics="demo_reports_banner_cta"
          >
            Get Started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <DemoHeader />

      <main className="flex-1 min-h-0 overflow-auto bg-theme-timeline p-3 sm:p-4 lg:p-6">
        <div className="mx-auto w-full max-w-[1100px] rounded-2xl border border-theme-primary bg-theme-secondary">
          <div className="sticky top-0 z-10 rounded-t-2xl border-b border-theme-primary bg-theme-secondary px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => router.push('/demo')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <h2 className="text-base font-bold text-theme-primary">Demo Reports</h2>
                <div className="inline-flex items-center gap-1 rounded-full border border-theme-primary bg-theme-tertiary p-1">
                  <button
                    onClick={() => setActiveReport('roster')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      activeReport === 'roster'
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-theme-secondary hover:text-theme-primary'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Daily Roster
                  </button>
                  <button
                    onClick={() => setActiveReport('weekly-summary')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      activeReport === 'weekly-summary'
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-theme-secondary hover:text-theme-primary'
                    }`}
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Weekly Summary
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-theme-primary bg-theme-tertiary px-1 py-0.5">
                  <button
                    onClick={() => shiftDate('prev')}
                    className="p-1 rounded-full hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
                    aria-label={isWeekly ? 'Previous week' : 'Previous day'}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-theme-primary px-1.5 min-w-[120px] text-center">
                    {navLabel}
                  </span>
                  <button
                    onClick={() => shiftDate('next')}
                    className="p-1 rounded-full hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
                    aria-label={isWeekly ? 'Next week' : 'Next day'}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => demo?.intercept('export reports')}
                  className="btn-secondary px-3 py-1.5 rounded-full text-xs font-semibold"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Export
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-b-2xl bg-white px-5 py-6">
            {activeReport === 'roster' ? (
              <DailyRosterReport
                date={reportDate}
                restaurantName={restaurantName}
                employees={scopedEmployees}
                shifts={dailyPublishedShifts}
              />
            ) : (
              <WeeklySummaryReport
                startDate={weekDates[0]}
                endDate={weekDates[6]}
                restaurantName={restaurantName}
                roleRows={weeklyRoleRows}
                totalHours={weeklyTotals.hours}
                totalLabor={weeklyTotals.labor}
                totalShifts={weeklyTotals.shifts}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export function DemoReportsContent(props: DemoReportsContentProps) {
  return (
    <DemoProvider>
      <DemoReportsInner {...props} />
    </DemoProvider>
  );
}
