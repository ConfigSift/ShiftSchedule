'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { Modal } from './Modal';
import { formatDateLong, formatHour } from '../utils/timeUtils';
import { Trash2 } from 'lucide-react';

export function BlockedPeriodModal() {
  const { 
    modalType, 
    closeModal, 
    addBlockedPeriod,
    deleteBlockedPeriod,
    blockedPeriods,
    currentUser,
  } = useScheduleStore();
  
  const isOpen = modalType === 'blockedPeriod';
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [blockFullDay, setBlockFullDay] = useState(true);
  const [startHour, setStartHour] = useState(11);
  const [endHour, setEndHour] = useState(22);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      setStartDate(nextWeek.toISOString().split('T')[0]);
      setEndDate(nextWeek.toISOString().split('T')[0]);
      setBlockFullDay(true);
      setStartHour(11);
      setEndHour(22);
      setReason('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate || !reason || !currentUser) return;

    addBlockedPeriod({
      startDate,
      endDate,
      startHour: blockFullDay ? undefined : startHour,
      endHour: blockFullDay ? undefined : endHour,
      reason,
      createdBy: currentUser.id,
    });
    
    closeModal();
  };

  const hourOptions = Array.from({ length: 19 }, (_, i) => i + 6);

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
            <h4 className="text-sm font-medium text-theme-secondary mb-2">
              Current Blocked Periods
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
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
                    {period.startHour !== undefined && (
                      <p className="text-xs text-red-400/70">
                        {formatHour(period.startHour)} - {formatHour(period.endHour!)}
                      </p>
                    )}
                    <p className="text-xs text-theme-tertiary mt-1">{period.reason}</p>
                  </div>
                  <button
                    onClick={() => deleteBlockedPeriod(period.id)}
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

          {/* Date Range */}
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

          {/* Full Day Toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBlockFullDay(!blockFullDay)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                blockFullDay ? 'bg-amber-500' : 'bg-theme-tertiary'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  blockFullDay ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-theme-secondary">Block entire day(s)</span>
          </div>

          {/* Hour Range (if not full day) */}
          {!blockFullDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  Start Hour
                </label>
                <select
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {hourOptions.map(hour => (
                    <option key={hour} value={hour}>
                      {formatHour(hour)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  End Hour
                </label>
                <select
                  value={endHour}
                  onChange={(e) => setEndHour(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {hourOptions.map(hour => (
                    <option key={hour} value={hour} disabled={hour <= startHour}>
                      {formatHour(hour)}
                    </option>
                  ))}
                  <option value={24}>12am (midnight)</option>
                </select>
              </div>
            </div>
          )}

          {/* Reason */}
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

          {/* Actions */}
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
              className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-400 transition-colors text-sm font-medium"
            >
              Add Blocked Period
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
