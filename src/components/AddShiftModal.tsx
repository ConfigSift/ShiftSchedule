'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { JOB_OPTIONS, SECTIONS, Section } from '../types';
import { formatHour } from '../utils/timeUtils';
import { getUserRole, isManagerRole } from '../utils/role';

export function AddShiftModal() {
  const { 
    modalType, 
    modalData, 
    closeModal, 
    getEmployeesForRestaurant,
    locations,
    addShift, 
    updateShift,
    deleteShift,
    selectedDate,
    showToast,
    hasApprovedTimeOff,
    hasBlockedShiftOnDate,
  } = useScheduleStore();

  const { activeRestaurantId, currentUser } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));
  
  const isOpen = modalType === 'addShift' || modalType === 'editShift';
  const isEditing = modalType === 'editShift';
  const modalKey = isEditing && modalData?.modalKey
    ? String(modalData.modalKey)
    : isEditing && modalData?.id
    ? `${modalData.id}:${modalData.date ?? ''}:${modalData.startHour ?? ''}:${modalData.endHour ?? ''}`
    : 'shift-modal';
  
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [notes, setNotes] = useState('');
  const [job, setJob] = useState('');
  const [locationId, setLocationId] = useState('');
  const [showAllJobs, setShowAllJobs] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isEditing && modalData) {
        const draftDate = modalData.draftDate ?? modalData.date;
        const draftStart = modalData.draftStartHour ?? modalData.startHour;
        const draftEnd = modalData.draftEndHour ?? modalData.endHour;
        setEmployeeId(modalData.employeeId);
        setDate(draftDate);
        setStartHour(draftStart);
        setEndHour(draftEnd);
        setNotes(modalData.notes || '');
        setJob(modalData.job || '');
        setLocationId(modalData.locationId || '');
        setShowAllJobs(false);
      } else {
        setEmployeeId(modalData?.employeeId || '');
        setDate(modalData?.date || selectedDate.toISOString().split('T')[0]);
        setStartHour(modalData?.startHour || 9);
        setEndHour(modalData?.endHour || 17);
        setNotes('');
        setJob('');
        setLocationId('');
        setShowAllJobs(false);
      }
    }
  }, [isOpen, isEditing, modalData, selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isManager) {
      showToast("You don't have permission to modify shifts.", 'error');
      return;
    }

    if (!employeeId || !date || startHour >= endHour) {
      showToast('Please fill in all fields correctly', 'error');
      return;
    }

    if (!job) {
      showToast('Please select a job', 'error');
      return;
    }

    if (selectedEmployee && !hasEligibleJobs) {
      showToast('No eligible jobs assigned to this employee', 'error');
      return;
    }

    if (selectedEmployee && hasEligibleJobs && !isJobEligible) {
      const confirmed = window.confirm(
        "This job isn't in the employee's job list. Assign anyway?"
      );
      if (!confirmed) return;
    }

    let allowTimeOffOverride = false;
    if (hasApprovedTimeOff(employeeId, date)) {
      const confirmed = window.confirm(
        'Employee has approved time off on this date. Assign anyway?'
      );
      if (!confirmed) return;
      allowTimeOffOverride = true;
    }

    let allowBlockedOverride = false;
    if (hasBlockedShiftOnDate(employeeId, date)) {
      const confirmed = window.confirm(
        'This employee is blocked out on that date. Assign anyway?'
      );
      if (!confirmed) return;
      allowBlockedOverride = true;
    }

    const normalizedLocationId = locationId || null;

    if (isEditing && modalData?.id) {
      const result = await updateShift(
        modalData.id,
        {
        employeeId,
        date,
        startHour,
        endHour,
        notes: notes || undefined,
        job,
        locationId: normalizedLocationId,
        restaurantId: modalData.restaurantId ?? activeRestaurantId ?? '',
        },
        { allowTimeOffOverride, allowBlockedOverride }
      );
      if (!result.success) {
        showToast(result.error || 'Failed to update shift', 'error');
        return;
      }
      showToast('Shift updated successfully', 'success');
    } else {
      const result = await addShift(
        {
          employeeId,
          date,
          startHour,
          endHour,
          notes: notes || undefined,
          job,
          locationId: normalizedLocationId,
          restaurantId: activeRestaurantId ?? '',
        },
        { allowTimeOffOverride, allowBlockedOverride }
      );
      if (!result.success) {
        showToast(result.error || 'Failed to add shift', 'error');
        return;
      }
      showToast('Shift added successfully', 'success');
    }
    
    closeModal();
  };

  const handleDelete = async () => {
    if (isEditing && modalData?.id) {
      const result = await deleteShift(modalData.id);
      if (!result.success) {
        showToast(result.error || 'Failed to delete shift', 'error');
        return;
      }
      showToast('Shift deleted', 'success');
      closeModal();
    }
  };

  const activeEmployees = getEmployeesForRestaurant(activeRestaurantId).filter(e => e.isActive);
  const employeesBySection = activeEmployees.reduce((acc, emp) => {
    if (!acc[emp.section]) acc[emp.section] = [];
    acc[emp.section].push(emp);
    return acc;
  }, {} as Record<Section, typeof activeEmployees>);

  const selectedEmployee = activeEmployees.find((emp) => emp.id === employeeId);
  const eligibleJobs = selectedEmployee?.jobs ?? [];
  const hasEligibleJobs = eligibleJobs.length > 0;
  const isJobEligible = job ? eligibleJobs.includes(job) : false;

  const hourOptions = Array.from({ length: 19 }, (_, i) => i + 6);

  return (
    <Modal
      key={modalKey}
      isOpen={isOpen}
      onClose={closeModal}
      title={isEditing ? 'Edit Shift' : 'Add Shift'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isManager && (
          <p className="text-sm text-red-400">
            You don't have permission to create or edit shifts.
          </p>
        )}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            required
            disabled={!isManager}
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
            disabled={!isManager}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">Job / Position</label>
          <select
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            required
            disabled={!isManager}
          >
            <option value="">Select job...</option>
            {(showAllJobs || !hasEligibleJobs ? JOB_OPTIONS : eligibleJobs).map((option) => {
              const eligible = eligibleJobs.includes(option);
              const label = showAllJobs && hasEligibleJobs && !eligible ? `${option} (Ineligible)` : option;
              return (
                <option key={option} value={option}>
                  {label}
                </option>
              );
            })}
          </select>
          {hasEligibleJobs && (
            <label className="mt-2 flex items-center gap-2 text-xs text-theme-tertiary">
              <input
                type="checkbox"
                checked={showAllJobs}
                onChange={(e) => setShowAllJobs(e.target.checked)}
                className="accent-amber-500"
              />
              Show all jobs
            </label>
          )}
          {selectedEmployee && !hasEligibleJobs && (
            <p className="text-xs text-red-400 mt-1">
              No eligible jobs assigned.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">Location (optional)</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            disabled={!isManager}
          >
            <option value="">No location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">Start Time</label>
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              disabled={!isManager}
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
              disabled={!isManager}
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
            disabled={!isManager}
          />
        </div>

        <div className="flex gap-3 pt-2">
          {isEditing && isManager && (
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
            disabled={!isManager || (selectedEmployee && !hasEligibleJobs)}
            className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-all hover:scale-105 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEditing ? 'Save Changes' : 'Add Shift'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
