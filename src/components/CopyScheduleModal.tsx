'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/apiClient';
import { dateToString, formatDateRange, getWeekDates, formatDateLong } from '../utils/timeUtils';
import { getUserRole, isManagerRole } from '../utils/role';

type CopyMode = 'nextDay' | 'nextWeek' | 'weeksAhead' | 'dateRange';

type CopySummary = {
  created_count: number;
  skipped_overlap_count: number;
  skipped_blocked_count: number;
  skipped_duplicate_count: number;
  skipped?: Array<{
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    job?: string | null;
    reason: string;
  }>;
};

export function CopyScheduleModal() {
  const {
    modalType,
    closeModal,
    selectedDate,
    showToast,
    loadRestaurantData,
    scheduleViewSettings,
    scheduleMode,
  } = useScheduleStore();
  const { currentUser, activeRestaurantId } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const isOpen = modalType === 'copySchedule';

  const [mode, setMode] = useState<CopyMode>('nextWeek');
  const [weeksAhead, setWeeksAhead] = useState(1);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [allowOverride, setAllowOverride] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summary, setSummary] = useState<CopySummary | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';
  const weekDates = useMemo(() => getWeekDates(selectedDate, weekStartDay), [selectedDate, weekStartDay]);
  const sourceWeekStart = dateToString(weekDates[0]);
  const sourceWeekEnd = dateToString(weekDates[6]);
  const sourceDay = dateToString(selectedDate);
  const dateLabel = formatDateRange(weekDates[0], weekDates[6]);
  const dayLabel = formatDateLong(sourceDay);

  useEffect(() => {
    if (!isOpen) return;
    const nextWeekStart = new Date(weekDates[0]);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextStartStr = dateToString(nextWeekStart);
    const nextEnd = new Date(nextWeekStart);
    nextEnd.setDate(nextEnd.getDate() + 6);
    const nextEndStr = dateToString(nextEnd);
    setMode('nextWeek');
    setWeeksAhead(1);
    setRangeStart(nextStartStr);
    setRangeEnd(nextEndStr);
    setAllowOverride(false);
    setSummary(null);
    setShowSkipped(false);
  }, [isOpen, weekDates]);

  const buildPayload = (targetMode: CopyMode) => {
    const sourceScheduleState: 'draft' | 'published' = scheduleMode === 'draft' ? 'draft' : 'published';
    const payload: Record<string, any> = {
      sourceWeekStart,
      sourceWeekEnd,
      mode: targetMode,
      allowOverrideBlocked: allowOverride,
      sourceScheduleState,
      targetScheduleState: 'draft',
    };
    if (targetMode === 'nextDay') {
      payload.sourceDay = sourceDay;
    }
    if (targetMode === 'weeksAhead') {
      payload.weeksAhead = weeksAhead;
    }
    if (targetMode === 'dateRange') {
      payload.targetStartWeek = rangeStart;
      payload.targetEndWeek = rangeEnd;
    }
    return payload;
  };

  const runCopy = async (targetMode: CopyMode, options?: { closeOnSuccess?: boolean }) => {
    if (!isManager || !activeRestaurantId) return;
    setMode(targetMode);
    setIsSubmitting(true);
    setSummary(null);
    setShowSkipped(false);

    const payload = buildPayload(targetMode);
    const result = await apiFetch<CopySummary>('/api/shifts/copy', {
      method: 'POST',
      json: payload,
    });

    if (!result.ok || !result.data) {
      showToast(result.error || 'Unable to copy schedule', 'error');
      setIsSubmitting(false);
      return;
    }

    setSummary(result.data);
    showToast(
      `Copied ${result.data.created_count} shifts (skipped ${result.data.skipped_overlap_count + result.data.skipped_blocked_count + result.data.skipped_duplicate_count}).`,
      'success'
    );
    await loadRestaurantData(activeRestaurantId);
    setIsSubmitting(false);
    if (options?.closeOnSuccess) {
      closeModal();
    }
  };

  const handleConfirm = () => runCopy(mode);

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Copy Schedule" size="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-theme-primary bg-theme-tertiary p-3 text-sm text-theme-secondary">
          <div>
            <span className="text-theme-muted">Source week:</span> {dateLabel}
          </div>
          <div>
            <span className="text-theme-muted">Source day:</span> {dayLabel}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-theme-primary bg-theme-secondary p-4">
            <h3 className="text-sm font-semibold text-theme-primary mb-3">Quick action</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => runCopy('nextDay', { closeOnSuccess: true })}
                disabled={isSubmitting}
                className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mode === 'nextDay'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Copy to next day (current day only)
              </button>
              <button
                type="button"
                onClick={() => runCopy('nextWeek', { closeOnSuccess: true })}
                disabled={isSubmitting}
                className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mode === 'nextWeek'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Copy current week schedule to next week
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-theme-primary bg-theme-secondary p-4 space-y-4">
            <h3 className="text-sm font-semibold text-theme-primary">Advanced</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-theme-secondary">
                <input
                  type="radio"
                  checked={mode === 'weeksAhead'}
                  onChange={() => setMode('weeksAhead')}
                  className="accent-amber-500"
                />
                Copy to N weeks ahead (1-8)
              </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={weeksAhead}
                  onChange={(e) => setWeeksAhead(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
                disabled={mode !== 'weeksAhead'}
                />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-theme-secondary">
                <input
                  type="radio"
                  checked={mode === 'dateRange'}
                  onChange={() => setMode('dateRange')}
                  className="accent-amber-500"
                />
                Copy to date range (week start - week end)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
                  disabled={mode !== 'dateRange'}
                />
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
                  disabled={mode !== 'dateRange'}
                />
              </div>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-theme-secondary">
          <input
            type="checkbox"
            checked={allowOverride}
            onChange={(e) => setAllowOverride(e.target.checked)}
            className="accent-amber-500"
          />
          Allow override on blocked/blackout days
        </label>

        {summary && (
          <div className="rounded-xl border border-theme-primary bg-theme-secondary p-4 space-y-3">
            <h3 className="text-sm font-semibold text-theme-primary">Copy summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm text-theme-secondary">
              <div>Created: <span className="text-emerald-400 font-semibold">{summary.created_count}</span></div>
              <div>Skipped overlaps: <span className="text-amber-400 font-semibold">{summary.skipped_overlap_count}</span></div>
              <div>Skipped blocked: <span className="text-amber-400 font-semibold">{summary.skipped_blocked_count}</span></div>
              <div>Skipped duplicates: <span className="text-amber-400 font-semibold">{summary.skipped_duplicate_count}</span></div>
            </div>
            {summary.skipped && summary.skipped.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowSkipped((prev) => !prev)}
                  className="text-xs text-amber-400 hover:text-amber-300"
                >
                  {showSkipped ? 'Hide skipped details' : 'Show skipped details'}
                </button>
                {showSkipped && (
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs text-theme-muted space-y-1">
                    {summary.skipped.map((item, index) => (
                      <div key={`${item.employeeId}-${item.date}-${index}`}>
                        {item.date} • {item.employeeId} • {item.startTime}-{item.endTime} • {item.job || 'No job'} • {item.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isManager || isSubmitting}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-sm font-semibold disabled:opacity-50"
          >
            {isSubmitting ? 'Copying...' : 'Copy Schedule'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
