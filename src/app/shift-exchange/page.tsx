'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, HandHeart, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useScheduleStore } from '../../store/scheduleStore';
import { apiFetch } from '../../lib/apiClient';
import { formatDateLong, formatHour } from '../../utils/timeUtils';

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
  const [submitting, setSubmitting] = useState(false);

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
    if (submitting) return;
    setSubmitting(true);
    const result = await apiFetch('/api/shift-exchange/drop', {
      method: 'POST',
      json: { shiftId },
    });
    if (!result.ok) {
      showToast(result.error || 'Unable to drop shift.', 'error');
      setSubmitting(false);
      return;
    }
    showToast('Drop request created.', 'success');
    await handleRefresh();
    setSubmitting(false);
  };

  const handleCancel = async (requestId: string) => {
    if (submitting) return;
    setSubmitting(true);
    const result = await apiFetch('/api/shift-exchange/cancel', {
      method: 'POST',
      json: { requestId },
    });
    if (!result.ok) {
      showToast(result.error || 'Unable to cancel request.', 'error');
      setSubmitting(false);
      return;
    }
    showToast('Drop request cancelled.', 'success');
    await handleRefresh();
    setSubmitting(false);
  };

  const handlePickup = async (requestId: string) => {
    if (submitting) return;
    setSubmitting(true);
    const result = await apiFetch('/api/shift-exchange/pickup', {
      method: 'POST',
      json: { requestId },
    });
    if (!result.ok) {
      showToast(result.error || 'Unable to pick up shift.', 'error');
      setSubmitting(false);
      return;
    }
    showToast('Shift picked up.', 'success');
    await handleRefresh();
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-5xl mx-auto space-y-6">
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
                            onClick={() => handleCancel(openRequest.id)}
                            disabled={submitting}
                            className="px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs disabled:opacity-50"
                          >
                            Cancel Drop
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDrop(shift.id)}
                            disabled={submitting}
                            className="px-3 py-1.5 rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors text-xs disabled:opacity-50"
                          >
                            Drop Shift
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
                        onClick={() => handlePickup(request.id)}
                        disabled={submitting}
                        className="px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-xs disabled:opacity-50"
                      >
                        Pick Up
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
