'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { type Shift } from '../types';
import { getWeekDates, getWeekStart, dateToString, isSameDay, formatHour, shiftsOverlap } from '../utils/timeUtils';
import { Palmtree, ArrowLeftRight } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJobColorClasses } from '../lib/jobColors';
import { ScheduleToolbar } from './ScheduleToolbar';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { PublishScheduleDialog, type PublishEmailMode } from './ui/PublishScheduleDialog';
import { PasteJobPickerDialog } from './ui/PasteJobPickerDialog';
import { apiFetch } from '../lib/apiClient';
import { resolvePasteJob } from '../utils/pasteJobResolution';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

const SHIFT_DND_PREFIX = 'shift:';
const CELL_DND_PREFIX = 'cell:';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CROSS_EMPLOYEE_Y_THRESHOLD_PX = 20;
const SCHEDULE_CLIPBOARD_KEY = 'crewshyft:scheduleClipboard:v1';
const CLIPBOARD_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Returns a short role abbreviation for display inside shift blocks
function getJobAbbr(job?: string): string {
  const n = (job ?? '').trim().toLowerCase();
  if (n.includes('bartender')) return 'Bar';
  if (n.includes('server')) return 'Svr';
  if (n.includes('manager')) return 'Mgr';
  if (n.includes('host')) return 'Hst';
  if (n.includes('busser')) return 'Bus';
  if (n.includes('dishwasher')) return 'Dsh';
  if (n.includes('kitchen') || n.includes('cook')) return 'Cook';
  const raw = (job ?? '').trim();
  return raw ? raw.slice(0, 3) : '';
}

function toDisplayJobLabel(job?: string): string {
  const value = (job ?? '').trim();
  if (!value) return 'Other';
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getJobGroupSortRank(jobLabel: string): number {
  const normalized = jobLabel.trim().toLowerCase();
  if (normalized.includes('manager')) return 0;
  if (normalized.includes('server')) return 1;
  if (normalized.includes('bartender')) return 2;
  if (normalized.includes('host')) return 3;
  if (normalized.includes('cook') || normalized.includes('kitchen')) return 4;
  if (normalized.includes('busser')) return 5;
  if (normalized.includes('dishwasher')) return 6;
  if (normalized.includes('other')) return 99;
  return 50;
}

function getShiftCountForJob(shiftCounts: Map<string, number>, jobLabel: string): number {
  const normalizedTarget = jobLabel.trim().toLowerCase();
  if (!normalizedTarget) return 0;
  let total = 0;
  for (const [normalizedShiftJob, count] of shiftCounts.entries()) {
    if (
      normalizedShiftJob === normalizedTarget
      || normalizedShiftJob.includes(normalizedTarget)
      || normalizedTarget.includes(normalizedShiftJob)
    ) {
      total += count;
    }
  }
  return total;
}

function withAlpha(hexColor: string, alphaHex: string): string {
  if (!hexColor.startsWith('#')) return hexColor;
  const normalized = hexColor.length === 4
    ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
    : hexColor;
  if (normalized.length !== 7) return hexColor;
  return `${normalized}${alphaHex}`;
}

function formatShiftTime(hour: number): string {
  const safeHour = Number.isFinite(hour) ? hour : 0;
  const baseHour = Math.floor(safeHour);
  let minutes = Math.round((safeHour - baseHour) * 60);
  let normalizedHour = baseHour;
  if (minutes >= 60) {
    minutes = 0;
    normalizedHour += 1;
  }
  const wrappedHour = ((normalizedHour % 24) + 24) % 24;
  const period = wrappedHour >= 12 ? 'pm' : 'am';
  const hour12 = wrappedHour % 12 === 0 ? 12 : wrappedHour % 12;
  if (minutes === 0) {
    return `${hour12}${period}`;
  }
  return `${hour12}:${String(minutes).padStart(2, '0')}${period}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function getShiftBarSegment(startHour: number, endHour: number): { leftPct: number; widthPct: number } {
  const dayStartMinutes = 0;
  const dayEndMinutes = 24 * 60;
  const daySpan = dayEndMinutes - dayStartMinutes;
  const startMinutes = Math.round(startHour * 60);
  const rawEndMinutes = Math.round(endHour * 60);
  const endMinutes = rawEndMinutes < startMinutes ? startMinutes : rawEndMinutes;

  const leftPct = clampPercent(((startMinutes - dayStartMinutes) / daySpan) * 100);
  const rightPct = clampPercent(((endMinutes - dayStartMinutes) / daySpan) * 100);
  const widthPct = Math.max(0, rightPct - leftPct);
  return { leftPct, widthPct };
}

function formatShiftDuration(shiftHours: number): string {
  const rounded = Math.round(shiftHours * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}h`;
  return `${rounded.toFixed(1)}h`;
}

type ShiftDragTarget = {
  shiftId: string;
};

type CellDropTarget = {
  organizationId: string;
  userId: string;
  date: string;
};

type OptimisticShiftMove = {
  employeeId: string;
  date: string;
};

type ScheduleClipboard = {
  copiedAt: number;
  sourceOrgId: string;
  template: {
    shiftId: string;
    sourceUserId?: string;
    startHour: number;
    endHour: number;
    job: string;
    locationId?: string | null;
    notes?: string;
  };
};

type OptimisticCreatedShift = Shift;
type ScheduleContextMenu = {
  x: number;
  y: number;
  type: 'shift' | 'cell';
  shiftId?: string;
  cellId?: string;
};

type PublishNotificationResponse = {
  ok?: boolean;
  sent?: number;
  failed?: number;
  skippedNoEmail?: number;
  requestId?: string;
};

function isKeyboardInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function buildShiftDragId(shiftId: string): string {
  return `${SHIFT_DND_PREFIX}${shiftId}`;
}

function parseShiftDragId(rawId: unknown): ShiftDragTarget | null {
  const value = String(rawId ?? '');
  if (!value.startsWith(SHIFT_DND_PREFIX)) return null;
  const shiftId = value.slice(SHIFT_DND_PREFIX.length);
  if (!shiftId) return null;
  return { shiftId };
}

function buildCellDropId(organizationId: string, userId: string, date: string): string {
  return `${CELL_DND_PREFIX}${organizationId}:${userId}:${date}`;
}

function parseCellDropId(rawId: unknown): CellDropTarget | null {
  const value = String(rawId ?? '');
  if (!value.startsWith(CELL_DND_PREFIX)) return null;
  const payload = value.slice(CELL_DND_PREFIX.length);
  const [organizationId, userId, date] = payload.split(':');
  if (!organizationId || !userId || !date || !DATE_RE.test(date)) return null;
  return { organizationId, userId, date };
}

function getClientPointFromEvent(event: Event | null | undefined): { x: number; y: number } | null {
  if (!event) return null;
  if ('clientX' in event && 'clientY' in event) {
    const mouseLike = event as MouseEvent;
    return { x: mouseLike.clientX, y: mouseLike.clientY };
  }
  if ('touches' in event) {
    const touchEvent = event as TouchEvent;
    const firstTouch = touchEvent.touches[0] ?? touchEvent.changedTouches[0];
    if (!firstTouch) return null;
    return { x: firstTouch.clientX, y: firstTouch.clientY };
  }
  return null;
}

function formatPublishWeekLabel(start: Date, end: Date): string {
  const startMonthDay = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endMonthDay = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear !== endYear) {
    return `${startMonthDay}, ${startYear}  ${endMonthDay}, ${endYear}`;
  }
  return `${startMonthDay}  ${endMonthDay}, ${startYear}`;
}

type WeekShiftCardProps = {
  shift: Shift;
  layout: 'single' | 'multi';
  isDraftShift: boolean;
  isBaselinePublished: boolean;
  isDraggingShiftId: boolean;
  isHiddenWhileDragging: boolean;
  isSelected: boolean;
  isContextMenuTarget: boolean;
  isPendingMove: boolean;
  dragEnabled: boolean;
  dragDisabledReason?: string;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function WeekShiftCard({
  shift,
  layout,
  isDraftShift,
  isBaselinePublished,
  isDraggingShiftId,
  isHiddenWhileDragging,
  isSelected,
  isContextMenuTarget,
  isPendingMove,
  dragEnabled,
  dragDisabledReason,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: WeekShiftCardProps) {
  const jobColor = getJobColorClasses(shift.job);
  const shiftDuration = shift.endHour - shift.startHour;
  const isSingleLayout = layout === 'single';
  const { leftPct, widthPct } = getShiftBarSegment(shift.startHour, shift.endHour);
  const barTrackColor = withAlpha(jobColor.color, '33');
  const barFillColor = withAlpha(jobColor.color, '66');
  const durationText = formatShiftDuration(shiftDuration);
  const draggableId = buildShiftDragId(shift.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    disabled: !dragEnabled,
  });
  const dragTransform = transform
    ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
    : undefined;
  const isActiveDragCard = isDragging || isDraggingShiftId;

  return (
    <div
      ref={setNodeRef}
      data-shift="true"
      data-shift-id={shift.id}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={() => {
        if (!dragEnabled && process.env.NODE_ENV !== 'production') {
          console.debug('[WeekView] drag disabled', { shiftId: shift.id, reason: dragDisabledReason ?? 'unknown' });
        }
      }}
      className={`relative z-20 flex min-h-0 h-full flex-col rounded-lg overflow-hidden transition-transform ${
        isSingleLayout ? 'flex-1 p-3 pb-12 text-[10px]' : 'flex-1 p-2.5 pb-11 text-[9px]'
      } ${
        dragEnabled ? 'cursor-grab hover:scale-[1.02] hover:shadow-sm' : 'cursor-pointer'
      } ${
        isDraftShift ? 'border border-amber-400/60 border-dashed' : ''
      } ${isBaselinePublished ? 'ring-1 ring-emerald-400/40' : ''} ${
        isActiveDragCard
          ? 'z-[999] opacity-90 pointer-events-none cursor-grabbing shadow-lg ring-1 ring-sky-300/70'
          : ''
      } ${
        isHiddenWhileDragging ? 'opacity-0 pointer-events-none' : ''
      } ${isPendingMove ? 'opacity-60' : ''} ${
        isContextMenuTarget
          ? 'ring-2 ring-amber-300/95 ring-offset-2 ring-offset-theme-timeline shadow-[0_0_0_1px_rgba(251,191,36,0.4)]'
          : isSelected
          ? 'ring-2 ring-sky-400/90 ring-offset-1 ring-offset-theme-timeline'
          : ''
      }`}
      style={{
        backgroundColor: jobColor.bgColor,
        borderLeft: `3px solid ${jobColor.color}`,
        color: jobColor.color,
        transform: dragTransform,
      }}
      title={`${shift.job ? shift.job + ' | ' : ''}${formatShiftTime(shift.startHour)} - ${formatShiftTime(shift.endHour)} (${Math.round(shiftDuration)}h)`}
      {...(dragEnabled ? attributes : {})}
      {...(dragEnabled ? listeners : {})}
    >
      <div
        data-resize-handle="start"
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-60"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      <div
        data-resize-handle="end"
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-60"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      {isDraftShift && (
        <span className="absolute top-0 right-0 px-1 rounded bg-amber-500/30 text-[7px] font-semibold text-amber-100/90">
          DRAFT
        </span>
      )}
      <div className={`${isSingleLayout ? 'space-y-1' : 'space-y-0.5'} min-w-0 flex-1 pr-6 flex flex-col items-start text-left leading-none select-none`}>
        <div className="min-w-0">
          <span className="text-[13px] font-semibold leading-tight truncate whitespace-nowrap overflow-hidden text-ellipsis block">
            {formatShiftTime(shift.startHour)}-{formatShiftTime(shift.endHour)}
          </span>
        </div>
        <div className="min-w-0 opacity-80">
          <span className="text-[11px] leading-tight truncate whitespace-nowrap overflow-hidden text-ellipsis block">
            {isSingleLayout ? toDisplayJobLabel(shift.job) : getJobAbbr(shift.job)}
          </span>
        </div>
      </div>
      <div className="absolute left-3 right-3 bottom-3">
        <div className={`flex justify-end font-semibold opacity-80 mb-1 leading-none ${isSingleLayout ? 'text-xs' : 'text-[10px]'}`}>
          {durationText}
        </div>
        <div className="relative h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: barTrackColor }}>
          <div
            className="absolute top-0 h-full rounded-full"
            style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: barFillColor }}
          />
        </div>
      </div>
    </div>
  );
}

type WeekShiftOverlayCardProps = {
  shift: Shift;
  isDraftShift: boolean;
  isBaselinePublished: boolean;
};

function WeekShiftOverlayCard({
  shift,
  isDraftShift,
  isBaselinePublished,
}: WeekShiftOverlayCardProps) {
  const jobColor = getJobColorClasses(shift.job);
  const shiftDuration = shift.endHour - shift.startHour;
  const { leftPct, widthPct } = getShiftBarSegment(shift.startHour, shift.endHour);
  const barTrackColor = withAlpha(jobColor.color, '33');
  const barFillColor = withAlpha(jobColor.color, '66');
  const durationText = formatShiftDuration(shiftDuration);

  return (
    <div
      className={`relative z-[9999] flex min-h-0 h-full flex-col rounded-lg p-3 pb-12 text-[10px] overflow-hidden opacity-95 pointer-events-none cursor-grabbing shadow-xl ring-1 ring-sky-300/80 ${
        isDraftShift ? 'border border-amber-400/60 border-dashed' : ''
      } ${isBaselinePublished ? 'ring-1 ring-emerald-400/40' : ''}`}
      style={{
        backgroundColor: jobColor.bgColor,
        borderLeft: `3px solid ${jobColor.color}`,
        color: jobColor.color,
      }}
      title={`${shift.job ? shift.job + ' | ' : ''}${formatShiftTime(shift.startHour)} - ${formatShiftTime(shift.endHour)} (${Math.round(shiftDuration)}h)`}
    >
      {isDraftShift && (
        <span className="absolute top-0 right-0 px-1 rounded bg-amber-500/30 text-[7px] font-semibold text-amber-100/90">
          DRAFT
        </span>
      )}
      <div className="space-y-1 min-w-0 flex-1 pr-6 flex flex-col items-start text-left leading-none select-none">
        <div className="min-w-0">
          <span className="font-semibold text-[13px] leading-tight truncate whitespace-nowrap overflow-hidden text-ellipsis block">
            {formatShiftTime(shift.startHour)}-{formatShiftTime(shift.endHour)}
          </span>
        </div>
        <div className="min-w-0 opacity-80">
          <span className="text-[11px] leading-tight truncate whitespace-nowrap overflow-hidden text-ellipsis block">{toDisplayJobLabel(shift.job)}</span>
        </div>
      </div>
      <div className="absolute left-3 right-3 bottom-3">
        <div className="flex justify-end text-xs font-semibold opacity-80 mb-1 leading-none">
          {durationText}
        </div>
        <div className="relative h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: barTrackColor }}>
          <div
            className="absolute top-0 h-full rounded-full"
            style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: barFillColor }}
          />
        </div>
      </div>
    </div>
  );
}

type WeekGridCellProps = {
  droppableId: string;
  disabledDrop: boolean;
  className: string;
  style?: React.CSSProperties;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: (event: React.MouseEvent<HTMLDivElement>) => void;
  isActiveCell: boolean;
  isContextMenuTarget: boolean;
  isDragOverCell: boolean;
  children: React.ReactNode;
};

function WeekGridCell({
  droppableId,
  disabledDrop,
  className,
  style,
  onClick,
  onMouseDown,
  onMouseUp,
  isActiveCell,
  isContextMenuTarget,
  isDragOverCell,
  children,
}: WeekGridCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    disabled: disabledDrop,
  });
  const showDropHighlight = (isOver || isDragOverCell) && !disabledDrop;

  return (
    <div
      ref={setNodeRef}
      data-cell-id={droppableId}
      className={`${className} ${showDropHighlight ? 'outline outline-2 outline-sky-400/70 bg-sky-500/10' : ''} ${
        isContextMenuTarget
          ? 'outline outline-2 outline-amber-300/95 bg-amber-400/15'
          : isActiveCell
          ? 'outline outline-2 outline-amber-400/80'
          : ''
      } h-full relative`}
      style={style}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      <div aria-hidden="true" className="absolute inset-0 z-10 pointer-events-auto" />
      <div className="relative z-20 h-full">{children}</div>
    </div>
  );
}

export function WeekView() {
  const {
    selectedDate,
    goToPrevious,
    goToNext,
    getEmployeesForRestaurant,
    getFilteredEmployeesForRestaurant,
    getShiftsForRestaurant,
    setSelectedDate,
    setViewMode,
    openModal,
    showToast,
    addShift,
    updateShift,
    deleteShift,
    loadRestaurantData,
    selectAllEmployeesForRestaurant,
    publishDraftRange,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
    hasOrgBlackoutOnDate,
    dateNavDirection,
    dateNavKey,
    getEffectiveHourRange,
    scheduleViewSettings,
    scheduleMode,
  } = useScheduleStore();

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const todayStr = dateToString(new Date());
  const isEditableDate = useCallback((dateStr: string) => dateStr >= todayStr, [todayStr]);
  const canEditDate = useCallback((dateStr: string) => isManager && isEditableDate(dateStr), [isManager, isEditableDate]);
  const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';
  const weekDates = getWeekDates(selectedDate, weekStartDay);
  const weekStartYmd = useMemo(() => dateToString(weekDates[0]), [weekDates]);
  const weekEndYmd = useMemo(() => dateToString(weekDates[6]), [weekDates]);
  const publishWeekLabel = useMemo(
    () => formatPublishWeekLabel(weekDates[0], weekDates[6]),
    [weekDates]
  );
  const filteredEmployees = getFilteredEmployeesForRestaurant(activeRestaurantId);
  const scopedEmployees = getEmployeesForRestaurant(activeRestaurantId);
  const scopedShifts = getShiftsForRestaurant(activeRestaurantId);
  const today = new Date();
  const hasDraftInWeek = useMemo(
    () =>
      scopedShifts.some(
        (shift) =>
          shift.scheduleState === 'draft' &&
          shift.date >= weekStartYmd &&
          shift.date <= weekEndYmd
      ),
    [scopedShifts, weekEndYmd, weekStartYmd]
  );
  const weekShiftCount = useMemo(
    () => scopedShifts.filter((shift) => shift.date >= weekStartYmd && shift.date <= weekEndYmd).length,
    [scopedShifts, weekEndYmd, weekStartYmd]
  );
  const publishStatusLabel = hasDraftInWeek ? 'DRAFT' : 'PUBLISHED';
  const statusTone = hasDraftInWeek ? 'bg-amber-500 text-zinc-900' : 'bg-emerald-500 text-white';
  const isDraftMode = scheduleMode === 'draft';
  const draftHelperText = 'Changes are not visible to staff until published.';
  const draftBadge = (
    <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-500/20 text-amber-500 text-[11px] font-semibold tracking-wide">
      DRAFT MODE
    </span>
  );
  const isPastWeek = weekEndYmd < todayStr;
  const publishWeekEnabled = isManager && hasDraftInWeek && !isPastWeek;
  const publishWeekDisabledReason = isPastWeek
    ? "Past schedules can't be published."
    : !hasDraftInWeek
    ? 'No draft changes'
    : undefined;
  const showCopyDraftWeek = isManager && isDraftMode && weekShiftCount === 0;

  // Refs for scroll syncing
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const weekGridRootRef = useRef<HTMLDivElement | null>(null);

  // Drag-to-scroll state
  const [isDragScrolling, setIsDragScrolling] = useState(false);
  const isDragScrollingRef = useRef(false);
  const dragScrollRef = useRef<{
    startX: number;
    scrollLeft: number;
  } | null>(null);

  const cellPointerRef = useRef<{ x: number; y: number; employeeId: string; date: string } | null>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'prev' | 'next' | null>(null);
  const [hoveredShiftId, setHoveredShiftId] = useState<string | null>(null);
  const [draggingShiftId, setDraggingShiftId] = useState<string | null>(null);
  const [dragOverCellId, setDragOverCellId] = useState<string | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [scheduleClipboard, setScheduleClipboard] = useState<ScheduleClipboard | null>(null);
  const [contextMenu, setContextMenu] = useState<ScheduleContextMenu | null>(null);
  const [contextMenuShiftHighlightId, setContextMenuShiftHighlightId] = useState<string | null>(null);
  const [contextMenuCellHighlightId, setContextMenuCellHighlightId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteShiftId, setConfirmDeleteShiftId] = useState<string | null>(null);
  const [confirmDeleteLoading, setConfirmDeleteLoading] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishEmailMode, setPublishEmailMode] = useState<PublishEmailMode>('all');
  const [publishConfirmLoading, setPublishConfirmLoading] = useState(false);
  const [optimisticShiftMoves, setOptimisticShiftMoves] = useState<Record<string, OptimisticShiftMove>>({});
  const [optimisticCreatedShifts, setOptimisticCreatedShifts] = useState<OptimisticCreatedShift[]>([]);
  const [optimisticDeletedShiftIds, setOptimisticDeletedShiftIds] = useState<string[]>([]);
  const [pendingMoveShiftIds, setPendingMoveShiftIds] = useState<string[]>([]);
  const [pasteJobPickerOpen, setPasteJobPickerOpen] = useState(false);
  const [pasteJobPickerEmployeeName, setPasteJobPickerEmployeeName] = useState('');
  const [pasteJobPickerOptions, setPasteJobPickerOptions] = useState<string[]>([]);
  const [pasteJobPickerSelectedJob, setPasteJobPickerSelectedJob] = useState('');
  const [dragOrigin, setDragOrigin] = useState<{
    shiftId: string;
    employeeId: string;
    date: string;
    startHour: number;
    endHour: number;
  } | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; originUserId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const pasteJobPickerResolveRef = useRef<((job: string | null) => void) | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );
  const collisionDetectionStrategy = useCallback((args: Parameters<typeof pointerWithin>[0]) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || !args.pointerCoordinates) return pointerWithin(args);
    const pointerY = args.pointerCoordinates.y;
    const deltaY = Math.abs(pointerY - dragStart.startY);
    if (deltaY >= CROSS_EMPLOYEE_Y_THRESHOLD_PX) {
      return pointerWithin(args);
    }
    const lockedContainers = args.droppableContainers.filter((container) => {
      const target = parseCellDropId(container.id);
      if (!target) return true;
      return target.userId === dragStart.originUserId;
    });
    if (lockedContainers.length === 0) {
      return pointerWithin(args);
    }
    return pointerWithin({
      ...args,
      droppableContainers: lockedContainers,
    });
  }, []);
  const sortableShiftIds = useMemo(
    () => scopedShifts.map((shift) => buildShiftDragId(shift.id)),
    [scopedShifts]
  );
  const displayShifts = useMemo(() => {
    const movedShifts = scopedShifts.map((shift) => {
      const move = optimisticShiftMoves[shift.id];
      if (!move) return shift;
      return {
        ...shift,
        employeeId: move.employeeId,
        date: move.date,
      };
    });
    const merged = [...movedShifts, ...optimisticCreatedShifts];
    if (optimisticDeletedShiftIds.length === 0) return merged;
    const hiddenIds = new Set(optimisticDeletedShiftIds);
    return merged.filter((shift) => !hiddenIds.has(shift.id));
  }, [optimisticCreatedShifts, optimisticDeletedShiftIds, optimisticShiftMoves, scopedShifts]);
  const confirmDeleteShift = useMemo(
    () => (confirmDeleteShiftId ? scopedShifts.find((shift) => shift.id === confirmDeleteShiftId) ?? null : null),
    [confirmDeleteShiftId, scopedShifts]
  );
  const confirmDeleteEmployeeName = useMemo(() => {
    if (!confirmDeleteShift) return 'Unknown';
    return filteredEmployees.find((employee) => employee.id === confirmDeleteShift.employeeId)?.name ?? 'Unknown';
  }, [confirmDeleteShift, filteredEmployees]);
  const activeDraggedShift = useMemo(
    () => (draggingShiftId ? displayShifts.find((shift) => shift.id === draggingShiftId) ?? null : null),
    [displayShifts, draggingShiftId],
  );
  const activeDraggedShiftIsDraft = Boolean(isManager && activeDraggedShift?.scheduleState === 'draft');
  const activeDraggedShiftIsBaselinePublished = Boolean(
    activeDraggedShift && scheduleMode === 'draft' && activeDraggedShift.scheduleState !== 'draft',
  );
  const scopedShiftIdSet = useMemo(
    () => new Set(scopedShifts.map((shift) => shift.id)),
    [scopedShifts],
  );

  // Weekly hours per employee for the displayed week
  const weeklyHours = useMemo(() => {
    const map: Record<string, number> = {};
    for (const shift of displayShifts) {
      if (shift.date >= weekStartYmd && shift.date <= weekEndYmd && !shift.isBlocked) {
        map[shift.employeeId] = (map[shift.employeeId] ?? 0) + (shift.endHour - shift.startHour);
      }
    }
    return map;
  }, [displayShifts, weekStartYmd, weekEndYmd]);

  const visibleEmployeeIdSet = useMemo(
    () => new Set(filteredEmployees.map((employee) => employee.id)),
    [filteredEmployees],
  );
  const staffCountByDate = useMemo(() => {
    const weekDateKeys = weekDates.map((date) => dateToString(date));
    const weekDateSet = new Set(weekDateKeys);
    const staffByDate = new Map<string, Set<string>>();
    for (const shift of displayShifts) {
      if (shift.isBlocked) continue;
      if (!shift.employeeId || shift.employeeId === 'unassigned') continue;
      if (!visibleEmployeeIdSet.has(shift.employeeId)) continue;
      const dateKey = shift.date;
      if (!weekDateSet.has(dateKey)) continue;
      let users = staffByDate.get(dateKey);
      if (!users) {
        users = new Set<string>();
        staffByDate.set(dateKey, users);
      }
      users.add(shift.employeeId);
    }
    const result: Record<string, number> = {};
    for (const dateKey of weekDateKeys) {
      result[dateKey] = staffByDate.get(dateKey)?.size ?? 0;
    }
    return result;
  }, [displayShifts, visibleEmployeeIdSet, weekDates]);

  // Employee list interspersed with job-title separator markers
  const employeeRowsWithSeparators = useMemo(() => {
    type EmployeeItem = (typeof filteredEmployees)[0];
    type Row =
      | { type: 'separator'; groupKey: string; groupLabel: string; color: string; bgColor: string }
      | { type: 'employee'; employee: EmployeeItem; groupLabel: string; groupColor: string; groupBgColor: string };
    const result: Row[] = [];

    const shiftJobCountsByEmployee = new Map<string, Map<string, number>>();
    for (const shift of displayShifts) {
      if (shift.isBlocked) continue;
      if (shift.date < weekStartYmd || shift.date > weekEndYmd) continue;
      const normalizedJob = shift.job?.trim().toLowerCase();
      if (!normalizedJob) continue;
      let counts = shiftJobCountsByEmployee.get(shift.employeeId);
      if (!counts) {
        counts = new Map<string, number>();
        shiftJobCountsByEmployee.set(shift.employeeId, counts);
      }
      counts.set(normalizedJob, (counts.get(normalizedJob) ?? 0) + 1);
    }

    const resolveGroupLabel = (employee: EmployeeItem) => {
      const employeeJobs = (employee.jobs ?? [])
        .map((job) => job.trim())
        .filter(Boolean);
      if (employeeJobs.length === 1) {
        return toDisplayJobLabel(employeeJobs[0]);
      }
      if (employeeJobs.length > 1) {
        const shiftCounts = shiftJobCountsByEmployee.get(employee.id);
        if (shiftCounts && shiftCounts.size > 0) {
          let topJob = employeeJobs[0];
          let topCount = getShiftCountForJob(shiftCounts, topJob);
          for (const job of employeeJobs.slice(1)) {
            const jobCount = getShiftCountForJob(shiftCounts, job);
            if (jobCount > topCount) {
              topJob = job;
              topCount = jobCount;
            }
          }
          if (topCount > 0) {
            return toDisplayJobLabel(topJob);
          }
        }
        return toDisplayJobLabel(employeeJobs[0]);
      }
      const shiftCounts = shiftJobCountsByEmployee.get(employee.id);
      if (shiftCounts && shiftCounts.size > 0) {
        const topShiftJob = Array.from(shiftCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (topShiftJob) {
          return toDisplayJobLabel(topShiftJob);
        }
      }
      return 'Other';
    };

    const employeesWithGroup = filteredEmployees
      .map((employee) => {
        const groupLabel = resolveGroupLabel(employee);
        const groupColor = getJobColorClasses(groupLabel);
        return {
          employee,
          groupLabel,
          groupKey: groupLabel.toLowerCase(),
          groupColorValue: groupColor.color,
          groupBgColor: groupColor.bgColor,
          sortRank: getJobGroupSortRank(groupLabel),
        };
      })
      .sort((a, b) => {
        if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
        const groupCompare = a.groupLabel.localeCompare(b.groupLabel);
        if (groupCompare !== 0) return groupCompare;
        return a.employee.name.localeCompare(b.employee.name);
      });

    let lastGroupKey: string | null = null;
    for (const item of employeesWithGroup) {
      if (item.groupKey !== lastGroupKey) {
        result.push({
          type: 'separator',
          groupKey: item.groupKey,
          groupLabel: item.groupLabel,
          color: item.groupColorValue,
          bgColor: item.groupBgColor,
        });
        lastGroupKey = item.groupKey;
      }
      result.push({
        type: 'employee',
        employee: item.employee,
        groupLabel: item.groupLabel,
        groupColor: item.groupColorValue,
        groupBgColor: item.groupBgColor,
      });
    }

    return result;
  }, [displayShifts, filteredEmployees, weekEndYmd, weekStartYmd]);

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setViewMode('day');
  };

  const handlePrevious = useCallback(() => goToPrevious(), [goToPrevious]);
  const handleNext = useCallback(() => goToNext(), [goToNext]);
  const handlePrevJump = useCallback(() => {
    const weekStart = getWeekStart(selectedDate, weekStartDay);
    weekStart.setDate(weekStart.getDate() - 28);
    setSelectedDate(weekStart);
  }, [selectedDate, setSelectedDate, weekStartDay]);
  const handleNextJump = useCallback(() => {
    const weekStart = getWeekStart(selectedDate, weekStartDay);
    weekStart.setDate(weekStart.getDate() + 28);
    setSelectedDate(weekStart);
  }, [selectedDate, setSelectedDate, weekStartDay]);
  const handleSelectDate = useCallback((date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    setSelectedDate(normalized);
  }, [setSelectedDate]);

  const openPublishConfirm = useCallback(() => {
    if (!publishWeekEnabled) return;
    setPublishEmailMode('all');
    setPublishConfirmOpen(true);
  }, [publishWeekEnabled]);

  const closePublishConfirm = useCallback(() => {
    if (publishConfirmLoading) return;
    setPublishConfirmOpen(false);
  }, [publishConfirmLoading]);

  const handleConfirmPublishWeek = useCallback(async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }

    setPublishConfirmLoading(true);
    try {
      const result = await publishDraftRange({ startDate: weekStartYmd, endDate: weekEndYmd });
      if (!result.success) {
        showToast(result.error || 'Unable to publish week.', 'error');
        return;
      }

      await loadRestaurantData(activeRestaurantId);
      showToast(`Published week ${publishWeekLabel}.`, 'success');

      if (publishEmailMode !== 'none') {
        const notifyResult = await apiFetch<PublishNotificationResponse>('/api/notifications/schedule-published', {
          method: 'POST',
          json: {
            organizationId: activeRestaurantId,
            scope: 'week',
            rangeStart: weekStartYmd,
            rangeEnd: weekEndYmd,
            mode: publishEmailMode,
          },
        });
        const emailFailed =
          !notifyResult.ok
          || !notifyResult.data?.ok
          || (typeof notifyResult.data?.failed === 'number' && notifyResult.data.failed > 0);
        if (emailFailed) {
          showToast('Published, but emails failed to send.', 'error');
        }
      }

      setPublishConfirmOpen(false);
    } finally {
      setPublishConfirmLoading(false);
    }
  }, [
    activeRestaurantId,
    loadRestaurantData,
    publishDraftRange,
    publishEmailMode,
    publishWeekLabel,
    showToast,
    weekEndYmd,
    weekStartYmd,
  ]);

  const handleCreateDraft = useCallback(async () => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const addDays = (dateStr: string, days: number) => {
      const date = new Date(`${dateStr}T00:00:00`);
      date.setDate(date.getDate() + days);
      return dateToString(date);
    };
    const sourceWeekStart = addDays(weekStartYmd, -7);
    const sourceWeekEnd = addDays(weekEndYmd, -7);
    const result = await apiFetch('/api/shifts/copy', {
      method: 'POST',
      json: {
        mode: 'nextWeek',
        sourceWeekStart,
        sourceWeekEnd,
        targetScheduleState: 'draft',
        sourceScheduleState: 'published',
      },
    });
    if (!result.ok) {
      showToast(result.error || 'Unable to create draft.', 'error');
      return;
    }
    await loadRestaurantData(activeRestaurantId);
    const { selectedEmployeeIds } = useScheduleStore.getState();
    if (!selectedEmployeeIds.length) {
      selectAllEmployeesForRestaurant(activeRestaurantId);
    }
    showToast('Draft schedule created.', 'success');
  }, [activeRestaurantId, loadRestaurantData, selectAllEmployeesForRestaurant, showToast, weekEndYmd, weekStartYmd]);

  const publishDisabledReason = isManager ? undefined : 'Only managers can publish.';
  const canUseCopyPaste = isManager && Boolean(activeRestaurantId);
  const hasUsableClipboard = Boolean(
    scheduleClipboard && Date.now() - scheduleClipboard.copiedAt <= CLIPBOARD_MAX_AGE_MS
  );

  const updateSessionClipboard = useCallback((clipboard: ScheduleClipboard | null) => {
    setScheduleClipboard(clipboard);
    if (typeof window === 'undefined') return;
    if (!clipboard) {
      window.sessionStorage.removeItem(SCHEDULE_CLIPBOARD_KEY);
      return;
    }
    window.sessionStorage.setItem(SCHEDULE_CLIPBOARD_KEY, JSON.stringify(clipboard));
  }, []);

  const handleShiftEdit = useCallback((shift: Shift) => {
    if (shift.isBlocked) return;
    if (!canEditDate(shift.date)) {
      showToast("Past schedules can't be edited.", 'error');
      return;
    }
    openModal('editShift', shift);
  }, [canEditDate, openModal, showToast]);

  const handleShiftCardClick = useCallback((shift: Shift, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (shift.isBlocked) return;
    setContextMenu(null);
    setContextMenuShiftHighlightId(null);
    setContextMenuCellHighlightId(null);
    setSelectedShiftId(shift.id);
  }, []);

  const handleCopyShiftToClipboard = useCallback((sourceShiftId?: string | null) => {
    if (!canUseCopyPaste || !activeRestaurantId) {
      showToast('Not permitted', 'error');
      return;
    }
    const effectiveShiftId = sourceShiftId ?? selectedShiftId;
    if (!effectiveShiftId) {
      showToast('Select a shift first', 'error');
      return;
    }
    const sourceShift = displayShifts.find((shift) => shift.id === effectiveShiftId);
    if (!sourceShift) {
      showToast('Select a shift first', 'error');
      return;
    }
    const job = String(sourceShift.job ?? '').trim();
    if (!job) {
      showToast('Shift is missing a job', 'error');
      return;
    }

    const clipboard: ScheduleClipboard = {
      copiedAt: Date.now(),
      sourceOrgId: activeRestaurantId,
      template: {
        shiftId: sourceShift.id,
        sourceUserId: sourceShift.employeeId,
        startHour: sourceShift.startHour,
        endHour: sourceShift.endHour,
        job,
        locationId: sourceShift.locationId ?? null,
        notes: sourceShift.notes ?? '',
      },
    };

    updateSessionClipboard(clipboard);
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      const savedRaw = window.sessionStorage.getItem(SCHEDULE_CLIPBOARD_KEY);
      let savedClipboard: unknown = null;
      try {
        savedClipboard = savedRaw ? JSON.parse(savedRaw) : null;
      } catch {
        savedClipboard = savedRaw;
      }
      console.debug('[week-copy] clipboard-saved', {
        sourceShiftId: sourceShift.id,
        clipboard,
        savedClipboard,
      });
    }
    showToast('Shift copied', 'success');
  }, [activeRestaurantId, canUseCopyPaste, displayShifts, selectedShiftId, showToast, updateSessionClipboard]);

  const resolvePasteJobPicker = useCallback((job: string | null) => {
    const resolver = pasteJobPickerResolveRef.current;
    pasteJobPickerResolveRef.current = null;
    setPasteJobPickerOpen(false);
    setPasteJobPickerEmployeeName('');
    setPasteJobPickerOptions([]);
    setPasteJobPickerSelectedJob('');
    if (resolver) resolver(job);
  }, []);

  const requestPasteJobSelection = useCallback((options: string[], employeeName: string) => {
    const normalizedOptions = options
      .map((option) => String(option ?? '').trim())
      .filter(Boolean);

    if (normalizedOptions.length === 0) {
      return Promise.resolve<string | null>(null);
    }

    if (pasteJobPickerResolveRef.current) {
      pasteJobPickerResolveRef.current(null);
      pasteJobPickerResolveRef.current = null;
    }

    setPasteJobPickerEmployeeName(employeeName);
    setPasteJobPickerOptions(normalizedOptions);
    setPasteJobPickerSelectedJob(normalizedOptions[0]);
    setPasteJobPickerOpen(true);

    return new Promise<string | null>((resolve) => {
      pasteJobPickerResolveRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pasteJobPickerResolveRef.current) {
        pasteJobPickerResolveRef.current(null);
        pasteJobPickerResolveRef.current = null;
      }
    };
  }, []);

  const handlePasteShiftFromClipboard = useCallback(async (targetCellId?: string | null) => {
    if (!canUseCopyPaste || !activeRestaurantId) {
      showToast('Not permitted', 'error');
      return;
    }
    const effectiveCellId = targetCellId ?? activeCellId;
    if (!effectiveCellId) {
      showToast('Paste failed: Click a cell to choose where to paste', 'error');
      return;
    }
    const targetCell = parseCellDropId(effectiveCellId);
    if (!targetCell || targetCell.userId === 'unassigned') {
      showToast('Paste failed: invalid target cell', 'error');
      return;
    }
    if (!canEditDate(targetCell.date)) {
      showToast("Paste failed: Past schedules can't be edited.", 'error');
      return;
    }
    if (targetCell.organizationId !== activeRestaurantId) {
      showToast('Paste failed: Not permitted', 'error');
      return;
    }

    if (!scheduleClipboard) {
      showToast('Nothing to paste', 'error');
      return;
    }
    const clipboardAgeMs = Date.now() - scheduleClipboard.copiedAt;
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[week-paste] before-paste', {
        activeCellId,
        targetCellId: effectiveCellId,
        parsedTargetCell: targetCell,
        clipboardAgeMs,
        clipboard: scheduleClipboard,
      });
    }
    if (Date.now() - scheduleClipboard.copiedAt > CLIPBOARD_MAX_AGE_MS) {
      updateSessionClipboard(null);
      showToast('Nothing to paste', 'error');
      return;
    }
    if (scheduleClipboard.sourceOrgId !== activeRestaurantId) {
      showToast('Not permitted', 'error');
      return;
    }

    const template = scheduleClipboard.template;
    if (
      !template
      || !String(template.job ?? '').trim()
      || !Number.isFinite(template.startHour)
      || !Number.isFinite(template.endHour)
      || template.startHour >= template.endHour
    ) {
      showToast('Paste failed: clipboard template is incomplete', 'error');
      return;
    }
    const sourceUserId = String(template.sourceUserId ?? '').trim()
      || displayShifts.find((shift) => String(shift.id) === String(template.shiftId))?.employeeId
      || '';
    const targetEmployeeName =
      scopedEmployees.find((employee) => employee.id === targetCell.userId)?.name ?? 'This employee';
    const jobResolution = resolvePasteJob({
      targetUserId: targetCell.userId,
      sourceUserId,
      copiedJob: template.job,
      employees: scopedEmployees,
    });
    let resolvedJob = template.job;
    if (jobResolution.mode === 'auto') {
      resolvedJob = jobResolution.job;
    } else if (jobResolution.mode === 'pick') {
      const selectedJob = await requestPasteJobSelection(
        jobResolution.options.map((option) => option.name),
        targetEmployeeName,
      );
      if (!selectedJob) return;
      resolvedJob = selectedJob;
    } else {
      resolvedJob = jobResolution.job;
      showToast('Employee has no job set; using copied job.', 'error');
    }

    const tempId = `optimistic-paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticShift: Shift = {
      id: tempId,
      employeeId: targetCell.userId,
      restaurantId: activeRestaurantId,
      date: targetCell.date,
      startHour: template.startHour,
      endHour: template.endHour,
      notes: template.notes,
      job: resolvedJob,
      locationId: template.locationId ?? null,
      isBlocked: false,
      scheduleState: scheduleMode,
    };

    setOptimisticCreatedShifts((prev) => [...prev, optimisticShift]);

    try {
      const result = await addShift({
        employeeId: targetCell.userId,
        restaurantId: activeRestaurantId,
        date: targetCell.date,
        startHour: template.startHour,
        endHour: template.endHour,
        notes: template.notes,
        isBlocked: false,
        job: resolvedJob,
        locationId: template.locationId ?? null,
        scheduleState: scheduleMode,
      });

      setOptimisticCreatedShifts((prev) => prev.filter((shift) => shift.id !== tempId));

      if (!result.success) {
        showToast(`Paste failed: ${result.error ?? 'Unknown error'}`, 'error');
        return;
      }
      showToast('Shift pasted', 'success');
    } catch (error) {
      setOptimisticCreatedShifts((prev) => prev.filter((shift) => shift.id !== tempId));
      const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : JSON.stringify(error);
      showToast(`Paste failed: ${message}`, 'error');
    }
  }, [
    activeCellId,
    activeRestaurantId,
    addShift,
    canEditDate,
    canUseCopyPaste,
    displayShifts,
    requestPasteJobSelection,
    scheduleClipboard,
    scheduleMode,
    scopedEmployees,
    showToast,
    updateSessionClipboard,
  ]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setContextMenuShiftHighlightId(null);
    setContextMenuCellHighlightId(null);
  }, []);

  const openShiftContextMenu = useCallback((x: number, y: number, shiftId: string) => {
    setSelectedShiftId(shiftId);
    setContextMenuShiftHighlightId(shiftId);
    setContextMenuCellHighlightId(null);
    setContextMenu({
      x,
      y,
      type: 'shift',
      shiftId,
    });
  }, []);

  const openCellContextMenu = useCallback((x: number, y: number, cellId: string) => {
    setActiveCellId(cellId);
    setContextMenuCellHighlightId(cellId);
    setContextMenuShiftHighlightId(null);
    setContextMenu({
      x,
      y,
      type: 'cell',
      cellId,
    });
  }, []);

  const handleContextCopyShift = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'shift' || !contextMenu.shiftId) return;
    handleCopyShiftToClipboard(contextMenu.shiftId);
    closeContextMenu();
  }, [closeContextMenu, contextMenu, handleCopyShiftToClipboard]);

  const handleContextPasteShift = useCallback(async () => {
    if (!contextMenu || contextMenu.type !== 'cell' || !contextMenu.cellId) return;
    const cellId = contextMenu.cellId;
    setActiveCellId(cellId);
    closeContextMenu();
    await handlePasteShiftFromClipboard(cellId);
  }, [closeContextMenu, contextMenu, handlePasteShiftFromClipboard]);

  const handleContextDeleteShift = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'shift' || !contextMenu.shiftId) return;
    closeContextMenu();
    setConfirmDeleteShiftId(contextMenu.shiftId);
    setConfirmDeleteOpen(true);
    setConfirmDeleteLoading(false);
  }, [closeContextMenu, contextMenu]);

  const closeConfirmDelete = useCallback(() => {
    if (confirmDeleteLoading) return;
    setConfirmDeleteOpen(false);
    setConfirmDeleteShiftId(null);
  }, [confirmDeleteLoading]);

  const handleConfirmDeleteShift = useCallback(async () => {
    const shiftId = confirmDeleteShiftId;
    if (!shiftId) return;
    if (!isManager) {
      showToast('Not permitted', 'error');
      return;
    }
    setConfirmDeleteLoading(true);
    setOptimisticDeletedShiftIds((prev) => (prev.includes(shiftId) ? prev : [...prev, shiftId]));

    try {
      const result = await deleteShift(shiftId);
      if (!result.success) {
        setOptimisticDeletedShiftIds((prev) => prev.filter((id) => id !== shiftId));
        showToast(`Delete failed: ${result.error ?? 'Unknown error'}`, 'error');
        return;
      }
      setOptimisticDeletedShiftIds((prev) => prev.filter((id) => id !== shiftId));
      showToast('Shift deleted', 'success');
      setConfirmDeleteOpen(false);
      setConfirmDeleteShiftId(null);
    } catch (error) {
      setOptimisticDeletedShiftIds((prev) => prev.filter((id) => id !== shiftId));
      const message = error instanceof Error ? error.message : String(error);
      showToast(`Delete failed: ${message}`, 'error');
    } finally {
      setConfirmDeleteLoading(false);
    }
  }, [confirmDeleteShiftId, deleteShift, isManager, showToast]);

  const showDevDropToast = useCallback((message: string) => {
    if (process.env.NODE_ENV !== 'production') {
      showToast(message, 'error');
    }
  }, [showToast]);

  const markShiftMovePending = useCallback((shiftId: string, pending: boolean) => {
    setPendingMoveShiftIds((prev) => {
      if (pending) {
        if (prev.includes(shiftId)) return prev;
        return [...prev, shiftId];
      }
      return prev.filter((id) => id !== shiftId);
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragTarget = parseShiftDragId(event.active.id);
    if (!dragTarget) return;
    setDraggingShiftId(dragTarget.shiftId);
    if (process.env.NODE_ENV !== 'production') {
      showToast('Drag start', 'success');
    }
    const sourceShift = scopedShifts.find((shift) => shift.id === dragTarget.shiftId);
    if (sourceShift) {
      setDragOrigin({
        shiftId: sourceShift.id,
        employeeId: sourceShift.employeeId,
        date: sourceShift.date,
        startHour: sourceShift.startHour,
        endHour: sourceShift.endHour,
      });
    } else {
      setDragOrigin(null);
    }
    const point = getClientPointFromEvent(event.activatorEvent);
    dragStartRef.current = {
      startX: point?.x ?? 0,
      startY: point?.y ?? 0,
      originUserId: sourceShift?.employeeId ?? '',
    };
  }, [scopedShifts, showToast]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const dropTarget = parseCellDropId(event.over?.id);
    if (!dropTarget) {
      setDragOverCellId(null);
      return;
    }
    setDragOverCellId(buildCellDropId(dropTarget.organizationId, dropTarget.userId, dropTarget.date));
  }, []);

  const clearDragIndicators = useCallback(() => {
    setDraggingShiftId(null);
    setDragOverCellId(null);
    setDragOrigin(null);
    dragStartRef.current = null;
  }, []);

  const handleDragCancel = useCallback(() => {
    clearDragIndicators();
  }, [clearDragIndicators]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const dragTarget = parseShiftDragId(event.active.id);
    const overId = event.over?.id ?? null;
    const dropTarget = parseCellDropId(overId);
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[week-dnd] drag-end', {
        activeId: String(event.active.id ?? ''),
        overId: overId ? String(overId) : null,
        parsedDropTarget: dropTarget,
      });
    }
    clearDragIndicators();
    if (!dragTarget) {
      showDevDropToast('No drop target detected');
      return;
    }
    if (!event.over || !dropTarget) {
      showDevDropToast('No drop target detected');
      return;
    }
    if (dropTarget.userId === 'unassigned') {
      showDevDropToast('Drop target invalid (unassigned)');
      return;
    }
    if (!isManager || !activeRestaurantId) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      return;
    }
    if (dropTarget.organizationId !== activeRestaurantId) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      return;
    }

    const sourceShift = scopedShifts.find((shift) => shift.id === dragTarget.shiftId);
    if (!sourceShift) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      return;
    }
    const allowCrossEmployee = Math.abs(event.delta.y) >= CROSS_EMPLOYEE_Y_THRESHOLD_PX;
    const targetUserId = allowCrossEmployee ? dropTarget.userId : sourceShift.employeeId;
    if (!canEditDate(sourceShift.date) || !canEditDate(dropTarget.date)) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      showToast("Past schedules can't be edited.", 'error');
      return;
    }
    if (pendingMoveShiftIds.includes(sourceShift.id)) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      return;
    }

    const targetHasTimeOff = hasApprovedTimeOff(targetUserId, dropTarget.date);
    if (targetHasTimeOff) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      showToast('Employee has approved time off on this date', 'error');
      return;
    }
    const targetHasBlockedShift = hasBlockedShiftOnDate(targetUserId, dropTarget.date);
    if (targetHasBlockedShift) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      showToast('This employee is blocked out on that date', 'error');
      return;
    }
    if (hasOrgBlackoutOnDate(dropTarget.date)) {
      showDevDropToast('Drop blocked (permissions/date/etc.)');
      showToast('Organization blackout day cannot receive shifts.', 'error');
      return;
    }

    const sameCell = sourceShift.employeeId === targetUserId && sourceShift.date === dropTarget.date;
    if (sameCell) return;

    const previousMove = optimisticShiftMoves[sourceShift.id];
    const duration = sourceShift.endHour - sourceShift.startHour;
    const nextStartHour = sourceShift.startHour;
    const nextEndHour = nextStartHour + duration;

    setOptimisticShiftMoves((prev) => ({
      ...prev,
      [sourceShift.id]: {
        employeeId: targetUserId,
        date: dropTarget.date,
      },
    }));
    markShiftMovePending(sourceShift.id, true);

    const result = await updateShift(sourceShift.id, {
      employeeId: targetUserId,
      date: dropTarget.date,
      startHour: nextStartHour,
      endHour: nextEndHour,
    });

    markShiftMovePending(sourceShift.id, false);

    if (!result.success) {
      setOptimisticShiftMoves((prev) => {
        const next = { ...prev };
        if (previousMove) {
          next[sourceShift.id] = previousMove;
        } else {
          delete next[sourceShift.id];
        }
        return next;
      });
      showToast(result.error || 'Unable to move shift.', 'error');
      return;
    }

    setOptimisticShiftMoves((prev) => {
      const next = { ...prev };
      delete next[sourceShift.id];
      return next;
    });
  }, [
    activeRestaurantId,
    canEditDate,
    clearDragIndicators,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
    hasOrgBlackoutOnDate,
    isManager,
    markShiftMovePending,
    optimisticShiftMoves,
    pendingMoveShiftIds,
    scopedShifts,
    showDevDropToast,
    showToast,
    updateShift,
  ]);

  // Drag-to-scroll handlers
  const handleGridDragStart = useCallback((clientX: number) => {
    if (!gridScrollRef.current) return;
    isDragScrollingRef.current = true;
    setIsDragScrolling((prev) => (prev ? prev : true));
    dragScrollRef.current = {
      startX: clientX,
      scrollLeft: gridScrollRef.current.scrollLeft,
    };
  }, []);

  const handleGridDragMove = useCallback((clientX: number) => {
    if (!isDragScrolling || !dragScrollRef.current || !gridScrollRef.current) return;
    const dx = clientX - dragScrollRef.current.startX;
    gridScrollRef.current.scrollLeft = dragScrollRef.current.scrollLeft - dx;
  }, [isDragScrolling]);

  const handleGridDragEnd = useCallback(() => {
    if (!isDragScrollingRef.current && !dragScrollRef.current) return;
    isDragScrollingRef.current = false;
    dragScrollRef.current = null;
    setIsDragScrolling((prev) => (prev ? false : prev));
  }, []);

  const handleGridMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button !== 0) return;
    handleGridDragStart(e.clientX);
  };

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (isDragScrolling) {
      handleGridDragMove(e.clientX);
    }
  };

  const handleGridMouseUp = () => {
    handleGridDragEnd();
  };

  const handleGridMouseLeave = () => {
    if (!isDragScrollingRef.current && !dragScrollRef.current) return;
    handleGridDragEnd();
  };

  // Touch handlers for drag-to-scroll
  const handleGridTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const touch = e.touches[0];
    if (!touch) return;
    handleGridDragStart(touch.clientX);
  };

  const handleGridTouchMove = (e: React.TouchEvent) => {
    if (isDragScrolling) {
      const touch = e.touches[0];
      if (!touch) return;
      handleGridDragMove(touch.clientX);
    }
  };

  const handleGridTouchEnd = () => {
    handleGridDragEnd();
  };

  const handleGridScroll = useCallback(() => {
    if (contextMenu) {
      closeContextMenu();
    }
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    if (!dateNavDirection) return;
    const startTimer = setTimeout(() => {
      setSlideDirection(dateNavDirection);
      setIsSliding(true);
    }, 0);
    const timeout = setTimeout(() => setIsSliding(false), 220);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(timeout);
    };
  }, [dateNavKey, dateNavDirection]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawClipboard = window.sessionStorage.getItem(SCHEDULE_CLIPBOARD_KEY);
    if (!rawClipboard) return;
    try {
      const parsed = JSON.parse(rawClipboard) as ScheduleClipboard;
      const hasValidTemplate = Boolean(parsed?.template?.job)
        && Number.isFinite(parsed?.template?.startHour)
        && Number.isFinite(parsed?.template?.endHour);
      const copiedAt = Number(parsed?.copiedAt);
      if (!hasValidTemplate || !Number.isFinite(copiedAt)) {
        window.sessionStorage.removeItem(SCHEDULE_CLIPBOARD_KEY);
        return;
      }
      if (Date.now() - copiedAt > CLIPBOARD_MAX_AGE_MS) {
        window.sessionStorage.removeItem(SCHEDULE_CLIPBOARD_KEY);
        return;
      }
      setScheduleClipboard(parsed);
    } catch {
      window.sessionStorage.removeItem(SCHEDULE_CLIPBOARD_KEY);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isKeyboardInputTarget(event.target)) return;
      const hasShortcutModifier = event.ctrlKey || event.metaKey;
      if (!hasShortcutModifier) return;
      const key = event.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return;

      event.preventDefault();
      if (!canUseCopyPaste) {
        showToast('Not permitted', 'error');
        return;
      }
      if (key === 'c') {
        handleCopyShiftToClipboard();
        return;
      }
      void handlePasteShiftFromClipboard();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUseCopyPaste, handleCopyShiftToClipboard, handlePasteShiftFromClipboard, showToast]);

  useEffect(() => {
    const root = weekGridRootRef.current;
    if (!root) return;

    const handleContextMenuCapture = (event: MouseEvent) => {
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      if (!target) {
        closeContextMenu();
        return;
      }
      const shiftEl = target.closest('[data-shift-id]') as HTMLElement | null;
      if (shiftEl) {
        const shiftId = shiftEl.getAttribute('data-shift-id');
        if (shiftId) {
          openShiftContextMenu(event.clientX, event.clientY, shiftId);
          return;
        }
      }
      const cellEl = target.closest('[data-cell-id]') as HTMLElement | null;
      if (cellEl) {
        const cellId = cellEl.getAttribute('data-cell-id');
        if (cellId) {
          openCellContextMenu(event.clientX, event.clientY, cellId);
          return;
        }
      }
      closeContextMenu();
    };

    root.addEventListener('contextmenu', handleContextMenuCapture, true);
    return () => {
      root.removeEventListener('contextmenu', handleContextMenuCapture, true);
    };
  }, [closeContextMenu, openCellContextMenu, openShiftContextMenu]);

  useEffect(() => {
    if (!contextMenu) return;

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!contextMenuRef.current) return;
      if (contextMenuRef.current.contains(event.target as Node)) return;
      closeContextMenu();
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    const handleAnyScroll = () => {
      closeContextMenu();
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    window.addEventListener('keydown', handleDocumentKeyDown);
    window.addEventListener('scroll', handleAnyScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      window.removeEventListener('keydown', handleDocumentKeyDown);
      window.removeEventListener('scroll', handleAnyScroll, true);
    };
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    isDragScrollingRef.current = isDragScrolling;
  }, [isDragScrolling]);

  useEffect(() => {
    setOptimisticShiftMoves((prev) => {
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === 0) return prev;
      let changed = false;
      const next: typeof prev = {};
      for (const shiftId of prevKeys) {
        if (scopedShiftIdSet.has(shiftId)) {
          next[shiftId] = prev[shiftId];
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setOptimisticDeletedShiftIds((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next: string[] = [];
      for (const shiftId of prev) {
        if (scopedShiftIdSet.has(shiftId)) {
          next.push(shiftId);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setPendingMoveShiftIds((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next: string[] = [];
      for (const shiftId of prev) {
        if (scopedShiftIdSet.has(shiftId)) {
          next.push(shiftId);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setSelectedShiftId((prev) => {
      if (!prev) return prev;
      return displayShifts.some((shift) => shift.id === prev) ? prev : null;
    });
  }, [displayShifts, scopedShiftIdSet]);

  const handleCellClick = useCallback((employeeId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    if (!activeRestaurantId) return;
    setContextMenu(null);
    setContextMenuShiftHighlightId(null);
    setContextMenuCellHighlightId(null);
    setActiveCellId(buildCellDropId(activeRestaurantId, employeeId, date));
  }, [activeRestaurantId]);

  const handleCellMouseDown = (employeeId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEditDate(date)) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) return;
    if (selectedShiftId && !scheduleClipboard) {
      setSelectedShiftId(null);
    }
    cellPointerRef.current = { x: e.clientX, y: e.clientY, employeeId, date };
  };

  const handleCellMouseUp = (employeeId: string, date: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEditDate(date)) {
      showToast("Past schedules can't be edited.", 'error');
      return;
    }
    if (!cellPointerRef.current) return;
    if ((e.target as HTMLElement).closest('[data-shift]')) {
      cellPointerRef.current = null;
      return;
    }
    const dx = e.clientX - cellPointerRef.current.x;
    const dy = e.clientY - cellPointerRef.current.y;
    const distance = Math.hypot(dx, dy);
    cellPointerRef.current = null;
    if (distance > 6) return;
    if (selectedShiftId && Boolean(scheduleClipboard)) return;

    // Get effective hour range for this day
    const clickDate = new Date(date);
    const { startHour: HOURS_START, endHour: HOURS_END } = getEffectiveHourRange(clickDate.getDay());
    const TOTAL_HOURS = HOURS_END - HOURS_START;

    const rect = e.currentTarget.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const rawHour = HOURS_START + percentage * TOTAL_HOURS;
    const startHour = Math.max(HOURS_START, Math.min(HOURS_END, Math.round(rawHour * 4) / 4));
    const endHour = Math.min(HOURS_END, Math.round((startHour + 2) * 4) / 4);
    const hasOverlap = displayShifts.some(
      (shift) =>
        shift.employeeId === employeeId &&
        shift.date === date &&
        !shift.isBlocked &&
        shiftsOverlap(startHour, endHour, shift.startHour, shift.endHour)
    );
    if (hasOverlap) {
      showToast('Shift overlaps with existing shift', 'error');
      return;
    }

    openModal('addShift', {
      employeeId,
      date,
      startHour,
      endHour,
    });
  };

  const isPasteMenuDisabled = !canUseCopyPaste || !hasUsableClipboard;
  const pasteMenuTitle = !hasUsableClipboard ? 'Nothing to paste' : !canUseCopyPaste ? 'Not permitted' : undefined;
  const weekRowGridColsClass = '[grid-template-columns:9rem_repeat(7,minmax(0,1fr))_3.5rem]';

  return (
    <div className="flex-1 flex flex-col bg-theme-timeline overflow-hidden transition-theme">
      <ScheduleToolbar
        viewMode="week"
        selectedDate={selectedDate}
        weekStartDay={weekStartDay}
        onPrev={handlePrevious}
        onNext={handleNext}
        onPrevJump={handlePrevJump}
        onNextJump={handleNextJump}
        onSelectDate={handleSelectDate}
        onViewModeChange={setViewMode}
        showPublish={isManager}
        publishWeekEnabled={publishWeekEnabled}
        onPublishWeek={openPublishConfirm}
        publishDisabledReason={publishDisabledReason}
        publishWeekDisabledReason={publishWeekDisabledReason}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {isDraftMode && (
          <div className="shrink-0 border-b border-theme-primary bg-theme-secondary/95 backdrop-blur px-2 sm:px-4 py-2 sm:h-12 overflow-x-auto">
            <div className="flex items-center justify-between gap-4 min-w-max">
              <div className="flex items-center gap-2">
                {draftBadge}
                <span className="text-[11px] text-theme-muted whitespace-nowrap">{draftHelperText}</span>
              </div>

              <div className="w-[300px] flex items-center justify-end">
                {showCopyDraftWeek ? (
                  <button
                    type="button"
                    onClick={handleCreateDraft}
                    className="w-[300px] h-[40px] flex items-center gap-1.5 px-3 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-xs sm:text-sm font-medium"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span className="truncate">Copy last published week into draft</span>
                  </button>
                ) : (
                  <div className="w-[300px] h-[40px] invisible" />
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={weekGridRootRef} className="flex-1 overflow-hidden relative">
          <div
            ref={gridScrollRef}
            className={`h-full overflow-x-hidden overflow-y-auto ${isDragScrolling ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ scrollBehavior: isDragScrolling ? 'auto' : 'smooth' }}
            onMouseDown={handleGridMouseDown}
            onMouseMove={handleGridMouseMove}
            onMouseUp={handleGridMouseUp}
            onMouseLeave={handleGridMouseLeave}
            onTouchStart={handleGridTouchStart}
            onTouchMove={handleGridTouchMove}
            onTouchEnd={handleGridTouchEnd}
            onTouchCancel={handleGridTouchEnd}
            onScroll={handleGridScroll}
          >
            <div
              className={`flex flex-col h-max min-h-full transition-transform transition-opacity duration-200 ${
                isSliding
                  ? slideDirection === 'next'
                    ? '-translate-x-2 opacity-90'
                    : 'translate-x-2 opacity-90'
                  : 'translate-x-0 opacity-100'
              }`}
            >
              <div
                className={`h-12 border-b border-theme-primary grid ${weekRowGridColsClass} shrink-0 sticky top-0 z-30`}
                style={{ backgroundColor: '#f6f7fb' }}
              >
                <div className={`border-r border-theme-primary/50 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>
                  {publishStatusLabel}
                </div>
                {weekDates.map((date) => {
                  const isToday = isSameDay(date, today);
                  const isSelected = isSameDay(date, selectedDate);

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => handleDayClick(date)}
                      className={`border-r border-theme-primary/50 flex flex-col items-center justify-center transition-colors ${
                        isToday
                          ? 'bg-amber-500/10'
                          : isSelected
                          ? 'bg-theme-hover'
                          : 'hover:bg-theme-hover/50'
                      }`}
                    >
                      <span className={`text-[10px] font-medium ${
                        isToday ? 'text-amber-500' : 'text-theme-muted'
                      }`}>
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className={`text-xs font-semibold ${
                        isToday ? 'text-amber-500' : 'text-theme-secondary'
                      }`}>
                        {date.getDate()}
                      </span>
                    </button>
                  );
                })}
                <div className="border-l border-theme-primary/30 flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-theme-muted uppercase tracking-wide">Hrs</span>
                </div>
              </div>

              <div
                className={`h-6 border-b border-theme-primary/30 grid ${weekRowGridColsClass} shrink-0 sticky top-12 z-30`}
                style={{ backgroundColor: '#f6f7fb' }}
              >
                <div className="border-r border-theme-primary/30 flex items-center px-2">
                  <span className="text-[9px] font-semibold text-theme-muted uppercase tracking-wide">Coverage</span>
                </div>
                {weekDates.map((date) => {
                  const dateStr = dateToString(date);
                  const count = staffCountByDate[dateStr] ?? 0;
                  const coverageColor =
                    count >= 5 ? '#10b981' :
                    count >= 3 ? '#f59e0b' :
                    count >= 1 ? '#ef4444' :
                    null;
                  return (
                    <div
                      key={date.toISOString()}
                      className="border-r border-theme-primary/30 flex items-center justify-center"
                      style={{
                        backgroundColor: coverageColor ? `${coverageColor}18` : undefined,
                      }}
                    >
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span
                          aria-hidden="true"
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: coverageColor ?? '#9ca3af' }}
                        />
                        <span
                          className={`text-[9px] font-bold tabular-nums ${
                            count > 0 ? '' : 'text-theme-muted'
                          }`}
                          style={{ color: count > 0 ? coverageColor ?? undefined : undefined }}
                        >
                          {count} staff
                        </span>
                      </span>
                    </div>
                  );
                })}
                <div className="border-l border-theme-primary/30 bg-theme-secondary/40" />
              </div>

              <SortableContext items={sortableShiftIds}>
                <div className="flex-1">
                  {filteredEmployees.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-theme-muted">
                      <div className="text-center">
                        <p className="text-sm font-medium mb-1">No staff selected</p>
                        <p className="text-xs">Use the sidebar to select employees</p>
                      </div>
                    </div>
                  ) : (
                    employeeRowsWithSeparators.map((row) => {
                      if (row.type === 'separator') {
                        return (
                          <div
                            key={`grid-sep-${row.groupKey}`}
                            className="h-6 border-b border-theme-primary/20 flex items-center px-3 gap-2"
                            style={{ backgroundColor: row.bgColor }}
                          >
                            <div className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                            <span className="text-[9px] font-semibold uppercase tracking-wider truncate" style={{ color: row.color }}>
                              {row.groupLabel}
                            </span>
                          </div>
                        );
                      }

                      const employee = row.employee;
                      const hrs = weeklyHours[employee.id] ?? 0;
                      const isOvertime = hrs > 40;

                      return (
                        <div
                          key={employee.id}
                          className={`grid ${weekRowGridColsClass} h-[84px] border-b border-theme-primary/50 hover:bg-theme-hover/30 transition-colors group`}
                        >
                          <div className="border-r border-theme-primary/30 h-full flex items-center gap-2 px-2 bg-theme-timeline">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                              style={{
                                backgroundColor: row.groupBgColor,
                                color: row.groupColor,
                              }}
                            >
                              {employee.name.split(' ').map((n) => n[0]).join('')}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-theme-primary truncate">
                                {employee.name}
                              </p>
                            </div>
                          </div>

                          {weekDates.map((date) => {
                            const dateStr = dateToString(date);
                            const dayShifts = displayShifts
                              .filter((s) => s.employeeId === employee.id && s.date === dateStr && !s.isBlocked)
                              .sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
                            const isSingleShiftCell = dayShifts.length === 1;
                            const visibleShiftLimit = 4;
                            const visibleDayShifts = dayShifts.length > visibleShiftLimit
                              ? dayShifts.slice(0, visibleShiftLimit)
                              : dayShifts;
                            const hiddenShiftCount = dayShifts.length - visibleDayShifts.length;
                            const isToday = isSameDay(date, today);
                            const hasTimeOff = hasApprovedTimeOff(employee.id, dateStr);
                            const hasBlocked = hasBlockedShiftOnDate(employee.id, dateStr);
                            const hasOrgBlackout = hasOrgBlackoutOnDate(dateStr);
                            const orgId = activeRestaurantId ?? 'none';
                            const droppableId = buildCellDropId(orgId, employee.id, dateStr);
                            const isOriginCell = Boolean(
                              dragOrigin
                              && draggingShiftId === dragOrigin.shiftId
                              && dragOrigin.employeeId === employee.id
                              && dragOrigin.date === dateStr
                            );
                            const shouldShowOriginPlaceholder = Boolean(isOriginCell && draggingShiftId);
                            const canReceiveDrop =
                              Boolean(activeRestaurantId)
                              && isManager
                              && canEditDate(dateStr)
                              && !hasTimeOff
                              && !hasBlocked
                              && !hasOrgBlackout;

                            return (
                              <WeekGridCell
                                key={date.toISOString()}
                                droppableId={droppableId}
                                disabledDrop={!canReceiveDrop}
                                isActiveCell={activeCellId === droppableId}
                                isContextMenuTarget={contextMenuCellHighlightId === droppableId}
                                isDragOverCell={dragOverCellId === droppableId}
                                className={`border-r border-theme-primary/30 p-0.5 group relative overflow-hidden ${
                                  isToday ? 'bg-amber-500/5' : ''
                                } ${hasTimeOff ? 'bg-emerald-500/5' : ''} ${hasBlocked ? 'bg-red-500/5' : ''} ${hasOrgBlackout ? 'bg-amber-500/5' : ''} ${
                                  canReceiveDrop ? 'hover:outline hover:outline-1 hover:outline-sky-300/50' : ''
                                }`}
                                onClick={(e) => handleCellClick(employee.id, dateStr, e)}
                                onMouseDown={(e) => handleCellMouseDown(employee.id, dateStr, e)}
                                onMouseUp={(e) => handleCellMouseUp(employee.id, dateStr, e)}
                              >
                                {shouldShowOriginPlaceholder && (
                                  <div className="absolute inset-2 rounded-md border border-dashed border-black/20 bg-black/5 opacity-60 pointer-events-none" />
                                )}
                                {!hasTimeOff && !hasBlocked && !hasOrgBlackout && canEditDate(dateStr) && (
                                  <div
                                    className={`absolute inset-1 rounded border border-dashed border-theme-secondary flex items-center justify-center pointer-events-none transition-opacity ${
                                      hoveredShiftId || draggingShiftId ? 'opacity-0' : 'opacity-0 group-hover:opacity-25'
                                    }`}
                                  >
                                    <span className="text-[10px] text-theme-muted">+</span>
                                  </div>
                                )}
                                {hasTimeOff ? (
                                  <div className="h-full flex items-center justify-center">
                                    <div className="flex items-center gap-0.5 px-1 py-0.5 bg-emerald-500/20 rounded text-emerald-500">
                                      <Palmtree className="w-2.5 h-2.5" />
                                      <span className="text-[9px] font-medium">OFF</span>
                                    </div>
                                  </div>
                                ) : hasBlocked ? (
                                  <div className="h-full flex items-center justify-center">
                                    <div className="flex items-center px-1 py-0.5 bg-red-500/20 rounded text-red-400">
                                      <span className="text-[9px] font-medium">X</span>
                                    </div>
                                  </div>
                                ) : hasOrgBlackout ? (
                                  <div className="h-full flex items-center justify-center">
                                    <div className="flex items-center px-1 py-0.5 bg-amber-500/20 rounded text-amber-500">
                                      <span className="text-[9px] font-medium">BO</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="relative h-full overflow-hidden">
                                    <div className={`flex h-full min-h-0 flex-col overflow-hidden p-1 ${isSingleShiftCell ? '' : 'gap-1'}`}>
                                      {visibleDayShifts.map((shift) => {
                                        if (draggingShiftId === shift.id) {
                                          // Hide active dragged shift in-grid; DragOverlay is the only full tile.
                                          return null;
                                        }
                                        const isDraftShift = isManager && shift.scheduleState === 'draft';
                                        const isBaselinePublished = scheduleMode === 'draft' && shift.scheduleState !== 'draft';
                                        const isPendingMove = pendingMoveShiftIds.includes(shift.id);
                                        const dragEnabled = canEditDate(shift.date) && isManager && !isPendingMove;
                                        const dragDisabledReason = !isManager
                                          ? 'not-manager'
                                          : !canEditDate(shift.date)
                                          ? 'date-locked'
                                          : isPendingMove
                                          ? 'pending-move'
                                          : undefined;

                                        return (
                                          <WeekShiftCard
                                            key={shift.id}
                                            shift={shift}
                                            layout={isSingleShiftCell ? 'single' : 'multi'}
                                            isDraftShift={isDraftShift}
                                            isBaselinePublished={isBaselinePublished}
                                            isDraggingShiftId={draggingShiftId === shift.id}
                                            isHiddenWhileDragging={draggingShiftId === shift.id}
                                            isSelected={selectedShiftId === shift.id}
                                            isContextMenuTarget={contextMenuShiftHighlightId === shift.id}
                                            isPendingMove={isPendingMove}
                                            dragEnabled={dragEnabled}
                                            dragDisabledReason={dragDisabledReason}
                                            onClick={(e) => handleShiftCardClick(shift, e)}
                                            onDoubleClick={(e) => {
                                              e.stopPropagation();
                                              handleShiftEdit(shift);
                                            }}
                                            onMouseEnter={() => setHoveredShiftId(shift.id)}
                                            onMouseLeave={() => setHoveredShiftId(null)}
                                          />
                                        );
                                      })}
                                      {hiddenShiftCount > 0 ? (
                                        <div className="shrink-0 rounded bg-theme-secondary/70 px-1 py-0.5 text-center text-[9px] font-medium text-theme-muted">
                                          +{hiddenShiftCount}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                )}
                              </WeekGridCell>
                            );
                          })}

                          <div
                            className={`h-full border-l border-theme-primary/30 flex items-center justify-center ${
                              isOvertime ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'
                            }`}
                          >
                            {hrs > 0 ? (
                              <div className="flex flex-col items-center leading-tight">
                                <span className={`text-[10px] font-semibold tabular-nums ${isOvertime ? 'text-red-600' : 'text-emerald-700'}`}>
                                  {Math.round(hrs)}h
                                </span>
                                {isOvertime ? (
                                  <span className="text-red-600 font-semibold text-xs">OT</span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-[9px] text-theme-muted"></span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </SortableContext>
            </div>
          </div>
        </div>
      <DragOverlay dropAnimation={null} zIndex={9999}>
        {activeDraggedShift ? (
          <WeekShiftOverlayCard
            shift={activeDraggedShift}
            isDraftShift={activeDraggedShiftIsDraft}
            isBaselinePublished={activeDraggedShiftIsBaselinePublished}
          />
        ) : null}
      </DragOverlay>
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[80] min-w-[180px] rounded-md border border-zinc-200 bg-white py-1.5 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {contextMenu.type === 'shift' && (
            <div className="px-1">
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100"
                onClick={handleContextCopyShift}
              >
                Copy shift
              </button>
              <button
                type="button"
                className="mt-0.5 w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  void handleContextDeleteShift();
                }}
              >
                Delete shift
              </button>
            </div>
          )}
          {contextMenu.type === 'cell' && (
            <div className="px-1">
              <button
                type="button"
                className={`w-full rounded px-3 py-2 text-left text-sm ${
                  isPasteMenuDisabled ? 'text-zinc-400' : 'text-zinc-800 hover:bg-zinc-100'
                }`}
                title={pasteMenuTitle}
                onClick={() => {
                  void handleContextPasteShift();
                }}
              >
                Paste shift
              </button>
            </div>
          )}
        </div>
      )}
      <PublishScheduleDialog
        open={publishConfirmOpen}
        selectedMode={publishEmailMode}
        isLoading={publishConfirmLoading}
        onModeChange={setPublishEmailMode}
        onCancel={closePublishConfirm}
        onConfirm={handleConfirmPublishWeek}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete shift?"
        description="This cant be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={confirmDeleteLoading}
        onCancel={closeConfirmDelete}
        onConfirm={handleConfirmDeleteShift}
      >
        {confirmDeleteShift ? (
          <div className="rounded-md border border-theme-primary/60 bg-theme-timeline/60 px-3 py-2 text-xs text-theme-secondary">
            <div className="font-semibold text-theme-primary">{confirmDeleteEmployeeName}</div>
            <div>{formatHour(confirmDeleteShift.startHour)} - {formatHour(confirmDeleteShift.endHour)}</div>
            {confirmDeleteShift.job ? <div className="text-theme-muted">{confirmDeleteShift.job}</div> : null}
          </div>
        ) : null}
      </ConfirmDialog>
      <PasteJobPickerDialog
        open={pasteJobPickerOpen}
        employeeName={pasteJobPickerEmployeeName}
        options={pasteJobPickerOptions}
        selectedJob={pasteJobPickerSelectedJob}
        onSelectJob={setPasteJobPickerSelectedJob}
        onCancel={() => resolvePasteJobPicker(null)}
        onConfirm={() => resolvePasteJobPicker(pasteJobPickerSelectedJob || null)}
      />
      </DndContext>
    </div>
  );
}
