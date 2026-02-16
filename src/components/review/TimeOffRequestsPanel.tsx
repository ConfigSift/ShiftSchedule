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

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  APPROVED: 1,
  DENIED: 2,
};

const getStatusClasses = (status: string) => {
  const normalized = String(status).toUpperCase();
  if (normalized === 'PENDING') return 'bg-amber-500/20 text-amber-400';
  if (normalized === 'APPROVED') return 'bg-emerald-500/20 text-emerald-400';
  if (normalized === 'DENIED') return 'bg-red-500/20 text-red-400';
  return 'bg-theme-tertiary text-theme-muted';
};

type SortKey = 'employee' | 'jobs' | 'dateRange' | 'status' | 'submitted' | 'reason' | 'managerNote';

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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
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

  const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

  const handleSortChange = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir('asc');
      return key;
    });
  };

  const scopedRequests = useMemo(() => {
    let scoped = timeOffRequests.map((request) => ({
      ...request,
      status: optimisticStatusById[request.id] ?? request.status,
    }));
    if (!isManager && currentUser) {
      scoped = scoped.filter((request) => request.employeeId === currentUser.id);
    }
    return scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    if (requestTab === 'PENDING') {
      return pendingRequests;
    }
    if (requestStatusFilter === 'ALL') {
      return scopedRequests;
    }
    return scopedRequests.filter(
      (request) => String(request.status).toUpperCase() === requestStatusFilter
    );
  }, [pendingRequests, requestStatusFilter, requestTab, scopedRequests]);

  const selectedRequest = useMemo(
    () => filteredRequests.find((request) => request.id === selectedRequestId) ?? null,
    [filteredRequests, selectedRequestId]
  );

  const sortedRequests = useMemo(() => {
    if (!sortKey) return filteredRequests;
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...filteredRequests].sort((a, b) => {
      const employeeA = getEmployeeById(a.employeeId);
      const employeeB = getEmployeeById(b.employeeId);
      const aStatus = String(a.status).toUpperCase();
      const bStatus = String(b.status).toUpperCase();
      let result = 0;

      if (sortKey === 'employee') {
        const aName = employeeA?.name || employeeA?.profile?.email || '';
        const bName = employeeB?.name || employeeB?.profile?.email || '';
        result = compareText(aName, bName);
      } else if (sortKey === 'jobs') {
        const aJobs = employeeA?.jobs?.join(', ') ?? '';
        const bJobs = employeeB?.jobs?.join(', ') ?? '';
        result = compareText(aJobs, bJobs);
      } else if (sortKey === 'dateRange') {
        result = compareText(a.startDate, b.startDate);
        if (result === 0) {
          result = compareText(a.endDate, b.endDate);
        }
      } else if (sortKey === 'status') {
        result = (STATUS_PRIORITY[aStatus] ?? 99) - (STATUS_PRIORITY[bStatus] ?? 99);
      } else if (sortKey === 'submitted') {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        result = aTime - bTime;
      } else if (sortKey === 'reason') {
        result = compareText(splitReason(a.reason).reason.toLowerCase(), splitReason(b.reason).reason.toLowerCase());
      } else if (sortKey === 'managerNote') {
        result = compareText(String(a.managerNote ?? '').toLowerCase(), String(b.managerNote ?? '').toLowerCase());
      }

      if (result === 0) {
        result = compareText(a.id, b.id);
      }
      return result * direction;
    });
  }, [filteredRequests, getEmployeeById, sortDir, sortKey]);

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

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
    <div className="space-y-6">
      {showHeader && (
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Time Off Requests</h1>
          <p className="text-theme-tertiary mt-1">
            Review and manage requests for this restaurant.
          </p>
        </header>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRequestTab('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              requestTab === 'PENDING'
                ? 'bg-amber-500 text-zinc-900'
                : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
            }`}
          >
            Pending ({pendingRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setRequestTab('REQUESTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              requestTab === 'REQUESTS'
                ? 'bg-amber-500 text-zinc-900'
                : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
            }`}
          >
            Requests ({totalRequestsCount})
          </button>
        </div>
        {requestTab === 'REQUESTS' && isManager && (
          <label className="inline-flex items-center gap-2 text-xs text-theme-secondary">
            <span className="text-theme-muted">Status</span>
            <select
              value={requestStatusFilter}
              onChange={(event) =>
                setRequestStatusFilter(event.target.value as 'ALL' | 'PENDING' | 'APPROVED' | 'DENIED')
              }
              className="px-2 py-1.5 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
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

      <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-4 overflow-x-auto">
        {filteredRequests.length === 0 ? (
          <p className="text-theme-muted">No time off requests yet.</p>
        ) : isEmployeeView ? (
          <div className="space-y-3">
            {filteredRequests.map((request) => {
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
          <table className="w-full text-sm text-left text-theme-secondary">
            <thead className="text-xs uppercase text-theme-muted border-b border-theme-primary">
              <tr>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('employee')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Employee {renderSortIndicator('employee')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('jobs')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Jobs {renderSortIndicator('jobs')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('dateRange')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Date Range {renderSortIndicator('dateRange')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('status')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Status {renderSortIndicator('status')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('submitted')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Submitted {renderSortIndicator('submitted')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('reason')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Reason {renderSortIndicator('reason')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('managerNote')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Manager Note {renderSortIndicator('managerNote')}
                  </button>
                </th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-primary">
              {sortedRequests.map((request) => {
                const employee = getEmployeeById(request.employeeId);
                const { reason, note } = splitReason(request.reason);
                const isPending = String(request.status).toUpperCase() === 'PENDING';
                return (
                  <tr key={request.id} className="text-theme-primary">
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
                    <td className="py-3 px-3 text-theme-muted">
                      {formatDateLong(request.createdAt.split('T')[0])}
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-sm text-theme-secondary">{reason}</div>
                      {note && <div className="text-xs text-theme-muted mt-1">Note: {note}</div>}
                    </td>
                    <td className="py-3 px-3">
                      {isManager && isPending ? (
                        <input
                          type="text"
                          value={notesById[request.id] ?? ''}
                          onChange={(e) =>
                            setNotesById((prev) => ({ ...prev, [request.id]: e.target.value }))
                          }
                          className="w-full px-2 py-1 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                          placeholder="Optional note"
                        />
                      ) : (
                        <span className="text-theme-tertiary">{request.managerNote || '-'}</span>
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
                        <span className="text-xs text-theme-muted">No actions</span>
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
