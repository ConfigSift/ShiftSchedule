'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import { apiFetch } from '../../lib/apiClient';
import { ScheduleHourMode } from '../../types';

type HourRow = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  enabled: boolean;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MINUTES_PER_DAY = 24 * 60;
const MIN_RANGE_MINUTES = 30;
const GHOST_MINUTES = 60;
const HOUR_STEP_MINUTES = 60;
const RESIZE_STEP_MINUTES = 30;

const timeToMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  const hours = Number.isNaN(h) ? 0 : h;
  const minutes = Number.isNaN(m) ? 0 : m;
  return Math.max(0, Math.min(MINUTES_PER_DAY, hours * 60 + minutes));
};

const minutesToTimeString = (minutes: number) => {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const roundToStep = (minutes: number, step: number) => {
  return Math.round(minutes / step) * step;
};

const formatTimeLabel = (minutes: number) => {
  const total = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

export default function BusinessHoursPage() {
  const router = useRouter();
  const { businessHours, scheduleViewSettings, loadRestaurantData, showToast, setScheduleViewSettings } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, init } = useAuthStore();

  const [rows, setRows] = useState<HourRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [hoveredGhost, setHoveredGhost] = useState<{ dayOfWeek: number; startMinutes: number } | null>(null);
  const [ghostAnimating, setGhostAnimating] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ dayOfWeek: number; startMinutes: number } | null>(null);
  const [focusedDay, setFocusedDay] = useState<number | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const ghostTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<{
    dayOfWeek: number;
    edge: 'start' | 'end';
    startX: number;
    startMinutes: number;
    endMinutes: number;
    trackWidth: number;
  } | null>(null);
  const moveRef = useRef<{
    dayOfWeek: number;
    startX: number;
    startMinutes: number;
    endMinutes: number;
    trackWidth: number;
  } | null>(null);
  const [editorDraft, setEditorDraft] = useState<{ dayOfWeek: number; startMinutes: number; endMinutes: number } | null>(null);
  const [editorPosition, setEditorPosition] = useState<{ top: number; left: number } | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetDragRef = useRef<{ startY: number; currentY: number } | null>(null);

  // Schedule View Settings state
  const [hourMode, setHourMode] = useState<ScheduleHourMode>('full24');
  const [customStartHour, setCustomStartHour] = useState(6);
  const [customEndHour, setCustomEndHour] = useState(22);
  const [weekStartDay, setWeekStartDay] = useState<'sunday' | 'monday'>('sunday');
  const [savingViewSettings, setSavingViewSettings] = useState(false);
  const [savingWeekStart, setSavingWeekStart] = useState(false);
  const openEditor = (
    dayOfWeek: number,
    startMinutes: number,
    endMinutes: number,
    anchorRect?: DOMRect | null
  ) => {
    const start = Math.max(0, Math.min(MINUTES_PER_DAY - MIN_RANGE_MINUTES, startMinutes));
    const end = Math.max(start + MIN_RANGE_MINUTES, Math.min(MINUTES_PER_DAY, endMinutes));
    setEditorDraft({
      dayOfWeek,
      startMinutes: start,
      endMinutes: end,
    });
    if (anchorRect && typeof window !== 'undefined') {
      const width = 288;
      const height = 220;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchorRect.left));
      const top = Math.max(8, Math.min(window.innerHeight - height - 8, anchorRect.bottom + 8));
      setEditorPosition({ top, left });
    } else {
      setEditorPosition(null);
    }
  };

  const closeEditor = () => {
    setEditorDraft(null);
    setEditorPosition(null);
  };

  useEffect(() => {
    if (!editorDraft) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (editorRef.current && editorRef.current.contains(target)) return;
      if (sheetRef.current && sheetRef.current.contains(target)) return;
      closeEditor();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeEditor();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editorDraft]);

  const isManager = isManagerRole(getUserRole(currentUser?.role));

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!hoveredGhost) {
      setGhostAnimating(false);
      return;
    }
    setGhostAnimating(false);
    const id = requestAnimationFrame(() => setGhostAnimating(true));
    return () => cancelAnimationFrame(id);
  }, [hoveredGhost?.dayOfWeek, hoveredGhost?.startMinutes]);

  useEffect(() => {
    if (isInitialized && activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  }, [isInitialized, activeRestaurantId, loadRestaurantData]);

  useEffect(() => {
    if (isInitialized && (!currentUser || !isManager)) {
      router.push('/dashboard?notice=forbidden');
    }
  }, [isInitialized, currentUser, isManager, router]);

  useEffect(() => {
    const defaults: HourRow[] = Array.from({ length: 7 }, (_, day) => ({
      dayOfWeek: day,
      openTime: '09:00',
      closeTime: '17:00',
      enabled: true,
    }));
    if (businessHours.length === 0) {
      setRows(defaults);
      return;
    }
    const mapped = defaults.map((row) => {
      const existing = businessHours.find((h) => h.dayOfWeek === row.dayOfWeek);
      return {
        dayOfWeek: row.dayOfWeek,
        openTime: existing?.openTime?.slice(0, 5) ?? row.openTime,
        closeTime: existing?.closeTime?.slice(0, 5) ?? row.closeTime,
        enabled: existing?.enabled ?? row.enabled,
      };
    });
    setRows(mapped);
  }, [businessHours]);

  // Load schedule view settings
  useEffect(() => {
    if (scheduleViewSettings) {
      setHourMode(scheduleViewSettings.hourMode);
      setCustomStartHour(scheduleViewSettings.customStartHour);
      setCustomEndHour(scheduleViewSettings.customEndHour);
      setWeekStartDay(scheduleViewSettings.weekStartDay ?? 'sunday');
    } else {
      // Default values
      setHourMode('full24');
      setCustomStartHour(6);
      setCustomEndHour(22);
      setWeekStartDay('sunday');
    }
  }, [scheduleViewSettings]);

  const handleChange = (dayOfWeek: number, field: keyof HourRow, value: string | boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.dayOfWeek === dayOfWeek ? { ...row, [field]: value } : row
      )
    );
  };

  const setRowTimesMinutes = (dayOfWeek: number, startMinutes: number, endMinutes: number) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.dayOfWeek !== dayOfWeek) return row;
        let start = Math.max(0, Math.min(MINUTES_PER_DAY, startMinutes));
        let end = Math.max(0, Math.min(MINUTES_PER_DAY, endMinutes));
        if (end < start + MIN_RANGE_MINUTES) {
          end = Math.min(MINUTES_PER_DAY, start + MIN_RANGE_MINUTES);
        }
        if (end > MINUTES_PER_DAY) {
          end = MINUTES_PER_DAY;
        }
        if (start > end - MIN_RANGE_MINUTES) {
          start = Math.max(0, end - MIN_RANGE_MINUTES);
        }
        return {
          ...row,
          openTime: minutesToTimeString(start),
          closeTime: minutesToTimeString(end),
        };
      })
    );
  };

  const getPointerMinutes = (clientX: number, rect: DOMRect) => {
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * MINUTES_PER_DAY;
  };

  const getGhostStartMinutes = (
    clientX: number,
    rect: DOMRect,
    startMinutes: number,
    endMinutes: number,
    enabled: boolean
  ) => {
    const duration = GHOST_MINUTES;
    const pointerMinutes = getPointerMinutes(clientX, rect);
    const snappedHour = roundToStep(pointerMinutes, HOUR_STEP_MINUTES);
    if (!enabled) {
      return Math.max(0, Math.min(MINUTES_PER_DAY - duration, snappedHour));
    }
    const withinOpen = pointerMinutes >= startMinutes && pointerMinutes <= endMinutes;
    if (withinOpen) return null;
    if (pointerMinutes < startMinutes) {
      const maxStart = Math.max(0, startMinutes - duration);
      return Math.max(0, Math.min(maxStart, snappedHour));
    }
    const minStart = Math.min(MINUTES_PER_DAY - duration, endMinutes);
    return Math.max(minStart, Math.min(MINUTES_PER_DAY - duration, snappedHour));
  };

  const isOutsideRange = (startMinutes: number, endMinutes: number, ghostStart: number) => {
    const ghostEnd = ghostStart + GHOST_MINUTES;
    return ghostEnd <= startMinutes || ghostStart >= endMinutes;
  };

  const startResize = (
    e: React.PointerEvent,
    dayOfWeek: number,
    edge: 'start' | 'end',
    startMinutes: number,
    endMinutes: number
  ) => {
    const track = (e.currentTarget as HTMLElement).closest('[data-mini-track]') as HTMLElement | null;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    resizeRef.current = {
      dayOfWeek,
      edge,
      startX: e.clientX,
      startMinutes,
      endMinutes,
      trackWidth: rect.width,
    };
    setHoveredGhost(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const drag = resizeRef.current;
    const deltaMinutes = (e.clientX - drag.startX) / drag.trackWidth * MINUTES_PER_DAY;
    if (drag.edge === 'start') {
      const nextStart = roundToStep(drag.startMinutes + deltaMinutes, RESIZE_STEP_MINUTES);
      const clampedStart = Math.max(0, Math.min(drag.endMinutes - MIN_RANGE_MINUTES, nextStart));
      setRowTimesMinutes(drag.dayOfWeek, clampedStart, drag.endMinutes);
      return;
    }
    const nextEnd = roundToStep(drag.endMinutes + deltaMinutes, RESIZE_STEP_MINUTES);
    const clampedEnd = Math.max(drag.startMinutes + MIN_RANGE_MINUTES, Math.min(MINUTES_PER_DAY, nextEnd));
    setRowTimesMinutes(drag.dayOfWeek, drag.startMinutes, clampedEnd);
  };

  const handleResizeEnd = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
  };

  const startMove = (
    e: React.PointerEvent,
    dayOfWeek: number,
    startMinutes: number,
    endMinutes: number
  ) => {
    const track = (e.currentTarget as HTMLElement).closest('[data-mini-track]') as HTMLElement | null;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    moveRef.current = {
      dayOfWeek,
      startX: e.clientX,
      startMinutes,
      endMinutes,
      trackWidth: rect.width,
    };
    setHoveredGhost(null);
    setIsMoving(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!moveRef.current) return;
    const drag = moveRef.current;
    const deltaMinutes = (e.clientX - drag.startX) / drag.trackWidth * MINUTES_PER_DAY;
    const snappedDelta = roundToStep(deltaMinutes, RESIZE_STEP_MINUTES);
    const duration = drag.endMinutes - drag.startMinutes;
    let nextStart = drag.startMinutes + snappedDelta;
    let nextEnd = drag.endMinutes + snappedDelta;
    if (nextStart < 0) {
      nextStart = 0;
      nextEnd = duration;
    }
    if (nextEnd > MINUTES_PER_DAY) {
      nextEnd = MINUTES_PER_DAY;
      nextStart = MINUTES_PER_DAY - duration;
    }
    setRowTimesMinutes(drag.dayOfWeek, nextStart, nextEnd);
  };

  const handleMoveEnd = (e: React.PointerEvent) => {
    if (!moveRef.current) return;
    moveRef.current = null;
    setIsMoving(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
  };

  const applyInstantBusinessHour = (dayOfWeek: number, startMinutes: number, endMinutes: number) => {
    const start = Math.max(0, Math.min(MINUTES_PER_DAY - GHOST_MINUTES, startMinutes));
    const end = Math.max(start + GHOST_MINUTES, Math.min(MINUTES_PER_DAY, endMinutes));
    setRowTimesMinutes(dayOfWeek, start, end);
    handleChange(dayOfWeek, 'enabled', true);
  };

  const handleSave = async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first', 'error');
      if (process.env.NODE_ENV !== 'production') {
        console.error('[schedule-settings] save business hours failed', new Error('Missing active restaurant'));
      }
      return;
    }
    const payload = {
      organizationId: activeRestaurantId,
      hours: rows.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        openTime: row.enabled ? row.openTime : null,
        closeTime: row.enabled ? row.closeTime : null,
        enabled: row.enabled,
      })),
    };
    setSaving(true);
    try {
      const result = await apiFetch('/api/business-hours/save', {
        method: 'POST',
        json: payload,
      });

      if (!result.ok) {
        const statusLabel = result.status === 0 ? 'network' : result.status;
        const message = result.error ?? result.rawText?.slice(0, 120) ?? 'Unknown error';
        showToast(`Save failed (${statusLabel}): ${message}`, 'error');
        if (process.env.NODE_ENV !== 'production') {
          let safeData: string;
          try {
            safeData = JSON.stringify(result.data ?? null);
          } catch {
            safeData = '"[unserializable]"';
          }
          const debugPayload = {
            endpoint: '/api/business-hours/save',
            payload,
            status: result.status,
            error: result.error,
            rawText: result.rawText?.slice(0, 500),
            data: safeData,
          };
          console.error('[schedule-settings] save business hours failed', JSON.stringify(debugPayload, null, 2));
        }
        return;
      }

      await loadRestaurantData(activeRestaurantId);
      showToast('Business hours updated', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Save failed (network): ${message || 'Unknown error'}`, 'error');
      if (process.env.NODE_ENV !== 'production') {
        const debugPayload = {
          endpoint: '/api/business-hours/save',
          payload,
          status: 0,
          error: message,
          rawText: undefined,
          data: null,
        };
        console.error('[schedule-settings] save business hours failed', JSON.stringify(debugPayload, null, 2));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveViewSettings = async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first', 'error');
      if (process.env.NODE_ENV !== 'production') {
        console.error('[schedule-settings] save view settings failed', new Error('Missing active restaurant'));
      }
      return;
    }

    // Validate custom hours
    if (hourMode === 'custom' && customEndHour <= customStartHour) {
      showToast('End hour must be greater than start hour', 'error');
      return;
    }

    const payload = {
      organizationId: activeRestaurantId,
      hourMode,
      customStartHour,
      customEndHour,
    };
    setSavingViewSettings(true);
    try {
      const result = await apiFetch<{ settings: Record<string, any> }>('/api/schedule-view-settings/save', {
        method: 'POST',
        json: payload,
      });

      if (!result.ok) {
        const statusLabel = result.status === 0 ? 'network' : result.status;
        const message = result.error ?? result.rawText?.slice(0, 120) ?? 'Unknown error';
        showToast(`Save failed (${statusLabel}): ${message}`, 'error');
        if (process.env.NODE_ENV !== 'production') {
          let safeData: string;
          try {
            safeData = JSON.stringify(result.data ?? null);
          } catch {
            safeData = '"[unserializable]"';
          }
          const debugPayload = {
            endpoint: '/api/schedule-view-settings/save',
            payload,
            status: result.status,
            error: result.error,
            rawText: result.rawText?.slice(0, 500),
            data: safeData,
          };
          console.error('[schedule-settings] save view settings failed', JSON.stringify(debugPayload, null, 2));
        }
        return;
      }

      // Update the store with new settings
      if (result.data?.settings) {
        const s = result.data.settings;
        setScheduleViewSettings({
          id: s.id,
          organizationId: s.organization_id,
          hourMode: s.hour_mode as ScheduleHourMode,
          customStartHour: Number(s.custom_start_hour ?? 0),
          customEndHour: Number(s.custom_end_hour ?? 24),
          weekStartDay: s.week_start_day === 'monday' ? 'monday' : 'sunday',
        });
      }

      showToast('Schedule view settings updated', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Save failed (network): ${message || 'Unknown error'}`, 'error');
      if (process.env.NODE_ENV !== 'production') {
        const debugPayload = {
          endpoint: '/api/schedule-view-settings/save',
          payload,
          status: 0,
          error: message,
          rawText: undefined,
          data: null,
        };
        console.error('[schedule-settings] save view settings failed', JSON.stringify(debugPayload, null, 2));
      }
    } finally {
      setSavingViewSettings(false);
    }
  };

  const handleSaveWeekStart = async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first', 'error');
      if (process.env.NODE_ENV !== 'production') {
        console.error('[schedule-settings] save week start failed', new Error('Missing active restaurant'));
      }
      return;
    }

    const payload = {
      organizationId: activeRestaurantId,
      weekStartDay,
    };

    setSavingWeekStart(true);
    try {
      const result = await apiFetch<{ settings: Record<string, any> }>('/api/schedule-view-settings/save', {
        method: 'POST',
        json: payload,
      });

      if (!result.ok) {
        const statusLabel = result.status === 0 ? 'network' : result.status;
        const message = result.error ?? result.rawText?.slice(0, 120) ?? 'Unknown error';
        showToast(`Save failed (${statusLabel}): ${message}`, 'error');
        if (process.env.NODE_ENV !== 'production') {
          let safeData: string;
          try {
            safeData = JSON.stringify(result.data ?? null);
          } catch {
            safeData = '"[unserializable]"';
          }
          const debugPayload = {
            endpoint: '/api/schedule-view-settings/save',
            payload,
            status: result.status,
            error: result.error,
            rawText: result.rawText?.slice(0, 500),
            data: safeData,
          };
          console.error('[schedule-settings] save week start failed', JSON.stringify(debugPayload, null, 2));
        }
        return;
      }

      if (result.data?.settings) {
        const s = result.data.settings;
        setScheduleViewSettings({
          id: s.id,
          organizationId: s.organization_id,
          hourMode: s.hour_mode as ScheduleHourMode,
          customStartHour: Number(s.custom_start_hour ?? 0),
          customEndHour: Number(s.custom_end_hour ?? 24),
          weekStartDay: s.week_start_day === 'monday' ? 'monday' : 'sunday',
        });
      }

      showToast('Start of week updated', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Save failed (network): ${message || 'Unknown error'}`, 'error');
      if (process.env.NODE_ENV !== 'production') {
        const debugPayload = {
          endpoint: '/api/schedule-view-settings/save',
          payload,
          status: 0,
          error: message,
          rawText: undefined,
          data: null,
        };
        console.error('[schedule-settings] save week start failed', JSON.stringify(debugPayload, null, 2));
      }
    } finally {
      setSavingWeekStart(false);
    }
  };

  const orderedRows =
    rows.length === 7
      ? [1, 2, 3, 4, 5, 6, 0]
          .map((day) => rows.find((row) => row.dayOfWeek === day))
          .filter((row): row is HourRow => Boolean(row))
      : rows;

  if (!isInitialized || !currentUser || !isManager) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Schedule Settings</h1>
          <p className="text-theme-tertiary mt-1">
            Configure business hours and schedule view preferences.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Schedule View Hours Section */}
          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-3 space-y-2.5">
            <div>
              <h2 className="text-lg font-semibold text-theme-primary">Schedule View Hours</h2>
              <p className="text-xs text-theme-tertiary mt-0.5">
                Choose which hours to display on the schedule timeline.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-start gap-2 p-1.5 bg-theme-tertiary border border-theme-primary rounded-lg cursor-pointer hover:bg-theme-hover transition-colors">
                <input
                  type="radio"
                  name="hourMode"
                  value="full24"
                  checked={hourMode === 'full24'}
                  onChange={() => setHourMode('full24')}
                  className="accent-amber-500 mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-theme-primary">Full 24 Hours</span>
                  <p className="text-[11px] text-theme-muted leading-tight">00:00-24:00</p>
                </div>
              </label>

              <label className="flex items-start gap-2 p-1.5 bg-theme-tertiary border border-theme-primary rounded-lg cursor-pointer hover:bg-theme-hover transition-colors">
                <input
                  type="radio"
                  name="hourMode"
                  value="business"
                  checked={hourMode === 'business'}
                  onChange={() => setHourMode('business')}
                  className="accent-amber-500 mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-theme-primary">Business Hours</span>
                  <p className="text-[11px] text-theme-muted leading-tight">Business hours + 3h padding</p>
                </div>
              </label>

              <label className="flex items-start gap-2 p-1.5 bg-theme-tertiary border border-theme-primary rounded-lg cursor-pointer hover:bg-theme-hover transition-colors">
                <input
                  type="radio"
                  name="hourMode"
                  value="custom"
                  checked={hourMode === 'custom'}
                  onChange={() => setHourMode('custom')}
                  className="accent-amber-500 mt-0.5"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-theme-primary">Custom Range</span>
                  <p className="text-[11px] text-theme-muted mb-0.5 leading-tight">Specify a custom hour range</p>
                  {hourMode === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-1.5 mt-1">
                      <select
                        value={customStartHour}
                        onChange={(e) => setCustomStartHour(Number(e.target.value))}
                        className="px-2 py-0.5 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-theme-muted text-center">to</span>
                      <select
                        value={customEndHour}
                        onChange={(e) => setCustomEndHour(Number(e.target.value))}
                        className="px-2 py-0.5 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                      >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                          <option key={h} value={h}>
                            {h === 24 ? '12am (next day)' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveViewSettings}
                disabled={savingViewSettings}
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {savingViewSettings ? 'Saving...' : 'Save View Settings'}
              </button>
            </div>
          </div>

          {/* Start of Week Section */}
          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-3 space-y-2.5">
            <div>
              <h2 className="text-lg font-semibold text-theme-primary">Start of Week</h2>
              <p className="text-xs text-theme-tertiary mt-0.5">
                Set which day your schedule week begins.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWeekStartDay('sunday')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  weekStartDay === 'sunday'
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                    : 'bg-theme-tertiary text-theme-secondary border-theme-primary hover:bg-theme-hover'
                }`}
              >
                Sunday
              </button>
              <button
                type="button"
                onClick={() => setWeekStartDay('monday')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  weekStartDay === 'monday'
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                    : 'bg-theme-tertiary text-theme-secondary border-theme-primary hover:bg-theme-hover'
                }`}
              >
                Monday
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveWeekStart}
                disabled={savingWeekStart}
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {savingWeekStart ? 'Saving...' : 'Save Start of Week'}
              </button>
            </div>
          </div>

          {/* Business Hours Section */}
          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-4 space-y-2.5">
            <div>
              <h2 className="text-lg font-semibold text-theme-primary">Business Hours</h2>
              <p className="text-xs text-theme-tertiary mt-0.5">
                Configure open hours for each day of the week.
              </p>
              <p className="text-[11px] text-theme-muted mt-0.5">
                Controls the highlighted business-hours region on the schedule.
              </p>
            </div>

            <div className="grid grid-cols-[52px_minmax(0,1fr)_44px] items-end gap-2 text-[11px] text-theme-muted">
              <span />
              <div className="relative h-4 w-full pt-1 leading-none">
                <span className="absolute top-0 left-0 text-[10px] text-theme-muted whitespace-nowrap leading-none">
                  12 AM
                </span>
                <span className="absolute top-0 left-[25%] -translate-x-1/2 text-[10px] text-theme-muted whitespace-nowrap leading-none">
                  6 AM
                </span>
                <span className="absolute top-0 left-[50%] -translate-x-1/2 text-[10px] text-theme-muted whitespace-nowrap leading-none">
                  12 PM
                </span>
                <span className="absolute top-0 left-[75%] -translate-x-1/2 text-[10px] text-theme-muted whitespace-nowrap leading-none">
                  6 PM
                </span>
                <span className="absolute top-0 right-0 translate-x-0 text-[10px] text-theme-muted whitespace-nowrap leading-none">
                  12 AM
                </span>
              </div>
              <span className="text-right text-[10px] text-theme-muted pr-1">Edit</span>
            </div>

            <div className="space-y-2">
              {orderedRows.map((row) => {
                const startMinutes = timeToMinutes(row.openTime);
                const endMinutes = timeToMinutes(row.closeTime);
                const duration = Math.max(MIN_RANGE_MINUTES, endMinutes - startMinutes);
                const leftPct = (startMinutes / MINUTES_PER_DAY) * 100;
                const widthPct = (duration / MINUTES_PER_DAY) * 100;
                const ghost = hoveredGhost && hoveredGhost.dayOfWeek === row.dayOfWeek
                  ? hoveredGhost.startMinutes
                  : null;
                const ghostLeftPct = ghost !== null ? (ghost / MINUTES_PER_DAY) * 100 : 0;
                const ghostWidthPct = (GHOST_MINUTES / MINUTES_PER_DAY) * 100;
                const isEditing = editorDraft?.dayOfWeek === row.dayOfWeek;
                const isFocused = focusedDay === row.dayOfWeek;
                return (
                  <div
                    key={row.dayOfWeek}
                    className={`grid grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-2 bg-theme-tertiary dark:bg-transparent border border-theme-primary rounded-md px-2 py-1.5 outline-none ${isFocused ? 'ring-1 ring-sky-400/60' : ''}`}
                    tabIndex={0}
                    onFocus={() => {
                      setFocusedDay(row.dayOfWeek);
                      if (!hoveredGhost || hoveredGhost.dayOfWeek !== row.dayOfWeek) {
                        const start = row.enabled ? Math.max(0, Math.min(MINUTES_PER_DAY - GHOST_MINUTES, endMinutes)) : 0;
                        setHoveredGhost({ dayOfWeek: row.dayOfWeek, startMinutes: start });
                        setHoveredCell({ dayOfWeek: row.dayOfWeek, startMinutes: start });
                      }
                    }}
                    onBlur={() => {
                      setFocusedDay((prev) => (prev === row.dayOfWeek ? null : prev));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        closeEditor();
                        return;
                      }
                      if (e.key === 'Enter') {
                        const track = e.currentTarget.querySelector('[data-mini-track]') as HTMLElement | null;
                        const rect = track?.getBoundingClientRect() ?? null;
                        if (hoveredGhost?.dayOfWeek === row.dayOfWeek) {
                          openEditor(row.dayOfWeek, hoveredGhost.startMinutes, hoveredGhost.startMinutes + GHOST_MINUTES, rect);
                          e.preventDefault();
                          return;
                        }
                        openEditor(row.dayOfWeek, startMinutes, endMinutes, rect);
                        e.preventDefault();
                        return;
                      }
                      const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
                      if (!isArrow) return;
                      e.preventDefault();
                      if (e.shiftKey && row.enabled) {
                        const delta = e.key === 'ArrowLeft' ? -RESIZE_STEP_MINUTES : RESIZE_STEP_MINUTES;
                        if (e.key === 'ArrowLeft') {
                          setRowTimesMinutes(row.dayOfWeek, startMinutes + delta, endMinutes);
                        } else {
                          setRowTimesMinutes(row.dayOfWeek, startMinutes, endMinutes + delta);
                        }
                        return;
                      }
                      const current = hoveredGhost?.dayOfWeek === row.dayOfWeek ? hoveredGhost.startMinutes : 0;
                      const delta = e.key === 'ArrowLeft' ? -GHOST_MINUTES : GHOST_MINUTES;
                      const next = Math.max(0, Math.min(MINUTES_PER_DAY - GHOST_MINUTES, current + delta));
                      setHoveredGhost({ dayOfWeek: row.dayOfWeek, startMinutes: next });
                      setHoveredCell({ dayOfWeek: row.dayOfWeek, startMinutes: next });
                    }}
                  >
                    <div className="text-sm text-theme-primary font-medium text-right pr-1">
                      {DAYS[row.dayOfWeek].slice(0, 3)}
                    </div>

                    <div
                      data-mini-track
                      className={`relative h-8 rounded-[6px] border border-zinc-300 dark:border-white/10 overflow-hidden ${hoveredGhost?.dayOfWeek === row.dayOfWeek ? 'cursor-pointer' : ''}`}
                      style={{ touchAction: 'none' }}
                      onPointerMove={(e) => {
                        if (moveRef.current) {
                          handleMove(e);
                          return;
                        }
                        if (resizeRef.current) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const target = e.target as HTMLElement;
                        const isOverBar = Boolean(target.closest('[data-bh-bar="true"], [data-bh-handle="true"]'));
                        if (e.pointerType !== 'touch') {
                          const pointerMinutes = getPointerMinutes(e.clientX, rect);
                          const hoverStart = roundToStep(pointerMinutes, HOUR_STEP_MINUTES);
                          const clampedHover = Math.max(0, Math.min(MINUTES_PER_DAY - GHOST_MINUTES, hoverStart));
                          setHoveredCell({ dayOfWeek: row.dayOfWeek, startMinutes: clampedHover });
                        }
                        if (isOverBar) {
                          setHoveredGhost((prev) => (prev?.dayOfWeek === row.dayOfWeek ? null : prev));
                          return;
                        }
                        const nextStart = getGhostStartMinutes(e.clientX, rect, startMinutes, endMinutes, row.enabled);
                        if (nextStart === null || (row.enabled && !isOutsideRange(startMinutes, endMinutes, nextStart))) {
                          setHoveredGhost((prev) => (prev?.dayOfWeek === row.dayOfWeek ? null : prev));
                          return;
                        }
                        if (e.pointerType === 'touch') return;
                        setHoveredGhost({ dayOfWeek: row.dayOfWeek, startMinutes: nextStart });
                      }}
                      onPointerLeave={() => {
                        setHoveredGhost((prev) => (prev?.dayOfWeek === row.dayOfWeek ? null : prev));
                        setHoveredCell((prev) => (prev?.dayOfWeek === row.dayOfWeek ? null : prev));
                      }}
                      onPointerUp={(e) => {
                        handleMoveEnd(e);
                        handleResizeEnd(e);
                      }}
                      onPointerCancel={(e) => {
                        handleMoveEnd(e);
                        handleResizeEnd(e);
                      }}
                      onPointerDown={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const pointerMinutes = getPointerMinutes(e.clientX, rect);
                        if (row.enabled && pointerMinutes >= startMinutes && pointerMinutes <= endMinutes) {
                          openEditor(row.dayOfWeek, startMinutes, endMinutes, rect);
                          return;
                        }
                        const nextStart = getGhostStartMinutes(e.clientX, rect, startMinutes, endMinutes, row.enabled);
                        if (nextStart === null) return;
                        if (e.pointerType === 'touch') {
                          if (ghostTimeoutRef.current) {
                            clearTimeout(ghostTimeoutRef.current);
                          }
                          if (hoveredGhost?.dayOfWeek === row.dayOfWeek && hoveredGhost.startMinutes === nextStart) {
                            applyInstantBusinessHour(row.dayOfWeek, nextStart, nextStart + GHOST_MINUTES);
                            setHoveredGhost(null);
                            return;
                          }
                          setHoveredGhost({ dayOfWeek: row.dayOfWeek, startMinutes: nextStart });
                          ghostTimeoutRef.current = setTimeout(() => {
                            setHoveredGhost((prev) => (prev?.dayOfWeek === row.dayOfWeek ? null : prev));
                          }, 2000);
                          return;
                        }
                        applyInstantBusinessHour(row.dayOfWeek, nextStart, nextStart + GHOST_MINUTES);
                      }}
                    >
                      <div
                        data-bh-track-bg="true"
                        className="absolute inset-0 bg-zinc-200/80"
                      />
                      <span className="absolute top-0 bottom-0 w-px bg-zinc-400/40 dark:bg-white/10 left-[25%] pointer-events-none z-10" />
                      <span className="absolute top-0 bottom-0 w-px bg-zinc-400/40 dark:bg-white/10 left-[50%] pointer-events-none z-10" />
                      <span className="absolute top-0 bottom-0 w-px bg-zinc-400/40 dark:bg-white/10 left-[75%] pointer-events-none z-10" />
                      {hoveredCell?.dayOfWeek === row.dayOfWeek && (
                        <div
                          className="absolute top-[1px] bottom-[1px] rounded-[4px] bg-sky-400/10 pointer-events-none z-20"
                          style={{
                            left: `${(hoveredCell.startMinutes / MINUTES_PER_DAY) * 100}%`,
                            width: `${(GHOST_MINUTES / MINUTES_PER_DAY) * 100}%`,
                          }}
                        />
                      )}
                      {row.enabled && (
                        <div
                          data-bh-bar="true"
                          className={`absolute top-[1px] bottom-[1px] rounded-[6px] border border-sky-600/80 bg-sky-300/80 dark:border-sky-500/50 dark:bg-sky-900/40 px-1.5 flex items-center text-[11px] text-sky-900 dark:text-sky-200 truncate transition-shadow duration-150 group hover:shadow-[0_0_0_1px_rgba(56,189,248,0.6),0_0_12px_rgba(56,189,248,0.25)] ${isMoving ? 'cursor-grabbing' : 'cursor-grab'} z-30`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          onPointerDown={(e) => startMove(e, row.dayOfWeek, startMinutes, endMinutes)}
                          onPointerMove={handleMove}
                          onPointerUp={handleMoveEnd}
                          onPointerCancel={handleMoveEnd}
                        >
                          {`${formatTimeLabel(startMinutes)} - ${formatTimeLabel(endMinutes)}`}
                          <div
                            data-bh-handle="true"
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-sky-700/30 dark:bg-sky-300/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100 rounded-[4px]"
                            onPointerDown={(e) => startResize(e, row.dayOfWeek, 'start', startMinutes, endMinutes)}
                            onPointerMove={handleResizeMove}
                            onPointerUp={handleResizeEnd}
                            onPointerCancel={handleResizeEnd}
                          />
                          <div
                            data-bh-handle="true"
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-sky-700/30 dark:bg-sky-300/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100 rounded-[4px]"
                            onPointerDown={(e) => startResize(e, row.dayOfWeek, 'end', startMinutes, endMinutes)}
                            onPointerMove={handleResizeMove}
                            onPointerUp={handleResizeEnd}
                            onPointerCancel={handleResizeEnd}
                          />
                        </div>
                      )}
                      {ghost !== null && (!row.enabled || isOutsideRange(startMinutes, endMinutes, ghost)) && (
                        <div
                          className={`absolute top-[2px] bottom-[2px] rounded-[4px] border border-sky-700/60 dark:border-sky-400/60 bg-transparent flex items-center justify-center text-sky-900 dark:text-sky-200 text-sm font-semibold pointer-events-none transition-all duration-150 ease-out opacity-0 scale-95 z-30 ${
                            ghostAnimating ? 'opacity-100 scale-100' : ''
                          }`}
                          style={{ left: `${ghostLeftPct}%`, width: `${ghostWidthPct}%` }}
                        >
                          +
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 text-xs text-theme-secondary pr-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openEditor(row.dayOfWeek, startMinutes, endMinutes, rect);
                        }}
                        className="text-[11px] text-sky-800 hover:text-sky-900 underline underline-offset-2 dark:text-sky-300 dark:hover:text-sky-200"
                      >
                        {isEditing ? 'Editing' : 'Edit'}
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Business Hours'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {editorDraft && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" />
          <div
            ref={editorRef}
            className="hidden md:block fixed z-50 w-72 rounded-xl border border-theme-primary bg-theme-secondary p-3 shadow-xl"
            style={editorPosition ? { top: editorPosition.top, left: editorPosition.left } : { top: 120, left: 120 }}
          >
            <div className="text-sm font-semibold text-theme-primary">Edit Hours</div>
            <p className="text-[11px] text-theme-tertiary mt-0.5">Set open hours for this day.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-theme-secondary">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={orderedRows.find((row) => row.dayOfWeek === editorDraft.dayOfWeek)?.enabled ?? true}
                  onChange={(e) => handleChange(editorDraft.dayOfWeek, 'enabled', e.target.checked)}
                  className="accent-amber-500"
                />
                Open
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={minutesToTimeString(editorDraft.startMinutes)}
                  onChange={(e) => {
                    const value = timeToMinutes(e.target.value);
                    setEditorDraft((prev) => (prev ? { ...prev, startMinutes: value } : prev));
                  }}
                  className="px-2 py-0.5 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                />
                <span className="text-[11px] text-theme-muted">to</span>
                <input
                  type="time"
                  value={minutesToTimeString(editorDraft.endMinutes)}
                  onChange={(e) => {
                    const value = timeToMinutes(e.target.value);
                    setEditorDraft((prev) => (prev ? { ...prev, endMinutes: value } : prev));
                  }}
                  className="px-2 py-0.5 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRowTimesMinutes(editorDraft.dayOfWeek, editorDraft.startMinutes, editorDraft.endMinutes);
                  handleChange(editorDraft.dayOfWeek, 'enabled', true);
                  closeEditor();
                }}
                className="px-2 py-1 rounded-md bg-amber-500 text-zinc-900 text-xs font-semibold hover:bg-amber-400"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  handleChange(editorDraft.dayOfWeek, 'enabled', false);
                  closeEditor();
                }}
                className="px-2 py-1 rounded-md border border-theme-primary text-theme-secondary text-xs hover:text-theme-primary"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={closeEditor}
                className="px-2 py-1 rounded-md border border-theme-primary text-theme-secondary text-xs hover:text-theme-primary"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="md:hidden fixed inset-0 z-50 flex items-end">
            <div
              ref={sheetRef}
              className="w-full rounded-t-2xl border border-theme-primary bg-theme-secondary p-4 shadow-xl"
              style={{ touchAction: 'none' }}
              onTouchStart={(e) => {
                sheetDragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY };
              }}
              onTouchMove={(e) => {
                if (!sheetDragRef.current) return;
                sheetDragRef.current.currentY = e.touches[0].clientY;
                const delta = sheetDragRef.current.currentY - sheetDragRef.current.startY;
                if (delta > 0 && sheetRef.current) {
                  sheetRef.current.style.transform = `translateY(${delta}px)`;
                }
              }}
              onTouchEnd={() => {
                if (!sheetDragRef.current || !sheetRef.current) return;
                const delta = sheetDragRef.current.currentY - sheetDragRef.current.startY;
                sheetRef.current.style.transform = '';
                sheetDragRef.current = null;
                if (delta > 80) {
                  closeEditor();
                }
              }}
            >
              <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-theme-primary/40" />
              <div className="text-sm font-semibold text-theme-primary">Edit Hours</div>
              <p className="text-[11px] text-theme-tertiary mt-0.5">Set open hours for this day.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-theme-secondary">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={orderedRows.find((row) => row.dayOfWeek === editorDraft.dayOfWeek)?.enabled ?? true}
                    onChange={(e) => handleChange(editorDraft.dayOfWeek, 'enabled', e.target.checked)}
                    className="accent-amber-500"
                  />
                  Open
                </label>
                <div className="flex w-full items-center gap-1.5">
                  <input
                    type="time"
                    value={minutesToTimeString(editorDraft.startMinutes)}
                    onChange={(e) => {
                      const value = timeToMinutes(e.target.value);
                      setEditorDraft((prev) => (prev ? { ...prev, startMinutes: value } : prev));
                    }}
                    className="flex-1 px-2 py-1 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                  />
                  <span className="text-[11px] text-theme-muted">to</span>
                  <input
                    type="time"
                    value={minutesToTimeString(editorDraft.endMinutes)}
                    onChange={(e) => {
                      const value = timeToMinutes(e.target.value);
                      setEditorDraft((prev) => (prev ? { ...prev, endMinutes: value } : prev));
                    }}
                    className="flex-1 px-2 py-1 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRowTimesMinutes(editorDraft.dayOfWeek, editorDraft.startMinutes, editorDraft.endMinutes);
                    handleChange(editorDraft.dayOfWeek, 'enabled', true);
                    closeEditor();
                  }}
                  className="flex-1 px-2 py-2 rounded-md bg-amber-500 text-zinc-900 text-xs font-semibold hover:bg-amber-400"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleChange(editorDraft.dayOfWeek, 'enabled', false);
                    closeEditor();
                  }}
                  className="flex-1 px-2 py-2 rounded-md border border-theme-primary text-theme-secondary text-xs hover:text-theme-primary"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="flex-1 px-2 py-2 rounded-md border border-theme-primary text-theme-secondary text-xs hover:text-theme-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        .dark [data-bh-track-bg="true"] {
          background: transparent !important;
        }
      `}</style>
    </div>
  );
}

