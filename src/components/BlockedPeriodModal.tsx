'use client';

import { useEffect, useMemo, useState } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { formatDateLong } from '../utils/timeUtils';
import { CalendarOff } from 'lucide-react';
import { getUserRole, isManagerRole } from '../utils/role';

export function BlockedPeriodModal() {
  const {
    modalType,
    modalData,
    closeModal,
    createBlockedPeriod,
    getBlockedRequestsForEmployee,
    showToast,
    getEmployeesForRestaurant,
  } = useScheduleStore();
  const { currentUser, activeRestaurantId } = useAuthStore();

  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const isOpen = modalType === 'blockedPeriod';
  const modalEmployeeId = modalData?.employeeId as string | undefined;

  const employees = getEmployeesForRestaurant(activeRestaurantId).filter((employee) =>
    currentUser && getUserRole(currentUser.role) === 'MANAGER' ? employee.userRole !== 'ADMIN' : true
  );
  const [employeeId, setEmployeeId] = useState(modalEmployeeId || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = nextWeek.toISOString().split('T')[0];
      setEmployeeId(modalEmployeeId || '');
      setStartDate(nextWeekStr);
      setEndDate(nextWeekStr);
      setNote('');
    }
  }, [isOpen, modalEmployeeId]);

  const blockedRequests = useMemo(() => {
    if (!employeeId) return [];
    return getBlockedRequestsForEmployee(employeeId).filter((req) => req.status === 'APPROVED');
  }, [employeeId, getBlockedRequestsForEmployee]);

  if (!isManager) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate || !note.trim()) {
      showToast('Select an employee, dates, and add a reason', 'error');
      return;
    }
    setSubmitting(true);
    const result = await createBlockedPeriod(employeeId, startDate, endDate, note.trim());
    if (!result.success) {
      showToast(result.error || 'Unable to block out days', 'error');
      setSubmitting(false);
      return;
    }
    showToast('Blocked days added', 'success');
    closeModal();
    setSubmitting(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Block Out Days" size="lg">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Employee
          </label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
          >
            <option value="">Select employee...</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>

        {employeeId && blockedRequests.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-theme-secondary mb-2 flex items-center gap-2">
              <CalendarOff className="w-4 h-4" />
              Current Blocks
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {blockedRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                >
                  <div>
                    <p className="text-sm text-red-400 font-medium">
                      {formatDateLong(request.startDate)}
                      {request.startDate !== request.endDate && ` - ${formatDateLong(request.endDate)}`}
                    </p>
                    {request.reason && (
                      <p className="text-xs text-theme-tertiary mt-1">{request.reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <h4 className="text-sm font-medium text-theme-secondary">
            Add Block Out Days
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              Reason (required)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              placeholder="Reason for block"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <div className="flex-1" />
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-sm font-medium"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-400 transition-all hover:scale-105 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Blocking...' : 'Block Days'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
