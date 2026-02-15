'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, HandHeart, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useScheduleStore } from '../../store/scheduleStore';
import { apiFetch } from '../../lib/apiClient';
import { getJobColorClasses } from '../../lib/jobColors';
import { formatDateLong, formatHour, formatShiftDuration } from '../../utils/timeUtils';
import { Toast } from '../../components/Toast';

type ExchangeShift = {
  id: string;
  userId: string;
  date: string;
  startHour: number;
  endHour: number;
  job?: string | null;
  locationId?: string | null;
  employeeName?: string | null;
};

type ExchangeRequest = {
  id: string;
  organizationId: string;
  shiftId: string;
  requestedByAuthUserId: string;
  status: 'OPEN' | 'CLAIMED' | 'CANCELLED';
  claimedByAuthUserId?: string | null;
  createdAt: string;
  claimedAt?: string | null;
  cancelledAt?: string | null;
  requesterName?: string | null;
  claimedByName?: string | null;
  shift?: ExchangeShift | null;
};

type PickupConflictRow = {
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type PickupErrorPayload = {
  conflicts?: PickupConflictRow[];
};

type ExchangeTab = 'drop' | 'pickup';

type ShiftRow = {
  id: string;
  date: string;
  startHour: number;
  endHour: number;
  job?: string | null;
  locationId?: string | null;
};

type ShiftExchangeViewProps = {
  tab: ExchangeTab;
  loading: boolean;
  myShifts: ShiftRow[];
  openRequests: ExchangeRequest[];
  openRequestsByShiftId: Map<string, ExchangeRequest>;
  submittingById: Record<string, 'DROP' | 'CANCEL' | 'PICKUP'>;
  locationMap: Map<string, string>;
  onTabChange: (tab: ExchangeTab) => void;
  onRefresh: () => Promise<void>;
  onDrop: (shiftId: string) => Promise<void>;
  onCancel: (shiftId: string) => Promise<void>;
  onPickup: (shiftId: string) => Promise<void>;
};

const MANAGER_ROLE_VALUES = new Set(['admin', 'manager', 'owner', 'super_admin']);
const EMPLOYEE_ROLE_VALUES = new Set(['worker', 'employee', 'staff', 'team_member']);

function toPickupErrorPayload(value: unknown): PickupErrorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as PickupErrorPayload;
}

export default function ShiftExchangePage() {
  const router = useRouter();
  const { currentUser, init, isInitialized, activeRestaurantId } = useAuthStore();
  const { loadRestaurantData, getShiftsForRestaurant, showToast, locations } = useScheduleStore();

  const [tab, setTab] = useState<'drop' | 'pickup'>('drop');
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingById, setSubmittingById] = useState<Record<string, 'DROP' | 'CANCEL' | 'PICKUP'>>({});
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [conflictList, setConflictList] = useState<
    Array<{ shift_date?: string | null; start_time?: string | null; end_time?: string | null }>
  >([]);
  const conflictOkRef = useRef<HTMLButtonElement | null>(null);
  const conflictDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  }, [activeRestaurantId, loadRestaurantData]);

  useEffect(() => {
    if (isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [isInitialized, currentUser, router]);

  useEffect(() => {
    if (!isConflictOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsConflictOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = conflictDialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (!active || active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (!active || active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConflictOpen]);

  useEffect(() => {
    if (!isConflictOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isConflictOpen]);

  useEffect(() => {
    if (isConflictOpen) {
      conflictOkRef.current?.focus();
    }
  }, [isConflictOpen]);

  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations]
  );

  const loadRequests = useCallback(async () => {
    if (!activeRestaurantId) return;
    setLoading(true);
    const result = await apiFetch<{ requests: ExchangeRequest[] }>(
      `/api/shift-exchange/list?organizationId=${activeRestaurantId}`
    );
    if (!result.ok) {
      showToast(result.error || 'Unable to load shift exchange requests.', 'error');
      setLoading(false);
      return;
    }
    setRequests(result.data?.requests ?? []);
    setLoading(false);
  }, [activeRestaurantId, showToast]);

  useEffect(() => {
    if (activeRestaurantId && currentUser && isInitialized) {
      void loadRequests();
    }
  }, [activeRestaurantId, currentUser, isInitialized, loadRequests]);

  if (!isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const myShifts = getShiftsForRestaurant(activeRestaurantId)
    .filter((shift) => shift.employeeId === currentUser.id && !shift.isBlocked)
    .filter((shift) => new Date(`${shift.date}T00:00:00`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const openRequests = requests.filter((request) => request.status === 'OPEN');
  const openRequestsByShiftId = new Map(openRequests.map((request) => [request.shiftId, request]));

  const handleRefresh = async () => {
    await loadRequests();
    if (activeRestaurantId) {
      await loadRestaurantData(activeRestaurantId);
    }
  };

  const handleDrop = async (shiftId: string) => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const key = `shift:${shiftId}`;
    if (submittingById[key]) return;
    setSubmittingById((prev) => ({ ...prev, [key]: 'DROP' }));
    const result = await apiFetch('/api/shift-exchange/drop', {
      method: 'POST',
      json: { shiftId, organizationId: activeRestaurantId },
    });
    if (!result.ok) {
      const isConflict = result.status === 409;
      showToast(
        isConflict
          ? 'That shift conflicts with another shift on your schedule.'
          : result.error || 'Unable to drop shift.',
        'error'
      );
      if (process.env.NODE_ENV !== 'production') {
         
        console.error('[shift-exchange] drop error', result);
      }
      setSubmittingById((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    showToast('Shift submitted to pick up.', 'success');
    await handleRefresh();
    setSubmittingById((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleCancel = async (shiftId: string) => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const key = `shift:${shiftId}`;
    if (submittingById[key]) return;
    setSubmittingById((prev) => ({ ...prev, [key]: 'CANCEL' }));
    try {
      const result = await apiFetch('/api/shift-exchange/cancel-drop', {
        method: 'POST',
        json: { shiftId, organizationId: activeRestaurantId },
      });
      if (!result.ok) {
        const isConflict = result.status === 409;
        showToast(
          isConflict
            ? 'That shift conflicts with another shift on your schedule.'
            : result.error || 'Unable to cancel request.',
          'error'
        );
        if (process.env.NODE_ENV !== 'production') {
           
          console.error('[shift-exchange] cancel error', result);
        }
        return;
      }
      showToast('Drop request cancelled.', 'success');
      await handleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel request.';
      showToast(message, 'error');
      if (process.env.NODE_ENV !== 'production') {
         
        console.debug('[shift-exchange] cancel exception', { error });
      }
    } finally {
      setSubmittingById((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handlePickup = async (shiftId: string) => {
    if (!activeRestaurantId) {
      showToast('Select a restaurant first.', 'error');
      return;
    }
    const key = `shift:${shiftId}`;
    if (submittingById[key]) return;
    setSubmittingById((prev) => ({ ...prev, [key]: 'PICKUP' }));
    try {
      const result = await apiFetch('/api/shift-exchange/pickup', {
        method: 'POST',
        json: { shiftId, organizationId: activeRestaurantId },
      });
      if (!result.ok) {
        const isConflict = result.status === 409;
        const payload = toPickupErrorPayload(result.data);
        const conflictRows = Array.isArray(payload.conflicts)
          ? payload.conflicts
          : [];
        if (isConflict) {
          setConflictMessage(
            result.error || 'This shift conflicts with an existing shift on your schedule.'
          );
          setConflictList(conflictRows);
          setIsConflictOpen(true);
        } else {
          showToast(result.error || 'Unable to pick up shift.', 'error');
        }
        if (process.env.NODE_ENV !== 'production') {
           
          console.debug('[shift-exchange] pickup failed', {
            status: result.status,
            error: result.error,
            data: result.data,
          });
        }
        return;
      }
      showToast('Shift picked up.', 'success');
      await handleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to pick up shift.';
      showToast(message, 'error');
      if (process.env.NODE_ENV !== 'production') {
         
        console.debug('[shift-exchange] pickup exception', { error });
      }
    } finally {
      setSubmittingById((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const roleValue = String(currentUser.role ?? '').trim().toLowerCase();
  const personaValue = String(currentUser.persona ?? '').trim().toLowerCase();
  const accountTypeValue = String(currentUser.accountType ?? '').trim().toLowerCase();
  const normalizedCandidates = [roleValue, personaValue, accountTypeValue].filter(Boolean);
  const resolvedRole =
    normalizedCandidates.find((value) => MANAGER_ROLE_VALUES.has(value) || EMPLOYEE_ROLE_VALUES.has(value))
    ?? 'employee';
  const isManagerLike = MANAGER_ROLE_VALUES.has(resolvedRole);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[shift-exchange] rendered branch', {
      branch: isManagerLike ? 'manager' : 'employee',
      resolvedRole,
      role: roleValue || null,
      persona: personaValue || null,
      accountType: accountTypeValue || null,
    });
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div
        className={`max-w-5xl mx-auto space-y-6 ${isConflictOpen ? 'pointer-events-none select-none' : ''}`}
        aria-hidden={isConflictOpen}
      >
        {isManagerLike ? (
          <ManagerShiftExchangeView
            tab={tab}
            loading={loading}
            myShifts={myShifts}
            openRequests={openRequests}
            openRequestsByShiftId={openRequestsByShiftId}
            submittingById={submittingById}
            locationMap={locationMap}
            onTabChange={setTab}
            onRefresh={handleRefresh}
            onDrop={handleDrop}
            onCancel={handleCancel}
            onPickup={handlePickup}
          />
        ) : (
          <EmployeeShiftExchangeView
            tab={tab}
            loading={loading}
            myShifts={myShifts}
            openRequests={openRequests}
            openRequestsByShiftId={openRequestsByShiftId}
            submittingById={submittingById}
            locationMap={locationMap}
            onTabChange={setTab}
            onRefresh={handleRefresh}
            onDrop={handleDrop}
            onCancel={handleCancel}
            onPickup={handlePickup}
          />
        )}
      </div>
      <Toast />
      {isConflictOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shift-conflict-title"
        >
          <div
            ref={conflictDialogRef}
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl border border-theme-primary bg-theme-secondary p-5 shadow-xl text-theme-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="shift-conflict-title" className="text-lg font-semibold">
                Schedule conflict
              </h2>
              <button
                type="button"
                onClick={() => setIsConflictOpen(false)}
                className="text-theme-muted hover:text-theme-primary transition-colors"
                aria-label="Close"
              >
                X
              </button>
            </div>
            <p className="mt-3 text-sm text-theme-secondary">{conflictMessage}</p>
            {conflictList.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm text-theme-tertiary">
                {conflictList.slice(0, 5).map((conflict, index) => {
                  const dateLabel = conflict.shift_date ? formatDateLong(conflict.shift_date) : 'Unknown date';
                  const startText = conflict.start_time ? String(conflict.start_time).slice(0, 5) : '?';
                  const endText = conflict.end_time ? String(conflict.end_time).slice(0, 5) : '?';
                  const timeLabel = startText === '?' || endText === '?' ? 'time unavailable' : `${startText}-${endText}`;
                  return (
                    <li key={`${dateLabel}-${startText}-${endText}-${index}`} className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-400/70" />
                      <span>{dateLabel}</span>
                      <span className="text-theme-muted">{timeLabel}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                ref={conflictOkRef}
                onClick={() => setIsConflictOpen(false)}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-primary hover:bg-theme-hover transition-colors text-sm font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeShiftExchangeView({
  tab,
  loading,
  myShifts,
  openRequests,
  openRequestsByShiftId,
  submittingById,
  locationMap,
  onTabChange,
  onRefresh,
  onDrop,
  onCancel,
  onPickup,
}: ShiftExchangeViewProps) {
  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary">Shift Exchange</h1>
          <p className="text-theme-tertiary mt-1">
            Drop your shifts or pick up open shifts from teammates.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </header>

      <div className="flex items-center gap-2 bg-theme-tertiary rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => onTabChange('drop')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'drop'
              ? 'bg-theme-secondary text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-primary'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          My Shifts (Drop)
        </button>
        <button
          type="button"
          onClick={() => onTabChange('pickup')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'pickup'
              ? 'bg-theme-secondary text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-primary'
          }`}
        >
          <HandHeart className="w-4 h-4" />
          Available to Pick Up
        </button>
      </div>

      {tab === 'drop' && (
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-theme-primary">My Upcoming Shifts</h2>
          {loading ? (
            <p className="text-theme-secondary">Loading shifts...</p>
          ) : myShifts.length === 0 ? (
            <p className="text-theme-muted">No upcoming shifts assigned.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {myShifts.map((shift) => {
                const openRequest = openRequestsByShiftId.get(shift.id);
                const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                const dropKey = `shift:${shift.id}`;
                const isDropping = submittingById[dropKey] === 'DROP';
                const roleConfig = getJobColorClasses(shift.job ?? undefined);
                const roleLabel = shift.job || roleConfig.label;
                const timeLabel = `${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}`;
                const durationLabel = formatShiftDuration(shift.startHour, shift.endHour);

                return (
                  <div
                    key={shift.id}
                    className="rounded-3xl border border-theme-primary/40 bg-theme-secondary/95 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-lg font-semibold text-theme-primary">
                        {formatDateLong(shift.date)}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${roleConfig.borderClass} ${roleConfig.accentClass} ${roleConfig.textClass}`}
                      >
                        {roleLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-theme-muted">
                      {timeLabel} · {durationLabel}
                    </p>
                    {locationName && (
                      <p className="mt-1 text-xs text-theme-tertiary">{locationName}</p>
                    )}
                    <div className="mt-4">
                      {openRequest ? (
                        <button
                          type="button"
                          onClick={() => onCancel(shift.id)}
                          disabled={Boolean(submittingById[`shift:${shift.id}`])}
                          className="w-full rounded-2xl bg-red-500/15 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                        >
                          {submittingById[`shift:${shift.id}`] === 'CANCEL' ? 'Canceling...' : 'Cancel Drop'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDrop(shift.id)}
                          disabled={isDropping}
                          className="w-full rounded-2xl bg-amber-500 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-amber-400 disabled:opacity-50"
                        >
                          {isDropping ? 'Dropping...' : 'Drop Shift'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'pickup' && (
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-theme-primary">Open Drop Requests</h2>
          {loading ? (
            <p className="text-theme-secondary">Loading requests...</p>
          ) : openRequests.length === 0 ? (
            <p className="text-theme-muted">No open requests right now.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {openRequests.map((request) => {
                const shift = request.shift;
                if (!shift) return null;
                const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                const pickupKey = `shift:${shift.id}`;
                const isPickingUp = submittingById[pickupKey] === 'PICKUP';
                const roleConfig = getJobColorClasses(shift.job ?? undefined);
                const roleLabel = shift.job || roleConfig.label;
                const timeRangeLabel = `${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}`;
                const durationLabel = formatShiftDuration(shift.startHour, shift.endHour);

                return (
                  <div
                    key={request.id}
                    className="rounded-3xl border border-theme-primary/40 bg-theme-secondary/95 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-lg font-semibold text-theme-primary">
                        {formatDateLong(shift.date)}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${roleConfig.borderClass} ${roleConfig.accentClass} ${roleConfig.textClass}`}
                      >
                        {roleLabel}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-sm font-semibold text-theme-primary">{timeRangeLabel}</p>
                      <span className="inline-flex items-center rounded-full border border-theme-primary/50 px-2 py-0.5 text-[11px] font-medium text-theme-tertiary">
                        {durationLabel}
                      </span>
                    </div>
                    {locationName && (
                      <p className="mt-1 text-xs text-theme-tertiary">{locationName}</p>
                    )}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => onPickup(shift.id)}
                        disabled={isPickingUp}
                        className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {isPickingUp ? 'Picking up...' : 'Pick Up'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ManagerShiftExchangeView({
  tab,
  loading,
  myShifts,
  openRequests,
  openRequestsByShiftId,
  submittingById,
  locationMap,
  onTabChange,
  onRefresh,
  onDrop,
  onCancel,
  onPickup,
}: ShiftExchangeViewProps) {
  const pickupRows = openRequests.filter(
    (request): request is ExchangeRequest & { shift: ExchangeShift } => Boolean(request.shift)
  );

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary">Shift Exchange</h1>
          <p className="text-theme-tertiary mt-1">
            Review and manage dropped shifts across your restaurant.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </header>

      <div className="flex items-center gap-2 bg-theme-tertiary rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => onTabChange('drop')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'drop'
              ? 'bg-theme-secondary text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-primary'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          My Shifts (Drop)
        </button>
        <button
          type="button"
          onClick={() => onTabChange('pickup')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'pickup'
              ? 'bg-theme-secondary text-theme-primary shadow-sm'
              : 'text-theme-tertiary hover:text-theme-primary'
          }`}
        >
          <HandHeart className="w-4 h-4" />
          Available to Pick Up
        </button>
      </div>

      {tab === 'drop' && (
        <section className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-theme-primary">My Upcoming Shifts</h2>
          {loading ? (
            <p className="text-theme-secondary">Loading shifts...</p>
          ) : myShifts.length === 0 ? (
            <p className="text-theme-muted">No upcoming shifts assigned.</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-theme-muted">
                    <tr className="border-b border-theme-primary">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Startâ€“End</th>
                      <th className="py-2 pr-3 font-medium">Duration</th>
                      <th className="py-2 pr-3 font-medium">Role</th>
                      <th className="py-2 pr-3 font-medium">Area</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-primary/60">
                    {myShifts.map((shift) => {
                      const openRequest = openRequestsByShiftId.get(shift.id);
                      const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                      const key = `shift:${shift.id}`;
                      const mode = submittingById[key];
                      const isDropping = mode === 'DROP';
                      const isCanceling = mode === 'CANCEL';
                      const roleConfig = getJobColorClasses(shift.job ?? undefined);
                      const roleLabel = shift.job || roleConfig.label;

                      return (
                        <tr key={shift.id} className="text-theme-secondary">
                          <td className="py-3 pr-3 text-theme-primary">{formatDateLong(shift.date)}</td>
                          <td className="py-3 pr-3">{formatHour(shift.startHour)} â€“ {formatHour(shift.endHour)}</td>
                          <td className="py-3 pr-3">{formatShiftDuration(shift.startHour, shift.endHour)}</td>
                          <td className="py-3 pr-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roleConfig.borderClass} ${roleConfig.accentClass} ${roleConfig.textClass}`}>
                              {roleLabel}
                            </span>
                          </td>
                          <td className="py-3 pr-3">{locationName ?? 'â€”'}</td>
                          <td className="py-3 pr-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${openRequest ? 'bg-amber-500/20 text-amber-300' : 'bg-theme-tertiary text-theme-muted'}`}>
                              {openRequest ? 'Open' : 'Assigned'}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {openRequest ? (
                              <button
                                type="button"
                                onClick={() => onCancel(shift.id)}
                                disabled={Boolean(mode)}
                                className="inline-flex items-center rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                              >
                                {isCanceling ? 'Canceling...' : 'Cancel Drop'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onDrop(shift.id)}
                                disabled={isDropping}
                                className="inline-flex items-center rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-amber-400 disabled:opacity-50"
                              >
                                {isDropping ? 'Dropping...' : 'Drop Shift'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {myShifts.map((shift) => {
                  const openRequest = openRequestsByShiftId.get(shift.id);
                  const key = `shift:${shift.id}`;
                  const mode = submittingById[key];
                  const isDropping = mode === 'DROP';
                  const isCanceling = mode === 'CANCEL';
                  const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                  const roleLabel = shift.job || getJobColorClasses(shift.job ?? undefined).label;

                  return (
                    <div key={shift.id} className="rounded-lg border border-theme-primary/60 bg-theme-tertiary/20 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-theme-primary">{formatDateLong(shift.date)}</p>
                          <p className="text-xs text-theme-tertiary">
                            {formatHour(shift.startHour)} â€“ {formatHour(shift.endHour)} Â· {formatShiftDuration(shift.startHour, shift.endHour)}
                          </p>
                          <p className="text-xs text-theme-muted truncate">
                            {roleLabel}{locationName ? ` Â· ${locationName}` : ''}
                          </p>
                        </div>
                        {openRequest ? (
                          <button
                            type="button"
                            onClick={() => onCancel(shift.id)}
                            disabled={Boolean(mode)}
                            className="shrink-0 rounded-md bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-300 disabled:opacity-50"
                          >
                            {isCanceling ? 'Canceling...' : 'Cancel'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDrop(shift.id)}
                            disabled={isDropping}
                            className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                          >
                            {isDropping ? 'Dropping...' : 'Drop'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'pickup' && (
        <section className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-theme-primary">Open Drop Requests</h2>
          {loading ? (
            <p className="text-theme-secondary">Loading requests...</p>
          ) : pickupRows.length === 0 ? (
            <p className="text-theme-muted">No open requests right now.</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-left text-theme-muted">
                    <tr className="border-b border-theme-primary">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Startâ€“End</th>
                      <th className="py-2 pr-3 font-medium">Duration</th>
                      <th className="py-2 pr-3 font-medium">Role</th>
                      <th className="py-2 pr-3 font-medium">Area</th>
                      <th className="py-2 pr-3 font-medium">From</th>
                      <th className="py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-primary/60">
                    {pickupRows.map((request) => {
                      const shift = request.shift;
                      const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                      const key = `shift:${shift.id}`;
                      const isPickingUp = submittingById[key] === 'PICKUP';
                      const roleConfig = getJobColorClasses(shift.job ?? undefined);
                      const roleLabel = shift.job || roleConfig.label;
                      const requesterLabel = request.requesterName || shift.employeeName || 'Teammate';

                      return (
                        <tr key={request.id} className="text-theme-secondary">
                          <td className="py-3 pr-3 text-theme-primary">{formatDateLong(shift.date)}</td>
                          <td className="py-3 pr-3">{formatHour(shift.startHour)} â€“ {formatHour(shift.endHour)}</td>
                          <td className="py-3 pr-3">{formatShiftDuration(shift.startHour, shift.endHour)}</td>
                          <td className="py-3 pr-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roleConfig.borderClass} ${roleConfig.accentClass} ${roleConfig.textClass}`}>
                              {roleLabel}
                            </span>
                          </td>
                          <td className="py-3 pr-3">{locationName ?? 'â€”'}</td>
                          <td className="py-3 pr-3">{requesterLabel}</td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => onPickup(shift.id)}
                              disabled={isPickingUp}
                              className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                            >
                              {isPickingUp ? 'Picking up...' : 'Pick Up'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {pickupRows.map((request) => {
                  const shift = request.shift;
                  const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                  const key = `shift:${shift.id}`;
                  const isPickingUp = submittingById[key] === 'PICKUP';
                  const roleLabel = shift.job || getJobColorClasses(shift.job ?? undefined).label;
                  const requesterLabel = request.requesterName || shift.employeeName || 'Teammate';

                  return (
                    <div key={request.id} className="rounded-lg border border-theme-primary/60 bg-theme-tertiary/20 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-theme-primary">{formatDateLong(shift.date)}</p>
                          <p className="text-xs text-theme-tertiary">
                            {formatHour(shift.startHour)} â€“ {formatHour(shift.endHour)} Â· {formatShiftDuration(shift.startHour, shift.endHour)}
                          </p>
                          <p className="text-xs text-theme-muted truncate">
                            {roleLabel}{locationName ? ` Â· ${locationName}` : ''} Â· From {requesterLabel}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPickup(shift.id)}
                          disabled={isPickingUp}
                          className="shrink-0 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                        >
                          {isPickingUp ? 'Picking...' : 'Pick Up'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}


