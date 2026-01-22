'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { formatDateLong } from '../utils/timeUtils';

export function TimeOffRequestModal() {
  const { 
    modalType, 
    modalData,
    closeModal, 
    addTimeOffRequest,
    hasOrgBlackoutOnDate,
    showToast,
  } = useScheduleStore();

  const { currentUser, activeRestaurantId } = useAuthStore();
  
  const isOpen = modalType === 'timeOffRequest';
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const employeeId = modalData?.employeeId || currentUser?.id;

  useEffect(() => {
    if (isOpen) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setStartDate(tomorrow.toISOString().split('T')[0]);
      setEndDate(tomorrow.toISOString().split('T')[0]);
      setReason('');
      setNote('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate || !employeeId || !currentUser || !activeRestaurantId) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (endDate < startDate) {
      showToast('End date must be on or after the start date', 'error');
      return;
    }

    if (!reason.trim()) {
      showToast('Please add a reason for this request', 'error');
      return;
    }

    if (hasOrgBlackoutOnDate(startDate) || hasOrgBlackoutOnDate(endDate)) {
      showToast('Time off is not allowed on blackout dates', 'error');
      return;
    }

    const trimmedReason = reason.trim();
    const trimmedNote = note.trim();
    const combinedReason = trimmedNote
      ? `${trimmedReason}\n\nNote: ${trimmedNote}`
      : trimmedReason;

    const result = await addTimeOffRequest({
      employeeId,
      requesterAuthUserId: currentUser.authUserId,
      organizationId: activeRestaurantId,
      startDate,
      endDate,
      reason: combinedReason,
    });

    if (!result.success) {
      showToast(result.error || 'Unable to submit request', 'error');
      return;
    }

    showToast('Request submitted', 'success');
    closeModal();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title="Request Time Off"
      size="md"
    >
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
            placeholder="Why do you need this time off?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            placeholder="Additional context for your manager"
          />
        </div>

        <div className="p-3 bg-theme-tertiary rounded-lg">
          <p className="text-sm text-theme-secondary">
            Requesting time off from{' '}
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
            disabled={false}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition-all hover:scale-105 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Submit Request
          </button>
        </div>
      </form>
    </Modal>
  );
}
