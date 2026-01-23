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
  const { currentUser, isInitialized, activeRestaurantId, init } = useAuthStore();

  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED'>('PENDING');
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());

  const currentRole = getUserRole(currentUser?.role);
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

  const filteredRequests = useMemo(() => {
    let scoped: BlockedDayRequest[] = blockedDayRequests;
    if (!isManager && currentUser) {
      scoped = scoped.filter(
        (request) =>
          request.requestedByAuthUserId === currentUser.authUserId || request.userId === currentUser.id
      );
    }
    const filtered = scoped.filter((req) => req.status === statusFilter);
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [blockedDayRequests, statusFilter, currentUser, isManager]);

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

      <div className="flex flex-wrap gap-2">
        {(['PENDING', 'APPROVED', 'DENIED', 'CANCELLED'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === status
                ? 'bg-amber-500 text-zinc-900'
                : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-hover'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-4 overflow-x-auto">
        {filteredRequests.length === 0 ? (
          <p className="text-theme-muted">No blocked day requests yet.</p>
        ) : (
          <table className="w-full text-sm text-left text-theme-secondary">
            <thead className="text-xs uppercase text-theme-muted border-b border-theme-primary">
              <tr>
                <th className="py-2 px-3">Scope</th>
                <th className="py-2 px-3">Employee</th>
                <th className="py-2 px-3">Date Range</th>
                <th className="py-2 px-3">Reason</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Manager Note</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-primary">
              {filteredRequests.map((request) => {
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
