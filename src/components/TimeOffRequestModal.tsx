'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { formatDateLong } from '../utils/timeUtils';
import { AlertTriangle } from 'lucide-react';

export function TimeOffRequestModal() {
  const { 
    modalType, 
    modalData,
    closeModal, 
    addTimeOffRequest,
    isDateBlocked,
    blockedPeriods,
    showToast,
  } = useScheduleStore();

  const { currentUser } = useAuthStore();
  
  const isOpen = modalType === 'timeOffRequest';
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [blockWarning, setBlockWarning] = useState<string | null>(null);

  const employeeId = modalData?.employeeId || currentUser?.id;

  useEffect(() => {
    if (isOpen) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setStartDate(tomorrow.toISOString().split('T')[0]);
      setEndDate(tomorrow.toISOString().split('T')[0]);
      setReason('');
      setBlockWarning(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (startDate && endDate) {
      const blocked = blockedPeriods.find(bp => {
        const reqStart = new Date(startDate);
        const reqEnd = new Date(endDate);
        const blockStart = new Date(bp.startDate);
        const blockEnd = new Date(bp.endDate);
        
        return (reqStart <= blockEnd && reqEnd >= blockStart);
      });
      
      if (blocked) {
        setBlockWarning(`This period overlaps with a blocked date: ${blocked.reason}`);
      } else {
        setBlockWarning(null);
      }
    }
  }, [startDate, endDate, blockedPeriods]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate || !employeeId) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (blockWarning) {
      showToast('Cannot request time off during blocked period', 'error');
      return;
    }

    addTimeOffRequest({
      employeeId,
      startDate,
      endDate,
      reason: reason || undefined,
    });
    
    showToast('Time off request submitted', 'success');
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

        {blockWarning && (
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Blocked Period</p>
              <p className="text-xs text-red-400/80 mt-0.5">{blockWarning}</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            placeholder="Why do you need this time off?"
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
            disabled={!!blockWarning}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition-all hover:scale-105 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Submit Request
          </button>
        </div>
      </form>
    </Modal>
  );
}
