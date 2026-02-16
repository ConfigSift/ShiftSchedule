'use client';

import { useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { formatDateLong } from '../../utils/timeUtils';
import { getUserRole, isManagerRole } from '../../utils/role';

type TimeOffRequestsPanelProps = {
  allowEmployee?: boolean;
  showHeader?: boolean;
};

const getStatusClasses = (status: string) => {
  const normalized = String(status).toUpperCase();
  if (normalized === 'PENDING') return 'bg-amber-500/20 text-amber-400';
  if (normalized === 'APPROVED') return 'bg-emerald-500/20 text-emerald-400';
  if (normalized === 'DENIED') return 'bg-red-500/20 text-red-400';
  return 'bg-theme-tertiary text-theme-muted';
};

const parseTimestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRequestTimestamp = (request: Record<string, unknown>): number => {
  const direct =
    parseTimestamp(request.submittedAt) ||
    parseTimestamp(request.createdAt) ||
    parseTimestamp(request.requestedAt) ||
    parseTimestamp(request.updatedAt);
  if (direct) return direct;

  const createdDate = String(request.createdDate ?? '').trim();
  const createdTime = String(request.createdTime ?? '').trim();
  if (createdDate) {
    const combined = parseTimestamp(`${createdDate}${createdTime ? `T${createdTime}` : ''}`);
    if (combined) return combined;
  }
  return 0;
};

export function TimeOffRequestsPanel({ allowEmployee = false, showHeader = true }: TimeOffRequestsPanelProps) {
  const {
    timeOffRequests,
    reviewTimeOffRequest,
    getEmployeeById,
    showToast,
    loadRestaurantData,
  } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, accessibleRestaurants, init } = useAuthStore();

  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [requestTab, setRequestTab] = useState<'PENDING' | 'REQUESTS'>('PENDING');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DENIED'>('ALL');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());
  const [optimisticRemovedIds, setOptimisticRemovedIds] = useState<Set<string>>(new Set());
  const [optimisticStatusById, setOptimisticStatusById] = useState<Record<string, 'APPROVED' | 'DENIED'>>({});
  const [submittingById, setSubmittingById] = useState<Record<string, 'APPROVED' | 'DENIED'>>({});
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const matchedRestaurant = activeRestaurantId
    ? accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId)
    : undefined;
  const effectiveRole = getUserRole(matchedRestaurant?.role ?? currentUser?.role);
  const isManager = isManagerRole(effectiveRole);
  const isEmployeeView = !isManager;
  const canView = isManager || allowEmployee;
  const normalizedEmployeeQuery = employeeQuery.trim().toLowerCase();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  }, [isInitialized, activeRestaurantId, loadRestaurantData]);

  const splitReason = (value?: string) => {
    const text = String(value ?? '').trim();
    if (!text) return { reason: '-', note: '' };
    const marker = '\n\nNote:';
    if (!text.includes(marker)) return { reason: text, note: '' };
    const [reason, note] = text.split(marker);
    return { reason: reason.trim(), note: note.trim() };
  };
  const scopedRequests = useMemo(() => {
    let scoped = timeOffRequests.map((request) => ({
      ...request,
      status: optimisticStatusById[request.id] ?? request.status,
    }));
    if (!isManager && currentUser) {
      scoped = scoped.filter((request) => request.employeeId === currentUser.id);
    }
    return [...scoped].sort((a, b) => {
      const diff =
        getRequestTimestamp(b as unknown as Record<string, unknown>) -
        getRequestTimestamp(a as unknown as Record<string, unknown>);
      if (diff !== 0) return diff;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [timeOffRequests, currentUser, isManager, optimisticStatusById]);

  const pendingRequests = useMemo(
    () =>
      scopedRequests.filter((request) => {
        if (optimisticRemovedIds.has(request.id)) return false;
        return String(request.status).toUpperCase() === 'PENDING';
      }),
    [scopedRequests, optimisticRemovedIds]
  );

  const totalRequestsCount = scopedRequests.length;

  const filteredRequests = useMemo(() => {
    const requests =
      requestTab === 'PENDING'
        ? pendingRequests
        : requestStatusFilter === 'ALL'
          ? scopedRequests
          : scopedRequests.filter(
              (request) => String(request.status).toUpperCase() === requestStatusFilter
            );
    if (!isManager || !normalizedEmployeeQuery) {
      return requests;
    }
    return requests.filter((request) => {
      const employee = getEmployeeById(request.employeeId);
      const name = String(employee?.name ?? '').toLowerCase();
      const email = String(employee?.profile?.email ?? '').toLowerCase();
      return name.includes(normalizedEmployeeQuery) || email.includes(normalizedEmployeeQuery);
    });
  }, [
    getEmployeeById,
    isManager,
    normalizedEmployeeQuery,
    pendingRequests,
    requestStatusFilter,
    requestTab,
    scopedRequests,
  ]);

  const selectedRequest = useMemo(
    () => filteredRequests.find((request) => request.id === selectedRequestId) ?? null,
    [filteredRequests, selectedRequestId]
  );
  const displayedRequests = filteredRequests;

  const handleDecision = async (id: string, status: 'APPROVED' | 'DENIED') => {
    if (!currentUser) return;
    if (reviewingIds.has(id) || submittingById[id]) return;
    setReviewingIds((prev) => new Set(prev).add(id));
    setSubmittingById((prev) => ({ ...prev, [id]: status }));
    const result = await reviewTimeOffRequest(id, status, currentUser.id, notesById[id]);
    if (!result.success) {
      showToast(result.error || 'Unable to update request', 'error');
      setReviewingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSubmittingById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    showToast(status === 'APPROVED' ? 'Approved request' : 'Denied request', 'success');
    setNotesById((prev) => ({ ...prev, [id]: '' }));
    setReviewingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSubmittingById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOptimisticRemovedIds((prev) => new Set(prev).add(id));
    setOptimisticStatusById((prev) => ({ ...prev, [id]: status }));
    if (activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  };

  if (!isInitialized || !currentUser || !canView) {
    return (
      <div className="min-h-[240px] flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className={showHeader ? 'space-y-6' : 'space-y-0'}>
      {showHeader && (
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Time Off Requests</h1>
          <p className="text-theme-tertiary mt-1">
            Review and manage requests for this restaurant.
          </p>
        </header>
      )}

      <div
        className={
          showHeader
            ? 'rounded-2xl border border-theme-primary bg-theme-secondary px-4 py-3'
            : 'border-t border-theme-primary bg-theme-secondary px-5 py-3'
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex items-center gap-1 rounded-full border border-theme-primary bg-theme-tertiary p-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setRequestTab('PENDING')}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                requestTab === 'PENDING'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-none'
                  : 'text-theme-secondary hover:text-theme-primary'
              }`}
            >
              Pending ({pendingRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setRequestTab('REQUESTS')}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                requestTab === 'REQUESTS'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-none'
                  : 'text-theme-secondary hover:text-theme-primary'
              }`}
            >
              Requests ({totalRequestsCount})
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2">
          {isManager && (
            <label className="inline-flex items-center gap-2 text-xs text-theme-secondary">
              <span className="text-theme-muted">Employee</span>
              <input
                type="text"
                value={employeeQuery}
                onChange={(event) => setEmployeeQuery(event.target.value)}
                placeholder="Filter by name"
                className="px-2 py-1.5 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary dark:bg-zinc-950 dark:border-white/10 dark:text-white dark:placeholder-white/40"
              />
            </label>
          )}
          {requestTab === 'REQUESTS' && isManager && (
            <label className="inline-flex items-center gap-2 text-xs text-theme-secondary">
              <span className="text-theme-muted">Status</span>
              <select
                value={requestStatusFilter}
                onChange={(event) =>
                  setRequestStatusFilter(event.target.value as 'ALL' | 'PENDING' | 'APPROVED' | 'DENIED')
                }
                className="px-2 py-1.5 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary dark:bg-zinc-950 dark:border-white/10 dark:text-white"
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="DENIED">Denied</option>
              </select>
            </label>
          )}
          {requestTab === 'REQUESTS' && isEmployeeView && (
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
            >
              Filter
            </button>
          )}
        </div>
        </div>
      </div>

      <div
        className={
          showHeader
            ? 'rounded-2xl border border-theme-primary bg-theme-secondary p-4 overflow-x-auto'
            : 'border-t border-theme-primary bg-white dark:bg-zinc-900 dark:border-white/10 px-5 py-6 overflow-x-auto'
        }
      >
        {displayedRequests.length === 0 ? (
          <p className="text-theme-muted dark:text-white/60">No time off requests yet.</p>
        ) : isEmployeeView ? (
          <div className="space-y-3">
            {displayedRequests.map((request) => {
              const employee = getEmployeeById(request.employeeId);
              const { reason } = splitReason(request.reason);
              const jobText = employee?.jobs?.length ? employee.jobs.join(', ') : 'No job';
              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => setSelectedRequestId(request.id)}
                  className="w-full rounded-2xl border border-theme-primary bg-theme-primary/40 p-4 text-left transition-colors hover:bg-theme-hover/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-theme-primary">
                        {formatDateLong(request.startDate)}
                        {request.startDate !== request.endDate ? ` - ${formatDateLong(request.endDate)}` : ''}
                      </p>
                      <p className="text-xs text-theme-tertiary mt-1">{jobText}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusClasses(String(request.status))}`}>
                      {request.status}
                    </span>
                  </div>
                  <p className="text-sm text-theme-secondary truncate mt-3">{reason}</p>
                  <p className="text-xs text-theme-muted mt-2">
                    Submitted {formatDateLong(request.createdAt.split('T')[0])}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <table className="w-full text-sm text-left text-theme-secondary dark:text-white/80">
            <thead className="text-xs uppercase text-theme-muted border-b border-theme-primary dark:text-white/60 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className="py-2 px-3">Employee</th>
                <th className="py-2 px-3">Jobs</th>
                <th className="py-2 px-3">Date Range</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Submitted</th>
                <th className="py-2 px-3">Reason</th>
                <th className="py-2 px-3">Manager Note</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-primary dark:divide-white/10">
              {displayedRequests.map((request) => {
                const employee = getEmployeeById(request.employeeId);
                const { reason, note } = splitReason(request.reason);
                const isPending = String(request.status).toUpperCase() === 'PENDING';
                return (
                  <tr key={request.id} className="text-theme-primary dark:text-white">
                    <td className="py-3 px-3">
                      <div className="font-medium">{employee?.name || 'Unknown'}</div>
                      <div className="text-xs text-theme-muted">{employee?.profile?.email || ''}</div>
                    </td>
                    <td className="py-3 px-3 text-xs text-theme-tertiary">
                      {employee?.jobs?.length ? employee.jobs.join(', ') : '-'}
                    </td>
                    <td className="py-3 px-3">
                      {formatDateLong(request.startDate)}
                      {request.startDate !== request.endDate && ` - ${formatDateLong(request.endDate)}`}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusClasses(String(request.status))}`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-theme-muted dark:text-white/60">
                      {formatDateLong(request.createdAt.split('T')[0])}
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-sm text-theme-secondary dark:text-white/80">{reason}</div>
                      {note && <div className="text-xs text-theme-muted dark:text-white/60 mt-1">Note: {note}</div>}
                    </td>
                    <td className="py-3 px-3">
                      {isManager && isPending ? (
                        <input
                          type="text"
                          value={notesById[request.id] ?? ''}
                          onChange={(e) =>
                            setNotesById((prev) => ({ ...prev, [request.id]: e.target.value }))
                          }
                          className="w-full px-2 py-1 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary dark:bg-zinc-950 dark:border-white/10 dark:text-white dark:placeholder-white/40"
                          placeholder="Optional note"
                        />
                      ) : (
                        <span className="text-theme-tertiary dark:text-white/60">{request.managerNote || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isManager && isPending ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleDecision(request.id, 'DENIED')}
                            disabled={reviewingIds.has(request.id) || Boolean(submittingById[request.id])}
                            className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {submittingById[request.id] === 'DENIED' ? 'Denying...' : 'Deny'}
                          </button>
                          <button
                            onClick={() => handleDecision(request.id, 'APPROVED')}
                            disabled={reviewingIds.has(request.id) || Boolean(submittingById[request.id])}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {submittingById[request.id] === 'APPROVED' ? 'Approving...' : 'Approve'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-theme-muted dark:text-white/60">No actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isEmployeeView && requestTab === 'REQUESTS' && isFilterSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsFilterSheetOpen(false)}
            aria-label="Close filters"
          />
          <div className="relative w-full rounded-t-2xl border border-theme-primary bg-theme-secondary p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-theme-primary">Status</h3>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="text-xs text-theme-tertiary hover:text-theme-primary"
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['ALL', 'PENDING', 'APPROVED', 'DENIED'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setRequestStatusFilter(option);
                    setIsFilterSheetOpen(false);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    requestStatusFilter === option
                      ? 'bg-amber-500 text-zinc-900'
                      : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
                  }`}
                >
                  {option === 'ALL' ? 'All' : option === 'PENDING' ? 'Pending' : option === 'APPROVED' ? 'Approved' : 'Denied'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isEmployeeView && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedRequestId(null)}
            aria-label="Close request details"
          />
          <div className="relative w-full rounded-t-2xl border border-theme-primary bg-theme-secondary p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-theme-primary">Request Details</h3>
              <button
                type="button"
                onClick={() => setSelectedRequestId(null)}
                className="text-xs text-theme-tertiary hover:text-theme-primary"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-theme-primary">
                <span className="text-theme-muted mr-2">Date:</span>
                {formatDateLong(selectedRequest.startDate)}
                {selectedRequest.startDate !== selectedRequest.endDate
                  ? ` - ${formatDateLong(selectedRequest.endDate)}`
                  : ''}
              </p>
              <p className="text-theme-primary">
                <span className="text-theme-muted mr-2">Status:</span>
                {selectedRequest.status}
              </p>
              <p className="text-theme-primary">
                <span className="text-theme-muted mr-2">Job:</span>
                {(getEmployeeById(selectedRequest.employeeId)?.jobs ?? []).join(', ') || 'No job'}
              </p>
              <p className="text-theme-primary">
                <span className="text-theme-muted mr-2">Reason:</span>
                {splitReason(selectedRequest.reason).reason || '-'}
              </p>
              <p className="text-theme-primary">
                <span className="text-theme-muted mr-2">Manager note:</span>
                {selectedRequest.managerNote || '-'}
              </p>
              <p className="text-theme-tertiary text-xs">
                Submitted {formatDateLong(selectedRequest.createdAt.split('T')[0])}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
