'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { Modal } from './Modal';
import { SECTIONS, Section } from '../types';
import { formatHour } from '../utils/timeUtils';

export function AddShiftModal() {
  const { 
    modalType, 
    modalData, 
    closeModal, 
    employees, 
    addShift, 
    updateShift,
    deleteShift,
    selectedDate,
    showToast,
    hasApprovedTimeOff,
  } = useScheduleStore();
  
  const isOpen = modalType === 'addShift' || modalType === 'editShift';
  const isEditing = modalType === 'editShift';
  
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (isEditing && modalData) {
        setEmployeeId(modalData.employeeId);
        setDate(modalData.date);
        setStartHour(modalData.startHour);
        setEndHour(modalData.endHour);
        setNotes(modalData.notes || '');
      } else {
        setEmployeeId(modalData?.employeeId || '');
        setDate(modalData?.date || selectedDate.toISOString().split('T')[0]);
        setStartHour(modalData?.startHour || 9);
        setEndHour(modalData?.endHour || 17);
        setNotes('');
      }
    }
  }, [isOpen, isEditing, modalData, selectedDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!employeeId || !date || startHour >= endHour) {
      showToast('Please fill in all fields correctly', 'error');
      return;
    }

    if (hasApprovedTimeOff(employeeId, date)) {
      showToast('Employee has approved time off on this date', 'error');
      return;
    }

    if (isEditing && modalData?.id) {
      const result = updateShift(modalData.id, {
        employeeId,
        date,
        startHour,
        endHour,
        notes: notes || undefined,
      });
      if (!result.success) {
        showToast(result.error || 'Failed to update shift', 'error');
        return;
      }
      showToast('Shift updated successfully', 'success');
    } else {
      const result = addShift({
        employeeId,
        date,
        startHour,
        endHour,
        notes: notes || undefined,
      });
      if (!result.success) {
        showToast(result.error || 'Failed to add shift', 'error');
        return;
      }
      showToast('Shift added successfully', 'success');
    }
    
    closeModal();
  };

  const handleDelete = () => {
    if (isEditing && modalData?.id) {
      deleteShift(modalData.id);
      showToast('Shift deleted', 'success');
      closeModal();
    }
  };

  const activeEmployees = employees.filter(e => e.isActive);
  const employeesBySection = activeEmployees.reduce((acc, emp) => {
    if (!acc[emp.section]) acc[emp.section] = [];
    acc[emp.section].push(emp);
    return acc;
  }, {} as Record<Section, typeof employees>);

  const hourOptions = Array.from({ length: 19 }, (_, i) => i + 6);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title={isEditing ? 'Edit Shift' : 'Add Shift'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            required
          >
            <option value="">Select employee...</option>
            {(Object.keys(SECTIONS) as Section[]).map(section => (
              <optgroup key={section} label={SECTIONS[section].label}>
                {employeesBySection[section]?.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">Start Time</label>
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {hourOptions.map(hour => (
                <option key={hour} value={hour}>{formatHour(hour)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">End Time</label>
            <select
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {hourOptions.map(hour => (
                <option key={hour} value={hour} disabled={hour <= startHour}>{formatHour(hour)}</option>
              ))}
              <option value={24}>12am (midnight)</option>
            </select>
          </div>
        </div>

        <div className="text-sm text-theme-tertiary">Duration: {endHour - startHour} hours</div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            placeholder="Any special instructions..."
          />
        </div>

        <div className="flex gap-3 pt-2">
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium"
            >
              Delete
            </button>
          )}
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
            {isEditing ? 'Save Changes' : 'Add Shift'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
