'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { Modal } from './Modal';
import { ROLES, Role } from '../types';
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
    selectedDate 
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
    
    if (!employeeId || !date || startHour >= endHour) return;

    if (isEditing && modalData?.id) {
      updateShift(modalData.id, {
        employeeId,
        date,
        startHour,
        endHour,
        notes: notes || undefined,
      });
    } else {
      addShift({
        employeeId,
        date,
        startHour,
        endHour,
        notes: notes || undefined,
        status: 'scheduled',
      });
    }
    
    closeModal();
  };

  const handleDelete = () => {
    if (isEditing && modalData?.id) {
      deleteShift(modalData.id);
      closeModal();
    }
  };

  // Group employees by role
  const employeesByRole = employees.reduce((acc, emp) => {
    if (!acc[emp.role]) acc[emp.role] = [];
    acc[emp.role].push(emp);
    return acc;
  }, {} as Record<Role, typeof employees>);

  // Generate hour options
  const hourOptions = Array.from({ length: 19 }, (_, i) => i + 6); // 6am to 12am

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title={isEditing ? 'Edit Shift' : 'Add Shift'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Employee Select */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Employee
          </label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            required
          >
            <option value="">Select employee...</option>
            {(Object.keys(ROLES) as Role[]).map(role => (
              <optgroup key={role} label={ROLES[role].label}>
                {employeesByRole[role]?.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            required
          />
        </div>

        {/* Time Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              Start Time
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
              End Time
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

        {/* Duration display */}
        <div className="text-sm text-theme-tertiary">
          Duration: {endHour - startHour} hours
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            placeholder="Any special instructions..."
          />
        </div>

        {/* Actions */}
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
            className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-sm font-medium"
          >
            {isEditing ? 'Save Changes' : 'Add Shift'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
