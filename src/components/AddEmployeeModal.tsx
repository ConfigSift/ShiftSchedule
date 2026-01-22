'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { SECTIONS, Section, UserRole } from '../types';
import { hashPin } from '../utils/timeUtils';

export function AddEmployeeModal() {
  const { 
    modalType, 
    modalData, 
    closeModal, 
    addEmployee, 
    updateEmployee,
    updateEmployeePin,
    deleteEmployee,
    showToast,
  } = useScheduleStore();

  const { isManager } = useAuthStore();
  
  const isOpen = modalType === 'addEmployee' || modalType === 'editEmployee';
  const isEditing = modalType === 'editEmployee';
  
  const [name, setName] = useState('');
  const [section, setSection] = useState<Section>('front');
  const [userRole, setUserRole] = useState<UserRole>('staff');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (isOpen) {
      if (isEditing && modalData) {
        setName(modalData.name);
        setSection(modalData.section);
        setUserRole(modalData.userRole);
        setEmail(modalData.profile?.email || '');
        setPhone(modalData.profile?.phone || '');
        setNotes(modalData.profile?.notes || '');
        setPin('');
        setIsActive(modalData.isActive);
      } else {
        setName('');
        setSection('front');
        setUserRole('staff');
        setEmail('');
        setPhone('');
        setNotes('');
        setPin('');
        setIsActive(true);
      }
    }
  }, [isOpen, isEditing, modalData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !section) {
      showToast('Please fill in required fields', 'error');
      return;
    }

    if (!isEditing && (!pin || pin.length !== 4)) {
      showToast('PIN must be 4 digits', 'error');
      return;
    }

    if (isEditing && modalData?.id) {
      updateEmployee(modalData.id, {
        name,
        section,
        userRole,
        isActive,
        profile: { email, phone, notes },
      });
      
      // Update PIN if provided
      if (pin && pin.length === 4) {
        await updateEmployeePin(modalData.id, pin);
      }
      
      showToast('Employee updated successfully', 'success');
    } else {
      const pinHash = await hashPin(pin);
      addEmployee({
        name,
        section,
        userRole,
        pinHash,
        isActive: true,
        profile: { email, phone, notes },
      });
      showToast('Employee added successfully', 'success');
    }
    
    closeModal();
  };

  const handleDelete = () => {
    if (isEditing && modalData?.id) {
      deleteEmployee(modalData.id);
      showToast('Employee deleted', 'success');
      closeModal();
    }
  };

  if (!isManager) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title={isEditing ? 'Edit Employee' : 'Add Employee'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Full Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="John Smith"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              Section *
            </label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as Section)}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {(Object.keys(SECTIONS) as Section[]).map(s => (
                <option key={s} value={s}>
                  {SECTIONS[s].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              Role *
            </label>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="john@restaurant.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="555-0100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            {isEditing ? 'New PIN (leave blank to keep current)' : 'PIN *'} (4 digits)
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="••••"
            maxLength={4}
            required={!isEditing}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            placeholder="Any additional notes..."
          />
        </div>

        {isEditing && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isActive ? 'bg-green-500' : 'bg-theme-tertiary'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-theme-secondary">Active Employee</span>
          </div>
        )}

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
            className="px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition-all hover:scale-105 text-sm font-medium"
          >
            {isEditing ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
