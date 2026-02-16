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
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());

  const matchedRestaurant = activeRestaurantId
    ? accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId)
    : undefined;
  const currentRole = getUserRole(matchedRestaurant?.role ?? currentUser?.role);
  const isManager = isManagerRole(currentRole);
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

  const employees = getEmployeesForRestaurant(activeRestaurantId);

  const scopedRequests = useMemo(() => {
    let scoped: BlockedDayRequest[] = blockedDayRequests;
    if (!isManager && currentUser) {
      scoped = scoped.filter(
        (request) =>
          request.requestedByAuthUserId === currentUser.authUserId || request.userId === currentUser.id
      );
    }
    return [...scoped].sort((a, b) => {
      const diff =
        getRequestTimestamp(b as unknown as Record<string, unknown>) -
        getRequestTimestamp(a as unknown as Record<string, unknown>);
      if (diff !== 0) return diff;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [blockedDayRequests, currentUser, isManager]);

  const pendingRequests = useMemo(
    () => scopedRequests.filter((request) => String(request.status).toUpperCase() === 'PENDING'),
    [scopedRequests]
  );
  const totalRequestsCount = scopedRequests.length;

  const filteredRequests = useMemo(() => {
    const requests =
      requestTab === 'PENDING'
        ? pendingRequests
        : requestStatusFilter === 'ALL'
          ? scopedRequests
          : scopedRequests.filter((request) => {
              const status = String(request.status).toUpperCase();
              if (requestStatusFilter === 'PENDING') return status === 'PENDING';
              if (requestStatusFilter === 'APPROVED') return status === 'APPROVED';
              if (requestStatusFilter === 'DENIED') return status === 'DENIED' || status === 'CANCELLED';
              return true;
            });
    if (!isManager || !normalizedEmployeeQuery) {
      return requests;
    }
    return requests.filter((request) => {
      const employee = request.userId ? employees.find((emp) => emp.id === request.userId) : null;
      const name = String(employee?.name ?? (request.scope === 'ORG_BLACKOUT' ? 'All Staff' : '')).toLowerCase();
      const email = String(employee?.profile?.email ?? '').toLowerCase();
      return name.includes(normalizedEmployeeQuery) || email.includes(normalizedEmployeeQuery);
    });
  }, [
    employees,
    isManager,
    normalizedEmployeeQuery,
    pendingRequests,
    requestStatusFilter,
    requestTab,
    scopedRequests,
  ]);
  const displayedRequests = filteredRequests;

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
    <div className={showHeader ? 'space-y-6' : 'space-y-0'}>
      {showHeader && (
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Blocked Day Requests</h1>
          <p className="text-theme-tertiary mt-1">
            Review org blackout days and employee unavailability.
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
          {requestTab === 'REQUESTS' && (
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
          <p className="text-theme-muted dark:text-white/60">No blocked day requests yet.</p>
        ) : (
          <table className="w-full text-sm text-left text-theme-secondary dark:text-white/80">
            <thead className="text-xs uppercase text-theme-muted border-b border-theme-primary dark:text-white/60 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className="py-2 px-3">Scope</th>
                <th className="py-2 px-3">Employee</th>
                <th className="py-2 px-3">Date Range</th>
                <th className="py-2 px-3">Reason</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Submitted</th>
                <th className="py-2 px-3">Manager Note</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-primary dark:divide-white/10">
              {displayedRequests.map((request) => {
                const employee = request.userId
                  ? employees.find((emp) => emp.id === request.userId)
                  : null;
                const canManage = Boolean(onEdit && onDelete) && isManager && request.status !== 'PENDING';
                return (
                  <tr key={request.id} className="text-theme-primary dark:text-white">
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
                    <td className="py-3 px-3 text-theme-muted dark:text-white/60">
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
                          className="w-full px-2 py-1 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary dark:bg-zinc-950 dark:border-white/10 dark:text-white dark:placeholder-white/40"
                          placeholder="Optional note"
                        />
                      ) : (
                        <span className="text-theme-tertiary dark:text-white/60 text-xs">{request.managerNote || '-'}</span>
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
    </div>
  );
}
