'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Printer,
  FileDown,
  ClipboardList,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import {
  getPublishedShiftsForDate,
  getPublishedShiftsForWeek,
  fetchPublishedShiftsForWeek,
  renderReportToWindow,
} from './report-utils';
import { getWeekDates } from '../../utils/timeUtils';
import type { Shift } from '../../types';
import { DailyRosterReport } from './DailyRosterReport';
import { DailyTimelineReport } from './DailyTimelineReport';
import { WeeklyScheduleReport } from './WeeklyScheduleReport';
import { wrapInHTMLDocument } from './print-styles';
import {
  generateDailyRosterHTML,
  generateDailyTimelineHTML,
  generateWeeklyScheduleHTML,
} from './report-html';
import { usePathname, useRouter } from 'next/navigation';
import { getAppHomeHref } from '../../lib/routing/getAppHomeHref';

type ReportType = 'roster' | 'timeline' | 'weekly';

const REPORT_OPTIONS: Array<{
  id: ReportType;
  label: string;
  description: string;
  icon: typeof ClipboardList;
}> = [
  {
    id: 'roster',
    label: 'Daily Roster',
    description: 'AM/PM split roster grouped by role',
    icon: ClipboardList,
  },
  {
    id: 'timeline',
    label: 'Daily Timeline',
    description: 'Visual Gantt-style shift chart',
    icon: BarChart3,
  },
  {
    id: 'weekly',
    label: 'Weekly Grid',
    description: 'Week-at-a-glance schedule grid',
    icon: CalendarDays,
  },
];

function toYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatWeekNav(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${s} \u2013 ${e}`;
}

function parseDateParam(value?: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

type ReportsPageContentProps = {
  initialView?: ReportType;
  initialDate?: string;
};

type ReportsToolbarProps = {
  activeReport: ReportType;
  onChangeReport: (report: ReportType) => void;
  navLabel: string;
  isWeekly: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onBack: () => void;
};

function ReportsToolbar({
  activeReport,
  onChangeReport,
  navLabel,
  isWeekly,
  onPrev,
  onNext,
  onPrint,
  onDownload,
  onBack,
}: ReportsToolbarProps) {
  return (
    <div className="reports-page-toolbar sticky top-0 z-20 border-b border-theme-primary bg-theme-secondary rounded-t-2xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs font-semibold"
            aria-label="Back to schedule"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h2 className="text-base font-bold text-theme-primary">Reports</h2>

          {/* Report type tabs */}
          <div className="inline-flex items-center gap-1 rounded-full border border-theme-primary bg-theme-tertiary p-1">
            {REPORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => onChangeReport(opt.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    activeReport === opt.id
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-theme-secondary hover:text-theme-primary'
                  }`}
                  title={opt.description}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date / week nav */}
          <div className="flex items-center gap-1 rounded-full border border-theme-primary bg-theme-tertiary px-1 py-0.5">
            <button
              onClick={onPrev}
              className="p-1 rounded-full hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
              aria-label={isWeekly ? 'Previous week' : 'Previous day'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-theme-primary px-1.5 min-w-[120px] text-center">
              {navLabel}
            </span>
            <button
              onClick={onNext}
              className="p-1 rounded-full hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
              aria-label={isWeekly ? 'Next week' : 'Next day'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Print button */}
          <button
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          <button
            onClick={onDownload}
            className="btn-secondary px-3 py-1.5 rounded-full text-xs font-semibold"
          >
            <FileDown className="w-3.5 h-3.5" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportsPageContent({ initialView, initialDate }: ReportsPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    selectedDate,
    shifts,
    employees,
    scheduleViewSettings,
    applyRestaurantScope,
    loadRestaurantData,
  } = useScheduleStore();
  const { activeRestaurantId, accessibleRestaurants } = useAuthStore();
  const [activeReport, setActiveReport] = useState<ReportType>(initialView ?? 'roster');
  const initialDateValue = useMemo(
    () => parseDateParam(initialDate) ?? selectedDate,
    [initialDate, selectedDate]
  );
  const [reportDate, setReportDate] = useState<Date>(initialDateValue);

  // Weekly report async state
  const [weeklyShifts, setWeeklyShifts] = useState<Shift[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const isDemoRoute = pathname?.startsWith('/demo') ?? false;

  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';

  useEffect(() => {
    applyRestaurantScope(activeRestaurantId);
    loadRestaurantData(activeRestaurantId);
  }, [activeRestaurantId, applyRestaurantScope, loadRestaurantData]);

  // Sync report date when query params change
  useEffect(() => {
    setReportDate(initialDateValue);
  }, [initialDateValue]);

  useEffect(() => {
    if (initialView) {
      setActiveReport(initialView);
    }
  }, [initialView]);

  const restaurantName = useMemo(() => {
    return accessibleRestaurants.find((r) => r.id === activeRestaurantId)?.name ?? 'Restaurant';
  }, [accessibleRestaurants, activeRestaurantId]);

  const dateString = useMemo(() => toYMD(reportDate), [reportDate]);

  // Week dates for the weekly report (also used for nav label)
  const weekDates = useMemo(
    () => getWeekDates(reportDate, weekStartDay),
    [reportDate, weekStartDay]
  );
  const weekStartYmd = useMemo(() => toYMD(weekDates[0]), [weekDates]);
  const weekEndYmd = useMemo(() => toYMD(weekDates[6]), [weekDates]);

  // Filter to published shifts for the selected date (daily reports)
  const publishedShifts = useMemo(
    () => getPublishedShiftsForDate(shifts, dateString),
    [shifts, dateString]
  );

  // All employees for the restaurant (active only)
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.isActive && e.restaurantId === activeRestaurantId),
    [employees, activeRestaurantId]
  );

  // Fetch weekly shifts from Supabase when weekly tab is active
  useEffect(() => {
    if (activeReport !== 'weekly' || !activeRestaurantId) return;

    if (isDemoRoute) {
      setWeeklyError(null);
      setWeeklyLoading(false);
      setWeeklyShifts(getPublishedShiftsForWeek(shifts, weekStartYmd, weekEndYmd));
      return;
    }

    let cancelled = false;
    setWeeklyLoading(true);
    setWeeklyError(null);

    fetchPublishedShiftsForWeek(activeRestaurantId, weekStartYmd, weekEndYmd).then(
      (result) => {
        if (cancelled) return;
        setWeeklyShifts(result.shifts);
        setWeeklyError(result.error);
        setWeeklyLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [activeReport, activeRestaurantId, isDemoRoute, shifts, weekStartYmd, weekEndYmd]);

  // Navigation – day-level for daily reports, week-level for weekly
  const isWeekly = activeReport === 'weekly';

  const handlePrev = useCallback(() => {
    setReportDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - (isWeekly ? 7 : 1));
      return next;
    });
  }, [isWeekly]);

  const handleNext = useCallback(() => {
    setReportDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (isWeekly ? 7 : 1));
      return next;
    });
  }, [isWeekly]);

  const buildReportHTML = useCallback(
    (titlePrefix?: string) => {
      const reportTitleMap: Record<ReportType, string> = {
        roster: 'Daily Roster',
        timeline: 'Daily Timeline',
        weekly: 'Weekly Schedule',
      };
      const reportTitle = reportTitleMap[activeReport];
      const dateLabel =
        activeReport === 'weekly'
          ? `${toYMD(weekDates[0])} to ${toYMD(weekDates[6])}`
          : toYMD(reportDate);
      const title = `${titlePrefix ? `${titlePrefix} ` : ''}${reportTitle} - ${dateLabel}`;
      const orientation: 'portrait' | 'landscape' =
        activeReport === 'roster' ? 'portrait' : 'landscape';

      let bodyHTML = '';
      if (activeReport === 'roster') {
        bodyHTML = generateDailyRosterHTML(reportDate, restaurantName, activeEmployees, publishedShifts);
      } else if (activeReport === 'timeline') {
        bodyHTML = generateDailyTimelineHTML(reportDate, restaurantName, activeEmployees, publishedShifts);
      } else {
        bodyHTML = generateWeeklyScheduleHTML(weekDates, restaurantName, activeEmployees, weeklyShifts, {
          loading: weeklyLoading,
          error: weeklyError,
        });
      }

      return { title, bodyHTML, orientation };
    },
    [
      activeReport,
      activeEmployees,
      publishedShifts,
      reportDate,
      restaurantName,
      weekDates,
      weeklyError,
      weeklyLoading,
      weeklyShifts,
    ]
  );

  const handlePrint = useCallback(() => {
    const { title, bodyHTML, orientation } = buildReportHTML();
    const html = wrapInHTMLDocument(bodyHTML, title, { orientation });
    renderReportToWindow(html, title);
  }, [buildReportHTML]);

  const handleDownloadPdf = useCallback(() => {
    const { title, bodyHTML, orientation } = buildReportHTML('CrewShyft');
    const html = wrapInHTMLDocument(bodyHTML, title, { orientation });
    renderReportToWindow(html, title);
  }, [buildReportHTML]);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(isDemoRoute ? '/demo' : getAppHomeHref());
  }, [isDemoRoute, router]);

  const navLabel = isWeekly
    ? formatWeekNav(weekDates[0], weekDates[6])
    : formatShortDate(reportDate);

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-theme-primary bg-theme-secondary">
        <ReportsToolbar
          activeReport={activeReport}
          onChangeReport={setActiveReport}
          navLabel={navLabel}
          isWeekly={isWeekly}
          onPrev={handlePrev}
          onNext={handleNext}
          onPrint={handlePrint}
          onDownload={handleDownloadPdf}
          onBack={handleBack}
        />

        <div className="reports-page-content bg-white px-5 py-6 rounded-b-2xl">
        {activeReport === 'roster' && (
          <DailyRosterReport
            date={reportDate}
            restaurantName={restaurantName}
            employees={activeEmployees}
            shifts={publishedShifts}
          />
        )}

        {activeReport === 'timeline' && (
          <DailyTimelineReport
            date={reportDate}
            restaurantName={restaurantName}
            employees={activeEmployees}
            shifts={publishedShifts}
          />
        )}

        {activeReport === 'weekly' && (
          <WeeklyScheduleReport
            weekDates={weekDates}
            restaurantName={restaurantName}
            employees={activeEmployees}
            shifts={weeklyShifts}
            loading={weeklyLoading}
            error={weeklyError}
          />
        )}
        </div>
      </div>
    </div>
  );
}
