'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { DemoProvider } from '../../../demo/DemoProvider';
import { DemoHeader } from '../DemoHeader';
import { useScheduleStore } from '../../../store/scheduleStore';
import { useAuthStore } from '../../../store/authStore';
import { formatDateLong, formatHour } from '../../../utils/timeUtils';
import { Toast } from '../../../components/Toast';
import { getAppBase, getIsLocalhost } from '@/lib/routing/getBaseUrls';

function DemoShiftExchangeInner() {
  const { activeRestaurantId } = useAuthStore();
  const {
    dropRequests,
    getShiftsForRestaurant,
    getEmployeesForRestaurant,
    createDropRequest,
    acceptDropRequest,
    cancelDropRequest,
    showToast,
  } = useScheduleStore();
  const [claimByRequest, setClaimByRequest] = useState<Record<string, string>>({});

  const handleGetStartedClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (getIsLocalhost(window.location.host)) return;
    event.preventDefault();
    window.location.assign(`${getAppBase(window.location.origin)}/start`);
  }, []);

  const employees = useMemo(
    () => getEmployeesForRestaurant(activeRestaurantId).filter((employee) => employee.isActive),
    [activeRestaurantId, getEmployeesForRestaurant],
  );

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const upcomingShifts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return getShiftsForRestaurant(activeRestaurantId)
      .filter((shift) => !shift.isBlocked && shift.date >= today)
      .sort((a, b) => (a.date === b.date ? a.startHour - b.startHour : a.date.localeCompare(b.date)));
  }, [activeRestaurantId, getShiftsForRestaurant]);

  const openRequests = useMemo(
    () => dropRequests.filter((request) => request.status === 'open'),
    [dropRequests],
  );
  const acceptedRequests = useMemo(
    () => dropRequests.filter((request) => request.status === 'accepted').slice(-6).reverse(),
    [dropRequests],
  );
  const requestByShiftId = useMemo(
    () => new Map(openRequests.map((request) => [request.shiftId, request])),
    [openRequests],
  );

  const handleOffer = (shiftId: string, employeeId: string) => {
    createDropRequest(shiftId, employeeId);
    showToast('Shift offered for pickup.', 'success');
  };

  const handleCancelOffer = (requestId: string) => {
    cancelDropRequest(requestId);
    showToast('Offer canceled.', 'success');
  };

  const handleClaim = async (requestId: string, fallbackEmployeeId: string) => {
    const chosen = claimByRequest[requestId] || fallbackEmployeeId;
    if (!chosen) {
      showToast('Select an employee to claim the shift.', 'error');
      return;
    }
    const result = await acceptDropRequest(requestId, chosen);
    if (!result.success) {
      showToast(result.error || 'Unable to claim shift.', 'error');
      return;
    }
    showToast('Shift claimed and schedule updated.', 'success');
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
      <div className="shrink-0 bg-amber-500 text-zinc-900" data-analytics="demo_shift_exchange_viewed">
        <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-center justify-between gap-3">
          <p className="text-xs sm:text-sm font-medium truncate">
            Shift Exchange Demo for <span className="font-bold">CrewShyft</span>
          </p>
          <Link
            href="/start"
            onClick={handleGetStartedClick}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg bg-zinc-900 text-amber-400 hover:bg-zinc-800 transition-colors text-xs sm:text-sm font-semibold"
            data-analytics="demo_exchange_banner_cta"
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
                <h1 className="text-xl font-semibold text-theme-primary">Shift Exchange</h1>
                <p className="text-sm text-theme-tertiary">
                  Offer shifts, claim open offers, and see updates instantly in the schedule.
                </p>
              </div>
              <button
                onClick={() => showToast('Shift exchange already synced with demo data.', 'success')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-theme-primary bg-theme-secondary p-4 space-y-3">
              <h2 className="text-lg font-semibold text-theme-primary">Offer a Shift</h2>
              {upcomingShifts.length === 0 ? (
                <p className="text-sm text-theme-muted">No upcoming shifts.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingShifts.slice(0, 20).map((shift) => {
                    const owner = employeeById.get(shift.employeeId)?.name ?? 'Unknown';
                    const openRequest = requestByShiftId.get(shift.id);
                    return (
                      <div
                        key={shift.id}
                        className="rounded-xl border border-theme-primary bg-theme-tertiary/40 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-theme-primary">
                              {formatDateLong(shift.date)} · {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                            </p>
                            <p className="text-xs text-theme-tertiary">
                              {shift.job || 'Unassigned'} · {owner}
                            </p>
                          </div>
                          {openRequest ? (
                            <button
                              onClick={() => handleCancelOffer(openRequest.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors text-xs font-semibold"
                            >
                              Cancel Offer
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOffer(shift.id, shift.employeeId)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-xs font-semibold"
                            >
                              Offer Shift
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-theme-primary bg-theme-secondary p-4 space-y-3">
              <h2 className="text-lg font-semibold text-theme-primary">Open Offers</h2>
              {openRequests.length === 0 ? (
                <p className="text-sm text-theme-muted">No open offers right now.</p>
              ) : (
                <div className="space-y-2">
                  {openRequests.map((request) => {
                    const shift = upcomingShifts.find((item) => item.id === request.shiftId);
                    if (!shift) return null;
                    const ownerName = employeeById.get(request.fromEmployeeId)?.name ?? 'Unknown';
                    const defaultClaim = employees.find((employee) => employee.id !== request.fromEmployeeId)?.id ?? '';
                    return (
                      <div
                        key={request.id}
                        className="rounded-xl border border-theme-primary bg-theme-tertiary/40 px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-theme-primary">
                          {formatDateLong(shift.date)} · {formatHour(shift.startHour)} - {formatHour(shift.endHour)}
                        </p>
                        <p className="text-xs text-theme-tertiary mb-2">
                          {shift.job || 'Unassigned'} · Offered by {ownerName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={claimByRequest[request.id] ?? defaultClaim}
                            onChange={(e) =>
                              setClaimByRequest((prev) => ({ ...prev, [request.id]: e.target.value }))
                            }
                            className="px-2 py-1.5 rounded-lg bg-theme-secondary border border-theme-primary text-theme-primary text-xs"
                          >
                            {employees
                              .filter((employee) => employee.id !== request.fromEmployeeId)
                              .map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                  Claim as {employee.name}
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={() => handleClaim(request.id, defaultClaim)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-zinc-900 hover:bg-emerald-400 transition-colors text-xs font-semibold"
                          >
                            Pick Up
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-theme-primary bg-theme-secondary p-4 space-y-3">
            <h2 className="text-lg font-semibold text-theme-primary">Recent Claims</h2>
            {acceptedRequests.length === 0 ? (
              <p className="text-sm text-theme-muted">No claims yet in this session.</p>
            ) : (
              <div className="space-y-2">
                {acceptedRequests.map((request) => {
                  const claimedBy = request.acceptedByEmployeeId
                    ? employeeById.get(request.acceptedByEmployeeId)?.name
                    : 'Unknown';
                  const shift = getShiftsForRestaurant(activeRestaurantId).find((item) => item.id === request.shiftId);
                  return (
                    <div
                      key={request.id}
                      className="rounded-xl border border-theme-primary bg-theme-tertiary/40 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-theme-primary">
                        {shift ? `${formatDateLong(shift.date)} · ${formatHour(shift.startHour)} - ${formatHour(shift.endHour)}` : 'Shift updated'}
                      </p>
                      <p className="text-xs text-theme-tertiary">Claimed by {claimedBy}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

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

export function DemoShiftExchangeContent() {
  return (
    <DemoProvider>
      <DemoShiftExchangeInner />
    </DemoProvider>
  );
}
