'use client';

import { useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { formatDateLong } from '../../utils/timeUtils';
import { getUserRole, isManagerRole } from '../../utils/role';
import type { BlockedDayRequest } from '../../types';

type BlockedDayRequestsPanelProps = {
  allowEmployee?: boolean;
  showHeader?: boolean;
  onEdit?: (requestId: string) => void;
  onDelete?: (requestId: string) => void;
};

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  APPROVED: 1,
  DENIED: 2,
  CANCELLED: 2,
};

export function BlockedDayRequestsPanel({
  allowEmployee = false,
  showHeader = true,
  onEdit,
  onDelete,
}: BlockedDayRequestsPanelProps) {
  const {
    blockedDayRequests,
    reviewBlockedDayRequest,
    loadRestaurantData,
    getEmployeesForRestaurant,
    showToast,
  } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, accessibleRestaurants, init } = useAuthStore();

  const [requestTab, setRequestTab] = useState<'PENDING' | 'REQUESTS'>('PENDING');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DENIED'>('ALL');
  const [sortKey, setSortKey] = useState<
    'employee' | 'dateRange' | 'status' | 'submitted' | 'reason' | 'managerNote' | null
  >(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());

  const matchedRestaurant = activeRestaurantId
    ? accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId)
    : undefined;
  const currentRole = getUserRole(matchedRestaurant?.role ?? currentUser?.role);
  const isManager = isManagerRole(currentRole);
  const canView = isManager || allowEmployee;

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  }, [isInitialized, activeRestaurantId, loadRestaurantData]);

  const employees = getEmployeesForRestaurant(activeRestaurantId);

  const scopedRequests = useMemo(() => {
    let scoped: BlockedDayRequest[] = blockedDayRequests;
    if (!isManager && currentUser) {
      scoped = scoped.filter(
        (request) =>
          request.requestedByAuthUserId === currentUser.authUserId || request.userId === currentUser.id
      );
    }
    return scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [blockedDayRequests, currentUser, isManager]);

  const pendingRequests = useMemo(
    () => scopedRequests.filter((request) => String(request.status).toUpperCase() === 'PENDING'),
    [scopedRequests]
  );
  const totalRequestsCount = scopedRequests.length;

  const filteredRequests = useMemo(() => {
    if (requestTab === 'PENDING') {
      return pendingRequests;
    }
    if (requestStatusFilter === 'ALL') {
      return scopedRequests;
    }
    return scopedRequests.filter((request) => {
      const status = String(request.status).toUpperCase();
      if (requestStatusFilter === 'PENDING') return status === 'PENDING';
      if (requestStatusFilter === 'APPROVED') return status === 'APPROVED';
      if (requestStatusFilter === 'DENIED') return status === 'DENIED' || status === 'CANCELLED';
      return true;
    });
  }, [pendingRequests, requestStatusFilter, requestTab, scopedRequests]);

  const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

  const handleSortChange = (
    key: 'employee' | 'dateRange' | 'status' | 'submitted' | 'reason' | 'managerNote'
  ) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir('asc');
      return key;
    });
  };

  const sortedRequests = useMemo(() => {
    if (!sortKey) return filteredRequests;
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...filteredRequests].sort((a, b) => {
      const employeeA = a.userId ? employees.find((emp) => emp.id === a.userId) : null;
      const employeeB = b.userId ? employees.find((emp) => emp.id === b.userId) : null;
      const aStatus = String(a.status).toUpperCase();
      const bStatus = String(b.status).toUpperCase();
      let result = 0;

      if (sortKey === 'employee') {
        const aName = employeeA?.name || (a.scope === 'ORG_BLACKOUT' ? 'All Staff' : 'Unknown');
        const bName = employeeB?.name || (b.scope === 'ORG_BLACKOUT' ? 'All Staff' : 'Unknown');
        result = compareText(aName, bName);
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
        result = compareText(String(a.reason ?? '').toLowerCase(), String(b.reason ?? '').toLowerCase());
      } else if (sortKey === 'managerNote') {
        result = compareText(String(a.managerNote ?? '').toLowerCase(), String(b.managerNote ?? '').toLowerCase());
      }

      if (result === 0) {
        result = compareText(a.id, b.id);
      }
      return result * direction;
    });
  }, [employees, filteredRequests, sortDir, sortKey]);

  const renderSortIndicator = (
    key: 'employee' | 'dateRange' | 'status' | 'submitted' | 'reason' | 'managerNote'
  ) => {
    if (sortKey !== key) return null;
    return <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const handleDecision = async (id: string, status: 'APPROVED' | 'DENIED') => {
    if (reviewingIds.has(id)) return;
    setReviewingIds((prev) => new Set(prev).add(id));
    const result = await reviewBlockedDayRequest(id, status, notesById[id]);
    if (!result.success) {
      showToast(result.error || 'Unable to update request', 'error');
      setReviewingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    showToast(status === 'APPROVED' ? 'Request approved' : 'Request denied', 'success');
    setNotesById((prev) => ({ ...prev, [id]: '' }));
    setReviewingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
          <h1 className="text-2xl font-bold text-theme-primary">Blocked Day Requests</h1>
          <p className="text-theme-tertiary mt-1">
            Review org blackout days and employee unavailability.
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
        {requestTab === 'REQUESTS' && (
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
      </div>

      <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-4 overflow-x-auto">
        {filteredRequests.length === 0 ? (
          <p className="text-theme-muted">No blocked day requests yet.</p>
        ) : (
          <table className="w-full text-sm text-left text-theme-secondary">
            <thead className="text-xs uppercase text-theme-muted border-b border-theme-primary">
              <tr>
                <th className="py-2 px-3">Scope</th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('employee')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Employee {renderSortIndicator('employee')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('dateRange')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Date Range {renderSortIndicator('dateRange')}
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button type="button" onClick={() => handleSortChange('reason')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Reason {renderSortIndicator('reason')}
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
                  <button type="button" onClick={() => handleSortChange('managerNote')} className="inline-flex items-center gap-1 hover:text-theme-secondary transition-colors">
                    Manager Note {renderSortIndicator('managerNote')}
                  </button>
                </th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-primary">
              {sortedRequests.map((request) => {
                const employee = request.userId
                  ? employees.find((emp) => emp.id === request.userId)
                  : null;
                const canManage = Boolean(onEdit && onDelete) && isManager && request.status !== 'PENDING';
                return (
                  <tr key={request.id} className="text-theme-primary">
                    <td className="py-3 px-3 text-xs text-theme-tertiary">
                      {request.scope === 'ORG_BLACKOUT' ? 'Org Blackout' : 'Employee Block'}
                    </td>
                    <td className="py-3 px-3">
                      {employee?.name || (request.scope === 'ORG_BLACKOUT' ? 'All Staff' : 'Unknown')}
                    </td>
                    <td className="py-3 px-3">
                      {formatDateLong(request.startDate)}
                      {request.startDate !== request.endDate && ` - ${formatDateLong(request.endDate)}`}
                    </td>
                    <td className="py-3 px-3 text-xs text-theme-tertiary">{request.reason}</td>
                    <td className="py-3 px-3">
                      <span className="text-xs font-semibold">{request.status}</span>
                    </td>
                    <td className="py-3 px-3 text-theme-muted">
                      {formatDateLong(request.createdAt.split('T')[0])}
                    </td>
                    <td className="py-3 px-3">
                      {isManager && request.status === 'PENDING' ? (
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
                        <span className="text-theme-tertiary text-xs">{request.managerNote || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isManager && request.status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleDecision(request.id, 'DENIED')}
                            disabled={reviewingIds.has(request.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => handleDecision(request.id, 'APPROVED')}
                            disabled={reviewingIds.has(request.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Approve
                          </button>
                        </div>
                      ) : canManage ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onEdit?.(request.id)}
                            className="px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDelete?.(request.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs"
                          >
                            Delete
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
    </div>
  );
}
