'use client';

import { useEffect, useState } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { formatDateLong } from '../utils/timeUtils';

export function BlockedDayRequestModal() {
  const { modalType, closeModal, submitBlockedDayRequest, showToast } = useScheduleStore();
  const { currentUser, activeRestaurantId } = useAuthStore();

  const isOpen = modalType === 'blockedDayRequest';
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const timer = setTimeout(() => {
      setStartDate(tomorrowStr);
      setEndDate(tomorrowStr);
      setReason('');
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeRestaurantId) {
      showToast('No active organization selected', 'error');
      return;
    }
    if (!startDate || !endDate || !reason.trim()) {
      showToast('Start date, end date, and reason are required', 'error');
      return;
    }
    if (endDate < startDate) {
      showToast('End date must be on or after the start date', 'error');
      return;
    }

    const result = await submitBlockedDayRequest({
      organizationId: activeRestaurantId,
      startDate,
      endDate,
      reason: reason.trim(),
    });

    if (!result.success) {
      showToast(result.error || 'Unable to submit request', 'error');
      return;
    }

    showToast('Blocked day request submitted', 'success');
    closeModal();
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Request Blocked Day" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
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
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Reason (required)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            placeholder="Why are you unavailable?"
          />
        </div>

        <div className="p-3 bg-theme-tertiary rounded-lg">
          <p className="text-sm text-theme-secondary">
            Requesting blocked time from{' '}
            <span className="text-theme-primary font-medium">
              {startDate ? formatDateLong(startDate) : '...'}
            </span>
            {startDate !== endDate && (
              <>
                {' '}to{' '}
                <span className="text-theme-primary font-medium">
                  {endDate ? formatDateLong(endDate) : '...'}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <div className="flex-1" />
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-all hover:scale-105 text-sm font-medium"
          >
            Submit Request
          </button>
        </div>
      </form>
    </Modal>
  );
}
