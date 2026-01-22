'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { formatDateLong } from '../../utils/timeUtils';
import { getUserRole, isManagerRole } from '../../utils/role';

export default function TimeOffPage() {
  const router = useRouter();
  const {
    timeOffRequests,
    reviewTimeOffRequest,
    getEmployeeById,
    showToast,
    loadRestaurantData,
  } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, init } = useAuthStore();

  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'DENIED'>('PENDING');
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());

  const isManager = isManagerRole(getUserRole(currentUser?.role));

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  }, [isInitialized, activeRestaurantId, loadRestaurantData]);

  useEffect(() => {
    if (isInitialized && (!currentUser || !isManager)) {
      router.push('/dashboard?notice=forbidden');
    }
  }, [isInitialized, currentUser, isManager, router]);

  const splitReason = (value?: string) => {
    const text = String(value ?? '').trim();
    if (!text) return { reason: '-', note: '' };
    const marker = '\n\nNote:';
    if (!text.includes(marker)) return { reason: text, note: '' };
    const [reason, note] = text.split(marker);
    return { reason: reason.trim(), note: note.trim() };
  };

  const filteredRequests = useMemo(() => {
    const filtered = timeOffRequests.filter((request) => request.status === statusFilter);
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [timeOffRequests, statusFilter]);

  const handleDecision = async (id: string, status: 'APPROVED' | 'DENIED') => {
    if (!currentUser) return;
    if (reviewingIds.has(id)) return;
    setReviewingIds((prev) => new Set(prev).add(id));
    const result = await reviewTimeOffRequest(id, status, currentUser.id, notesById[id]);
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

  if (!isInitialized || !currentUser || !isManager) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Time Off Requests</h1>
          <p className="text-theme-tertiary mt-1">
            Review and manage requests for this restaurant.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          {(['PENDING', 'APPROVED', 'DENIED'] as const).map((status) => (
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
            <p className="text-theme-muted">No time off requests yet.</p>
          ) : (
            <table className="w-full text-sm text-left text-theme-secondary">
              <thead className="text-xs uppercase text-theme-muted border-b border-theme-primary">
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
              <tbody className="divide-y divide-theme-primary">
                {filteredRequests.map((request) => {
                  const employee = getEmployeeById(request.employeeId);
                  const { reason, note } = splitReason(request.reason);
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
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            request.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-400'
                              : request.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : request.status === 'DENIED'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-theme-tertiary text-theme-muted'
                          }`}
                        >
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
                        {request.status === 'PENDING' ? (
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
                        {request.status === 'PENDING' ? (
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
    </div>
  );
}
