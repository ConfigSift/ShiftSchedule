'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import { X } from 'lucide-react';

export type HourRow = {
  id: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  enabled: boolean;
  sortOrder?: number;
};

type HoursRangeSectionProps = {
  title: string;
  description?: string;
  helperText?: string;
  rows: HourRow[];
  setRows: Dispatch<SetStateAction<HourRow[]>>;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TICK_LABELS = ['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'];
const SNAP_MINUTES = 15;
const SNAP_HOURS = SNAP_MINUTES / 60;
const MIN_DURATION = SNAP_HOURS;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snapHour(value: number) {
  const snapped = Math.round(value / SNAP_HOURS) * SNAP_HOURS;
  return Number.isFinite(snapped) ? snapped : 0;
}

function parseTimeToDecimal(value?: string | null): number {
  if (!value) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const [hours, minutes = '0'] = text.split(':');
  const hour = Number(hours);
  const minute = Number(minutes);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour + minute / 60;
}

function decimalToTime(value: number): string {
  const safe = clamp(value, 0, 24);
  const totalMinutes = Math.round(safe * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeTimeValue(value: string): string {
  const parsed = parseTimeToDecimal(value);
  return decimalToTime(parsed);
}

function formatHourLabel(value: number): string {
  const safe = clamp(value, 0, 24);
  if (safe === 24) {
    return '12 AM';
  }
  const hours = Math.floor(safe);
  const minutes = Math.round((safe - hours) * 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  if (minutes === 0) {
    return `${displayHour} ${period}`;
  }
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatHourLabelLong(value: number): string {
  const safe = clamp(value, 0, 24);
  const hours = Math.floor(safe) % 24;
  const minutes = Math.round((safe - Math.floor(safe)) * 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
}

type DragMode = 'move' | 'resize-start' | 'resize-end';

type DragState = {
  pointerId: number;
  dayOfWeek: number;
  rangeId: string;
  mode: DragMode;
  trackEl: HTMLDivElement;
  anchorHour: number;
  startHour: number;
  endHour: number;
  duration: number;
  offset: number;
  moved: boolean;
};

function getHourFromPointer(trackEl: HTMLDivElement, clientX: number) {
  const rect = trackEl.getBoundingClientRect();
  if (!rect.width) return 0;
  const x = clamp(clientX - rect.left, 0, rect.width);
  return snapHour((x / rect.width) * 24);
}

export function HoursRangeSection({
  title,
  description,
  helperText,
  rows,
  setRows,
  onSave,
  saving = false,
  saveLabel = 'Save',
}: HoursRangeSectionProps) {
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null);
  const [hoveredRangeId, setHoveredRangeId] = useState<string | null>(null);
  const [selectedRangeId, setSelectedRangeId] = useState<string | null>(null);
  const [ghostPreview, setGhostPreview] = useState<{ dayOfWeek: number; start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const trackRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragRef = useRef<DragState | null>(null);
  const lastDragAtRef = useRef(0);
  const rowsRef = useRef(rows);
  const editSnapshotRef = useRef<{ rangeId: string; row: HourRow } | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const rangesByDay = useMemo(() => {
    const map = new Map<number, HourRow[]>();
    rows.forEach((range) => {
      if (!map.has(range.dayOfWeek)) {
        map.set(range.dayOfWeek, []);
      }
      map.get(range.dayOfWeek)!.push(range);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const aStart = parseTimeToDecimal(a.openTime);
        const bStart = parseTimeToDecimal(b.openTime);
        if (aStart !== bStart) return aStart - bStart;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
    });
    return map;
  }, [rows]);

  const updateRange = useCallback((rangeId: string, patch: Partial<HourRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rangeId ? { ...row, ...patch } : row))
    );
  }, [setRows]);

  const removeRange = useCallback((rangeId: string) => {
    setRows((prev) => prev.filter((row) => row.id !== rangeId));
    setSelectedRangeId((prev) => (prev === rangeId ? null : prev));
  }, [setRows]);

  const closeEditor = useCallback(() => {
    setEditingRangeId(null);
    editSnapshotRef.current = null;
  }, []);

  const openEditorForRange = useCallback((rangeId: string) => {
    if (editingRangeId === rangeId) {
      closeEditor();
      return;
    }
    const current = rowsRef.current.find((row) => row.id === rangeId);
    if (!current) return;
    editSnapshotRef.current = { rangeId, row: { ...current } };
    setSelectedRangeId(rangeId);
    setEditingRangeId(rangeId);
  }, [closeEditor, editingRangeId]);

  const handleEditClick = useCallback((dayRanges: HourRow[]) => {
    if (!dayRanges.length) return;
    const selectedId =
      (selectedRangeId && dayRanges.some((range) => range.id === selectedRangeId) && selectedRangeId) ||
      (hoveredRangeId && dayRanges.some((range) => range.id === hoveredRangeId) && hoveredRangeId) ||
      dayRanges[0].id;
    openEditorForRange(selectedId);
  }, [hoveredRangeId, openEditorForRange, selectedRangeId]);

  const cancelEditor = useCallback(() => {
    const snapshot = editSnapshotRef.current;
    if (snapshot) {
      setRows((prev) =>
        prev.map((row) => (row.id === snapshot.rangeId ? snapshot.row : row))
      );
    }
    closeEditor();
  }, [closeEditor, setRows]);

  const hasOverlap = useCallback((ranges: HourRow[], start: number, end: number, excludeId?: string) => {
    return ranges.some((range) => {
      if (excludeId && range.id === excludeId) return false;
      const rangeStart = parseTimeToDecimal(range.openTime);
      const rangeEnd = parseTimeToDecimal(range.closeTime);
      return start < rangeEnd && end > rangeStart;
    });
  }, []);

  const applyRange = useCallback((rangeId: string, dayOfWeek: number, start: number, end: number) => {
    const nextStart = clamp(snapHour(start), 0, 24 - MIN_DURATION);
    const nextEnd = clamp(snapHour(end), nextStart + MIN_DURATION, 24);
    const dayRanges = rowsRef.current.filter((row) => row.dayOfWeek === dayOfWeek);
    if (hasOverlap(dayRanges, nextStart, nextEnd, rangeId)) {
      return;
    }
    updateRange(rangeId, {
      openTime: decimalToTime(nextStart),
      closeTime: decimalToTime(nextEnd),
      enabled: true,
    });
  }, [hasOverlap, updateRange]);

  const findFirstAvailableSlot = useCallback((dayRanges: HourRow[]) => {
    const duration = 1;
    const step = SNAP_HOURS;
    const tryRange = (startAt: number) => {
      for (let start = startAt; start <= 24 - duration; start += step) {
        const nextStart = snapHour(start);
        const nextEnd = nextStart + duration;
        if (nextEnd > 24) continue;
        if (!hasOverlap(dayRanges, nextStart, nextEnd)) {
          return { start: nextStart, end: nextEnd };
        }
      }
      return null;
    };
    return tryRange(9) ?? tryRange(0);
  }, [hasOverlap]);

  const addRangeAt = useCallback((dayOfWeek: number, start: number, end: number) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `range-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRows((prev) => [
      ...prev,
      {
        id,
        dayOfWeek,
        openTime: decimalToTime(start),
        closeTime: decimalToTime(end),
        enabled: true,
        sortOrder: prev.filter((row) => row.dayOfWeek === dayOfWeek).length,
      },
    ]);
    setSelectedRangeId(id);
    setEditingRangeId(id);
  }, [setRows]);

  const handleAddRange = useCallback((dayOfWeek: number, dayRanges: HourRow[]) => {
    const slot = findFirstAvailableSlot(dayRanges);
    if (!slot) return;
    addRangeAt(dayOfWeek, slot.start, slot.end);
  }, [addRangeAt, findFirstAvailableSlot]);

  const startDrag = useCallback((range: HourRow, mode: DragMode, event: ReactPointerEvent) => {
    const trackEl = trackRefs.current[range.dayOfWeek];
    if (!trackEl || !range.enabled) return;
    event.preventDefault();
    event.stopPropagation();
    closeEditor();
    setGhostPreview(null);

    const pointerHour = getHourFromPointer(trackEl, event.clientX);
    const startHour = clamp(parseTimeToDecimal(range.openTime), 0, 24);
    const endHour = clamp(parseTimeToDecimal(range.closeTime), 0, 24);
    const safeEnd = endHour > startHour ? endHour : Math.min(24, startHour + MIN_DURATION);
    const duration = Math.max(MIN_DURATION, safeEnd - startHour);
    const offset = pointerHour - startHour;
    const anchorHour = pointerHour;

    dragRef.current = {
      pointerId: event.pointerId,
      dayOfWeek: range.dayOfWeek,
      rangeId: range.id,
      mode,
      trackEl,
      anchorHour,
      startHour,
      endHour: safeEnd,
      duration,
      offset,
      moved: false,
    };
    setIsDragging(true);
  }, [closeEditor]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const hour = getHourFromPointer(drag.trackEl, event.clientX);
      if (!drag.moved) {
        drag.moved = true;
      }

      if (drag.mode === 'move') {
        const nextStart = clamp(snapHour(hour - drag.offset), 0, 24 - drag.duration);
        applyRange(drag.rangeId, drag.dayOfWeek, nextStart, nextStart + drag.duration);
        return;
      }

      if (drag.mode === 'resize-start') {
        const nextStart = clamp(snapHour(hour), 0, drag.endHour - MIN_DURATION);
        applyRange(drag.rangeId, drag.dayOfWeek, nextStart, drag.endHour);
        return;
      }

      if (drag.mode === 'resize-end') {
        const nextEnd = clamp(snapHour(hour), drag.startHour + MIN_DURATION, 24);
        applyRange(drag.rangeId, drag.dayOfWeek, drag.startHour, nextEnd);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.moved) {
        lastDragAtRef.current = Date.now();
      }
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [applyRange]);

  useEffect(() => {
    if (editingRangeId === null) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-hours-popover]') || target.closest('[data-hours-trigger]')) {
        return;
      }
      cancelEditor();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelEditor();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [cancelEditor, editingRangeId]);

  const timeOptions = useMemo(() => {
    const steps = Math.round((24 * 60) / SNAP_MINUTES);
    return Array.from({ length: steps + 1 }, (_, i) => {
      const minutes = i * SNAP_MINUTES;
      const value = minutes / 60;
      return {
        value: decimalToTime(value),
        label: formatHourLabel(value),
        hour: value,
      };
    });
  }, []);

  return (
    <section className="bg-theme-secondary border border-theme-primary rounded-2xl p-3 space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-theme-primary">{title}</h2>
        {description && (
          <p className="text-xs text-theme-tertiary mt-0.5">{description}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[92px_1fr_64px] sm:grid-cols-[110px_1fr_80px] items-center text-[10px] text-theme-muted uppercase tracking-wide">
          <div />
          <div className="flex items-center justify-between px-1">
            {TICK_LABELS.map((label, idx) => (
              <span key={`${label}-${idx}`}>{label}</span>
            ))}
          </div>
          <div />
        </div>

        {DISPLAY_ORDER.map((dayOfWeek) => {
          const dayLabel = DAYS[dayOfWeek] ?? `Day ${dayOfWeek + 1}`;
          const dayRanges = rangesByDay.get(dayOfWeek) ?? [];
          const addDisabled = !findFirstAvailableSlot(dayRanges);
          const editingRange = dayRanges.find((range) => range.id === editingRangeId) ?? null;
          const isEditingDay = Boolean(editingRange);
          const dayGhost = ghostPreview?.dayOfWeek === dayOfWeek ? ghostPreview : null;

          return (
            <div
              key={`day-${dayOfWeek}`}
              className={`rounded-xl border border-theme-primary px-2.5 py-2 transition-colors ${
                dayRanges.length ? 'bg-theme-tertiary/40' : 'bg-theme-tertiary/20'
              } ${isEditingDay ? 'ring-1 ring-blue-500/40' : ''}`}
            >
              <div className="grid grid-cols-[92px_1fr_64px] sm:grid-cols-[110px_1fr_80px] items-center gap-2">
                <div className="text-sm font-semibold text-theme-primary">{dayLabel}</div>

                <div
                  ref={(el) => {
                    trackRefs.current[dayOfWeek] = el;
                  }}
                  className="relative h-9 rounded-lg border border-theme-primary overflow-hidden cursor-crosshair"
                  onMouseMove={(event) => {
                    if (isDragging) return;
                    const trackEl = event.currentTarget;
                    const rect = trackEl.getBoundingClientRect();
                    if (!rect.width) return;
                    const x = clamp(event.clientX - rect.left, 0, rect.width);
                    const rawHour = (x / rect.width) * 24;
                    const snappedHour = snapHour(rawHour);
                    const duration = 2;
                    const halfDuration = duration / 2;
                    let start = snapHour(snappedHour - halfDuration);
                    start = clamp(start, 0, 24 - duration);
                    const end = start + duration;
                    const dayRangesAll = rowsRef.current.filter((row) => row.dayOfWeek === dayOfWeek);
                    if (hasOverlap(dayRangesAll, start, end)) {
                      if (ghostPreview?.dayOfWeek === dayOfWeek) {
                        setGhostPreview(null);
                      }
                      return;
                    }
                    setGhostPreview({ dayOfWeek, start, end });
                  }}
                  onMouseLeave={() => {
                    if (ghostPreview?.dayOfWeek === dayOfWeek) {
                      setGhostPreview(null);
                    }
                  }}
                  onClick={() => {
                    if (!dayGhost) return;
                    addRangeAt(dayOfWeek, dayGhost.start, dayGhost.end);
                    setGhostPreview(null);
                  }}
                >
                  <div className="absolute inset-0 bg-theme-tertiary/80" data-bh-track-bg="true" />
                  {dayGhost && (
                    <div
                      className="absolute top-1 bottom-1 rounded-md border border-dashed border-amber-400/60 bg-amber-400/10 text-amber-500/80 flex items-center justify-center text-[10px] font-semibold pointer-events-none"
                      style={{
                        left: `${(dayGhost.start / 24) * 100}%`,
                        width: `${((dayGhost.end - dayGhost.start) / 24) * 100}%`,
                      }}
                    >
                      + 2h
                    </div>
                  )}
                  {dayRanges.map((range) => {
                    const start = clamp(parseTimeToDecimal(range.openTime), 0, 24);
                    const end = clamp(parseTimeToDecimal(range.closeTime), 0, 24);
                    if (end <= start) return null;
                    const leftPct = (start / 24) * 100;
                    const widthPct = ((end - start) / 24) * 100;
                    const timeLabel = `${formatHourLabelLong(start)} - ${formatHourLabelLong(end)}`;
                    const isHovered = hoveredRangeId === range.id;
                    const isSelected = selectedRangeId === range.id;
                    const isDisabled = !range.enabled;

                    return (
                      <div
                        key={range.id}
                        className={`absolute top-1 bottom-1 rounded-md range-selected-orange shadow-sm flex items-center justify-center text-[10px] font-semibold text-zinc-900 cursor-pointer active:cursor-grabbing touch-none overflow-hidden ${
                          isHovered
                            ? 'outline outline-1 outline-dashed outline-amber-400/60 outline-offset-2 ring-2 ring-amber-400/20 shadow-md'
                            : ''
                        } ${isSelected ? 'ring-1 ring-amber-400/40' : ''} ${
                          isDisabled ? 'opacity-50' : ''
                        }`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        onPointerDown={(event) => startDrag(range, 'move', event)}
                        onClick={() => {
                          if (Date.now() - lastDragAtRef.current < 150) return;
                          openEditorForRange(range.id);
                        }}
                        onMouseEnter={() => setHoveredRangeId(range.id)}
                        onMouseLeave={() => setHoveredRangeId(null)}
                      >
                        {isHovered && (
                          <div className="absolute inset-0 rounded-md pointer-events-none bg-black/5 dark:bg-white/5" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center px-2 pointer-events-none">
                          <span className="text-[11px] font-semibold text-theme-primary truncate max-w-full relative z-10">
                            {timeLabel}
                          </span>
                        </div>
                        <div
                          className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize touch-none"
                          onPointerDown={(event) => startDrag(range, 'resize-start', event)}
                        />
                        <div
                          className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize touch-none"
                          onPointerDown={(event) => startDrag(range, 'resize-end', event)}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="relative flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddRange(dayOfWeek, dayRanges)}
                    disabled={addDisabled}
                    className={`text-sm font-semibold transition-colors ${
                      addDisabled
                        ? 'text-theme-muted opacity-60 cursor-not-allowed'
                        : 'text-blue-500 hover:text-blue-400'
                    }`}
                    aria-label={`Add hours for ${dayLabel}`}
                  >
                    +
                  </button>
                  {isEditingDay && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-semibold uppercase tracking-wide">
                      Editing
                    </span>
                  )}
                  <button
                    type="button"
                    data-hours-trigger="true"
                    onClick={() => handleEditClick(dayRanges)}
                    className="text-sm font-semibold text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    Edit
                  </button>

                  {editingRange && (
                    <div
                      data-hours-popover="true"
                      className="absolute right-0 mt-2 top-full w-64 z-30 bg-theme-secondary border border-theme-primary rounded-xl p-3 shadow-lg animate-slide-in"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-theme-primary">Edit Hours</span>
                        <button
                          type="button"
                          onClick={cancelEditor}
                          className="p-1 rounded hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors"
                          aria-label="Close edit hours"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <label className="mt-2 flex items-center gap-2 text-xs font-medium text-theme-secondary">
                        <input
                          type="checkbox"
                          checked={editingRange.enabled}
                          onChange={(event) => updateRange(editingRange.id, { enabled: event.target.checked })}
                          className="accent-amber-500"
                        />
                        Open
                      </label>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <label className="flex flex-col gap-1">
                          <span className="text-theme-muted">Start</span>
                          <select
                            value={normalizeTimeValue(editingRange.openTime)}
                            onChange={(event) => {
                              const nextStart = parseTimeToDecimal(event.target.value);
                              const currentEnd = parseTimeToDecimal(editingRange.closeTime ?? '');
                              let nextEnd = currentEnd;
                              if (nextEnd <= nextStart + MIN_DURATION) {
                                nextEnd = clamp(nextStart + MIN_DURATION, 0, 24);
                              }
                              applyRange(editingRange.id, editingRange.dayOfWeek, nextStart, nextEnd);
                            }}
                            disabled={!editingRange.enabled}
                            className="px-2 py-1 rounded bg-theme-tertiary border border-theme-primary text-theme-primary disabled:opacity-60"
                          >
                            {timeOptions
                              .filter((opt) => opt.hour <= 24 - MIN_DURATION)
                              .map((opt) => (
                                <option key={`start-${opt.value}`} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                          </select>
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="text-theme-muted">End</span>
                          <select
                            value={normalizeTimeValue(editingRange.closeTime)}
                            onChange={(event) => {
                              const nextEnd = parseTimeToDecimal(event.target.value);
                              const currentStart = parseTimeToDecimal(editingRange.openTime ?? '');
                              let nextStart = currentStart;
                              if (nextEnd <= nextStart + MIN_DURATION) {
                                nextStart = clamp(nextEnd - MIN_DURATION, 0, 24 - MIN_DURATION);
                              }
                              applyRange(editingRange.id, editingRange.dayOfWeek, nextStart, nextEnd);
                            }}
                            disabled={!editingRange.enabled}
                            className="px-2 py-1 rounded bg-theme-tertiary border border-theme-primary text-theme-primary disabled:opacity-60"
                          >
                            {timeOptions
                              .filter((opt) => opt.hour >= MIN_DURATION)
                              .map((opt) => (
                                <option key={`end-${opt.value}`} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={cancelEditor}
                          className="btn-secondary px-2.5 py-1 text-[11px]"
                        >
                          Cancel
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              removeRange(editingRange.id);
                              closeEditor();
                            }}
                            className="btn-secondary px-2.5 py-1 text-[11px] text-red-500 hover:text-red-400"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={closeEditor}
                            className="btn-primary-orange px-2.5 py-1 text-[11px]"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {helperText && <p className="text-xs text-theme-tertiary">{helperText}</p>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </section>
  );
}
