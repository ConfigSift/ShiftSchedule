'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Plus } from 'lucide-react';
import { DemoProvider } from '../../../demo/DemoProvider';
import { DemoHeader } from '../DemoHeader';
import { useScheduleStore } from '../../../store/scheduleStore';
import { useAuthStore } from '../../../store/authStore';
import { formatDateLong } from '../../../utils/timeUtils';
import { Toast } from '../../../components/Toast';
import { getAppBase, getIsLocalhost } from '@/lib/routing/getBaseUrls';

function DemoRequestsInner() {
  const { currentUser, activeRestaurantId, accessibleRestaurants } = useAuthStore();
  const {
    timeOffRequests,
    shifts,
    addTimeOffRequest,
    reviewTimeOffRequest,
    getEmployeesForRestaurant,
    showToast,
  } = useScheduleStore();

  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestType, setRequestType] = useState<'Vacation' | 'Sick' | 'Personal'>('Vacation');
  const [reason, setReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED'>('PENDING');

  const handleGetStartedClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (getIsLocalhost(window.location.host)) return;
    event.preventDefault();
    window.location.assign(`${getAppBase(window.location.origin)}/start`);
  }, []);

  const employees = useMemo(
    () => getEmployeesForRestaurant(activeRestaurantId).filter((employee) => employee.isActive),
    [activeRestaurantId, getEmployeesForRestaurant],
  );

  const activeRestaurantName = useMemo(
    () => accessibleRestaurants.find((restaurant) => restaurant.id === activeRestaurantId)?.name ?? 'Demo Restaurant',
    [accessibleRestaurants, activeRestaurantId],
  );

  const requests = useMemo(() => {
    return timeOffRequests
      .filter((request) => request.status === statusFilter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [statusFilter, timeOffRequests]);

  const approvedConflicts = useMemo(() => {
    const byRequestId = new Set<string>();
    timeOffRequests.forEach((request) => {
      if (request.status !== 'APPROVED') return;
      const hasConflict = shifts.some(
        (shift) =>
          !shift.isBlocked &&
          shift.employeeId === request.employeeId &&
          shift.date >= request.startDate &&
          shift.date <= request.endDate,
      );
      if (hasConflict) {
        byRequestId.add(request.id);
      }
    });
    return byRequestId;
  }, [shifts, timeOffRequests]);

  const handleCreateRequest = async () => {
    if (!currentUser?.authUserId || !activeRestaurantId) {
      showToast('Demo user not ready yet.', 'error');
      return;
    }
    if (!employeeId || !startDate || !endDate || !reason.trim()) {
      showToast('Complete all request fields first.', 'error');
      return;
    }
    if (endDate < startDate) {
      showToast('End date must be on or after start date.', 'error');
      return;
    }

    const fullReason = `${requestType}: ${reason.trim()}`;
    const result = await addTimeOffRequest({
      employeeId,
      requesterAuthUserId: currentUser.authUserId,
      organizationId: activeRestaurantId,
      startDate,
      endDate,
      reason: fullReason,
    });
    if (!result.success) {
      showToast(result.error || 'Unable to create request.', 'error');
      return;
    }
    showToast('Demo request created.', 'success');
    setReason('');
  };

  const handleReview = async (requestId: string, status: 'APPROVED' | 'DENIED') => {
    const reviewerId = currentUser?.id;
    if (!reviewerId) return;
    const result = await reviewTimeOffRequest(requestId, status, reviewerId);
    if (!result.success) {
      showToast(result.error || 'Unable to update request.', 'error');
      return;
    }
    showToast(status === 'APPROVED' ? 'Request approved.' : 'Request denied.', 'success');
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
      <div className="shrink-0 bg-amber-500 text-zinc-900" data-analytics="demo_requests_viewed">
        <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-center justify-between gap-3">
          <p className="text-xs sm:text-sm font-medium truncate">
            Demo Team Workflow for <span className="font-bold">CrewShyft</span>
          </p>
          <Link
            href="/start"
            onClick={handleGetStartedClick}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg bg-zinc-900 text-amber-400 hover:bg-zinc-800 transition-colors text-xs sm:text-sm font-semibold"
            data-analytics="demo_requests_banner_cta"
          >
            Get Started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <DemoHeader />

      <main className="flex-1 min-h-0 overflow-auto bg-theme-timeline p-3 sm:p-4 lg:p-6">
        <div className="mx-auto w-full max-w-[1100px] space-y-4">
          <div className="rounded-2xl border border-theme-primary bg-theme-secondary p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-theme-primary">Time-Off Requests</h1>
                <p className="text-sm text-theme-tertiary">
                  Create, approve, and deny requests with real schedule indicators.
                </p>
              </div>
              <Link
                href="/demo/shift-exchange"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              >
                <CalendarDays className="w-4 h-4" />
                Shift Exchange
              </Link>
            </div>
            <p className="mt-2 text-xs text-theme-muted">Restaurant: {activeRestaurantName}</p>
          </div>

          <div className="rounded-2xl border border-theme-primary bg-theme-secondary p-4 space-y-3">
            <div className="flex items-center gap-2 text-theme-primary font-medium">
              <Plus className="w-4 h-4 text-amber-500" />
              New Request
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
              />
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as 'Vacation' | 'Sick' | 'Personal')}
                className="px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
              >
                <option>Vacation</option>
                <option>Sick</option>
                <option>Personal</option>
              </select>
              <button
                onClick={handleCreateRequest}
                className="px-3 py-2 rounded-lg bg-emerald-500 text-zinc-900 hover:bg-emerald-400 transition-colors font-semibold"
              >
                Add Request
              </button>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason..."
              className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary"
            />
          </div>

          <div className="rounded-2xl border border-theme-primary bg-theme-secondary p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(['PENDING', 'APPROVED', 'DENIED', 'CANCELLED'] as const).map((status) => (
                <button
                  key={status}
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

            {requests.length === 0 ? (
              <p className="text-sm text-theme-muted">No {statusFilter.toLowerCase()} requests.</p>
            ) : (
              <div className="space-y-2">
                {requests.map((request) => {
                  const employee = employees.find((item) => item.id === request.employeeId);
                  const hasConflict = approvedConflicts.has(request.id);
                  return (
                    <div
                      key={request.id}
                      className="rounded-xl border border-theme-primary bg-theme-tertiary/40 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-theme-primary">
                            {employee?.name ?? 'Unknown'} · {request.reason || '-'}
                          </p>
                          <p className="text-xs text-theme-tertiary">
                            {formatDateLong(request.startDate)}
                            {request.startDate !== request.endDate
                              ? ` - ${formatDateLong(request.endDate)}`
                              : ''}
                          </p>
                          {hasConflict && (
                            <p className="mt-1 text-xs text-amber-400">
                              Conflict: approved request overlaps a scheduled shift.
                            </p>
                          )}
                        </div>
                        {request.status === 'PENDING' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleReview(request.id, 'DENIED')}
                              className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors text-xs font-semibold"
                            >
                              Deny
                            </button>
                            <button
                              onClick={() => handleReview(request.id, 'APPROVED')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors text-xs font-semibold"
                            >
                              Approve
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-theme-muted">{request.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href="/demo"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Demo Schedule
          </Link>
        </div>
      </main>
      <Toast />
    </div>
  );
}

export function DemoRequestsContent() {
  return (
    <DemoProvider>
      <DemoRequestsInner />
    </DemoProvider>
  );
}
