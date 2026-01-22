'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { formatDateLong } from '../utils/timeUtils';
import { Trash2, CalendarOff } from 'lucide-react';

export function BlockedPeriodModal() {
  const { 
    modalType, 
    closeModal, 
    addBlockedPeriod,
    deleteBlockedPeriod,
    blockedPeriods,
    showToast,
  } = useScheduleStore();

  const { currentUser, isManager } = useAuthStore();
  
  const isOpen = modalType === 'blockedPeriod';
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      setStartDate(nextWeek.toISOString().split('T')[0]);
      setEndDate(nextWeek.toISOString().split('T')[0]);
      setReason('');
    }
  }, [isOpen]);

  if (!isManager) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate || !reason || !currentUser) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    addBlockedPeriod({
      startDate,
      endDate,
      reason,
      createdBy: currentUser.id,
    });
    
    showToast('Blocked period added', 'success');
    setStartDate('');
    setEndDate('');
    setReason('');
  };

  const handleDelete = (id: string) => {
    deleteBlockedPeriod(id);
    showToast('Blocked period removed', 'success');
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title="Manage Blocked Periods"
      size="lg"
    >
      <div className="space-y-6">
        {/* Existing Blocked Periods */}
        {blockedPeriods.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-theme-secondary mb-2 flex items-center gap-2">
              <CalendarOff className="w-4 h-4" />
              Current Blocked Periods
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {blockedPeriods.map(period => (
                <div
                  key={period.id}
                  className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                >
                  <div>
                    <p className="text-sm text-red-400 font-medium">
                      {formatDateLong(period.startDate)}
                      {period.startDate !== period.endDate && ` - ${formatDateLong(period.endDate)}`}
                    </p>
                    <p className="text-xs text-theme-tertiary mt-1">{period.reason}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(period.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <h4 className="text-sm font-medium text-theme-secondary">
            Add New Blocked Period
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
              Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="e.g., Valentine's Day - All hands on deck"
              required
            />
          </div>

          <p className="text-xs text-theme-muted">
            Blocking a period prevents employees from requesting time off during these dates.
          </p>

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
              className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-400 transition-all hover:scale-105 text-sm font-medium"
            >
              Add Blocked Period
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
