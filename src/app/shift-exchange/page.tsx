'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, HandHeart, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useScheduleStore } from '../../store/scheduleStore';
import { apiFetch } from '../../lib/apiClient';
import { formatDateLong, formatHour } from '../../utils/timeUtils';
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

  const loadRequests = async () => {
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
  };

  useEffect(() => {
    if (activeRestaurantId && currentUser && isInitialized) {
      loadRequests();
    }
  }, [activeRestaurantId, currentUser, isInitialized]);

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
        // eslint-disable-next-line no-console
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
          // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
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
        const conflictRows = Array.isArray((result.data as any)?.conflicts)
          ? ((result.data as any)?.conflicts as Array<{
              shift_date?: string | null;
              start_time?: string | null;
              end_time?: string | null;
            }>)
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
          // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
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

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div
        className={`max-w-5xl mx-auto space-y-6 ${isConflictOpen ? 'pointer-events-none select-none' : ''}`}
        aria-hidden={isConflictOpen}
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-theme-primary">Shift Exchange</h1>
            <p className="text-theme-tertiary mt-1">
              Drop your shifts or pick up open shifts from teammates.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </header>

        <div className="flex items-center gap-2 bg-theme-tertiary rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setTab('drop')}
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
            onClick={() => setTab('pickup')}
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
              <div className="space-y-3">
                {myShifts.map((shift) => {
                  const openRequest = openRequestsByShiftId.get(shift.id);
                  const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                  const dropKey = `shift:${shift.id}`;
                  const isDropping = submittingById[dropKey] === 'DROP';
                  return (
                    <div
                      key={shift.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-theme-tertiary border border-theme-primary rounded-xl p-4"
                    >
                      <div>
                        <p className="text-theme-primary font-medium">
                          {formatDateLong(shift.date)} · {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                        </p>
                        <p className="text-xs text-theme-muted">
                          {shift.job || 'No job'}
                          {locationName ? ` · ${locationName}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {openRequest ? (
                          <button
                            type="button"
                            onClick={() => handleCancel(shift.id)}
                            disabled={Boolean(submittingById[`shift:${shift.id}`])}
                            className="px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs disabled:opacity-50"
                          >
                            {submittingById[`shift:${shift.id}`] === 'CANCEL' ? 'Canceling...' : 'Cancel Drop'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDrop(shift.id)}
                            disabled={isDropping}
                            className="px-3 py-1.5 rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors text-xs disabled:opacity-50"
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
              <div className="space-y-3">
                {openRequests.map((request) => {
                  const shift = request.shift;
                  if (!shift) return null;
                  const locationName = shift.locationId ? locationMap.get(shift.locationId) : null;
                  const pickupKey = `shift:${shift.id}`;
                  const isPickingUp = submittingById[pickupKey] === 'PICKUP';
                  return (
                    <div
                      key={request.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-theme-tertiary border border-theme-primary rounded-xl p-4"
                    >
                      <div>
                        <p className="text-theme-primary font-medium">
                          {formatDateLong(shift.date)} · {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                        </p>
                        <p className="text-xs text-theme-muted">
                          From {request.requesterName || shift.employeeName}
                          {shift.job ? ` · ${shift.job}` : ''}
                          {locationName ? ` · ${locationName}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePickup(shift.id)}
                        disabled={isPickingUp}
                        className="px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-xs disabled:opacity-50"
                      >
                        {isPickingUp ? 'Picking up...' : 'Pick Up'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
