'use client';

import { useState, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { Modal } from './Modal';
import { ROLES, Role } from '../types';

export function AddEmployeeModal() {
  const { 
    modalType, 
    modalData, 
    closeModal, 
    addEmployee, 
    updateEmployee,
    deleteEmployee,
  } = useScheduleStore();
  
  const isOpen = modalType === 'addEmployee' || modalType === 'editEmployee';
  const isEditing = modalType === 'editEmployee';
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('front');
  const [hourlyRate, setHourlyRate] = useState(15);
  const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(40);
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (isEditing && modalData) {
        setName(modalData.name);
        setEmail(modalData.email);
        setPhone(modalData.phone || '');
        setRole(modalData.role);
        setHourlyRate(modalData.hourlyRate);
        setMaxHoursPerWeek(modalData.maxHoursPerWeek);
        setPin(modalData.pin || '');
      } else {
        setName('');
        setEmail('');
        setPhone('');
        setRole('front');
        setHourlyRate(15);
        setMaxHoursPerWeek(40);
        setPin('');
      }
    }
  }, [isOpen, isEditing, modalData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !role) return;

    const employeeData = {
      name,
      email,
      phone: phone || undefined,
      role,
      color: ROLES[role].color,
      hourlyRate,
      maxHoursPerWeek,
      hireDate: new Date().toISOString().split('T')[0],
      isActive: true,
      pin: pin || undefined,
    };

    if (isEditing && modalData?.id) {
      updateEmployee(modalData.id, employeeData);
    } else {
      addEmployee(employeeData);
    }
    
    closeModal();
  };

  const handleDelete = () => {
    if (isEditing && modalData?.id) {
      deleteEmployee(modalData.id);
      closeModal();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title={isEditing ? 'Edit Employee' : 'Add Employee'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Full Name
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

        {/* Email */}
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
            required
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Phone (optional)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="555-0100"
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            {(Object.keys(ROLES) as Role[]).map(r => (
              <option key={r} value={r}>
                {ROLES[r].label}
              </option>
            ))}
          </select>
        </div>

        {/* Hourly Rate & Max Hours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              Hourly Rate ($)
            </label>
            <input
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              min={1}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              Max Hours/Week
            </label>
            <input
              type="number"
              value={maxHoursPerWeek}
              onChange={(e) => setMaxHoursPerWeek(Number(e.target.value))}
              min={1}
              max={60}
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
        </div>

        {/* PIN */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            Login PIN (4 digits)
          </label>
          <input
            type="text"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="1234"
            maxLength={4}
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
            {isEditing ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
