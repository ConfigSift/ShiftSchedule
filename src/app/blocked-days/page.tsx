'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import Link from 'next/link';

type ScopeOption = 'ORG_BLACKOUT' | 'EMPLOYEE';

export default function BlockedDaysPage() {
  const router = useRouter();
  const {
    blockedDayRequests,
    createImmediateBlockedDay,
    updateBlockedDay,
    deleteBlockedDay,
    loadRestaurantData,
    getEmployeesForRestaurant,
    showToast,
  } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, init } = useAuthStore();

  const [scope, setScope] = useState<ScopeOption>('EMPLOYEE');
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);

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

  useEffect(() => {
    if (!startDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      setStartDate(dateStr);
      setEndDate(dateStr);
    }
  }, [startDate]);

  const employees = getEmployeesForRestaurant(activeRestaurantId).filter((emp) =>
    currentRole === 'MANAGER' ? emp.userRole !== 'ADMIN' : true
  );

  const resetForm = () => {
    setEditingId(null);
    setScope('EMPLOYEE');
    setEmployeeId('');
    setReason('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurantId) return;
    if (!startDate || !endDate || !reason.trim()) {
      showToast('Start date, end date, and reason are required', 'error');
      return;
    }
    if (endDate < startDate) {
      showToast('End date must be on or after start date', 'error');
      return;
    }
    if (scope === 'EMPLOYEE' && !employeeId) {
      showToast('Select an employee for this block', 'error');
      return;
    }

    setSubmitting(true);
    const payload = {
      organizationId: activeRestaurantId,
      userId: scope === 'EMPLOYEE' ? employeeId : null,
      scope,
      startDate,
      endDate,
      reason: reason.trim(),
    };

    const result = editingId
      ? await updateBlockedDay({ id: editingId, ...payload })
      : await createImmediateBlockedDay(payload);

    if (!result.success) {
      showToast(result.error || 'Unable to save blocked day', 'error');
      setSubmitting(false);
      return;
    }

    showToast(editingId ? 'Blocked day updated' : 'Blocked day created', 'success');
    resetForm();
    setSubmitting(false);
  };

  const handleEdit = (id: string) => {
    const entry = blockedDayRequests.find((req) => req.id === id);
    if (!entry) return;
    setEditingId(entry.id);
    setScope(entry.scope);
    setEmployeeId(entry.userId ?? '');
    setStartDate(entry.startDate);
    setEndDate(entry.endDate);
    setReason(entry.reason);
  };

  const handleDelete = async (id: string) => {
    if (!activeRestaurantId) return;
    const confirmed = window.confirm('Delete this blocked day?');
    if (!confirmed) return;
    const result = await deleteBlockedDay(id, activeRestaurantId);
    if (!result.success) {
      showToast(result.error || 'Unable to delete blocked day', 'error');
      return;
    }
    showToast('Blocked day deleted', 'success');
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
          <h1 className="text-2xl font-bold text-theme-primary">Blocked Days</h1>
          <p className="text-theme-tertiary mt-1">
            Manage blackout days and employee unavailability.
          </p>
        </header>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-theme-primary mb-3">
            {editingId ? 'Edit Blocked Day' : 'Create Blocked Day'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-theme-secondary">Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ScopeOption)}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                >
                  <option value="EMPLOYEE">Employee Unavailable</option>
                  <option value="ORG_BLACKOUT">Org Blackout (No Time Off)</option>
                </select>
              </div>
              {scope === 'EMPLOYEE' && (
                <div>
                  <label className="text-sm text-theme-secondary">Employee</label>
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                  >
                    <option value="">Select employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-theme-secondary">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-theme-secondary">Reason</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-theme-primary bg-theme-secondary p-4">
          <h2 className="text-lg font-semibold text-theme-primary">Review Requests</h2>
          <p className="text-sm text-theme-tertiary mt-1">
            Blocked day requests are reviewed in Review Requests.
          </p>
          <Link
            href="/review-requests"
            className="inline-flex mt-3 px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors"
          >
            Go to Review Requests
          </Link>
        </div>
      </div>
    </div>
  );
}
