'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { Modal } from './Modal';
import { ROLES } from '../types';
import { formatDateLong } from '../utils/timeUtils';
import { Mail, Phone, Calendar, DollarSign, Clock, Edit2 } from 'lucide-react';

export function EmployeeProfileModal() {
  const { 
    modalType, 
    modalData, 
    closeModal, 
    openModal,
    shifts,
    timeOffRequests,
  } = useScheduleStore();
  
  const isOpen = modalType === 'employeeProfile';
  const employee = modalData;

  if (!isOpen || !employee) return null;

  const roleConfig = ROLES[employee.role];
  
  // Calculate stats
  const employeeShifts = shifts.filter(s => s.employeeId === employee.id);
  const thisWeekShifts = employeeShifts.filter(s => {
    const shiftDate = new Date(s.date);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return shiftDate >= weekStart && shiftDate <= weekEnd;
  });
  const weeklyHours = thisWeekShifts.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);
  
  const pendingRequests = timeOffRequests.filter(
    r => r.employeeId === employee.id && r.status === 'pending'
  );

  const handleEdit = () => {
    closeModal();
    openModal('editEmployee', employee);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={closeModal} 
      title="Employee Profile"
      size="lg"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold"
            style={{
              backgroundColor: roleConfig.bgColor,
              color: roleConfig.color,
            }}
          >
            {employee.name.split(' ').map((n: string) => n[0]).join('')}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-theme-primary">
                {employee.name}
              </h3>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: roleConfig.bgColor,
                  color: roleConfig.color,
                }}
              >
                {roleConfig.label}
              </span>
            </div>
            <p className="text-sm text-theme-tertiary mt-1">
              Hired {formatDateLong(employee.hireDate)}
            </p>
          </div>
          <button
            onClick={handleEdit}
            className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-theme-tertiary rounded-lg">
            <Mail className="w-4 h-4 text-theme-tertiary" />
            <div>
              <p className="text-xs text-theme-muted">Email</p>
              <p className="text-sm text-theme-primary">{employee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-theme-tertiary rounded-lg">
            <Phone className="w-4 h-4 text-theme-tertiary" />
            <div>
              <p className="text-xs text-theme-muted">Phone</p>
              <p className="text-sm text-theme-primary">{employee.phone || 'Not set'}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-theme-tertiary rounded-lg text-center">
            <Clock className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-theme-primary">{weeklyHours}h</p>
            <p className="text-xs text-theme-muted">This Week</p>
          </div>
          <div className="p-4 bg-theme-tertiary rounded-lg text-center">
            <Calendar className="w-5 h-5 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-theme-primary">{employee.maxHoursPerWeek}h</p>
            <p className="text-xs text-theme-muted">Max/Week</p>
          </div>
          <div className="p-4 bg-theme-tertiary rounded-lg text-center">
            <DollarSign className="w-5 h-5 text-amber-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-theme-primary">${employee.hourlyRate}</p>
            <p className="text-xs text-theme-muted">Per Hour</p>
          </div>
        </div>

        {/* Pending Time Off */}
        {pendingRequests.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-theme-secondary mb-2">
              Pending Time Off Requests
            </h4>
            <div className="space-y-2">
              {pendingRequests.map(request => (
                <div
                  key={request.id}
                  className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg"
                >
                  <p className="text-sm text-amber-400 font-medium">
                    {formatDateLong(request.startDate)}
                    {request.startDate !== request.endDate && ` - ${formatDateLong(request.endDate)}`}
                  </p>
                  <p className="text-xs text-theme-tertiary mt-1">{request.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Shifts */}
        <div>
          <h4 className="text-sm font-medium text-theme-secondary mb-2">
            Upcoming Shifts
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {employeeShifts
              .filter(s => new Date(s.date) >= new Date())
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5)
              .map(shift => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between p-3 bg-theme-tertiary rounded-lg"
                >
                  <span className="text-sm text-theme-primary">
                    {formatDateLong(shift.date)}
                  </span>
                  <span className="text-sm text-theme-secondary">
                    {shift.startHour > 12 ? shift.startHour - 12 : shift.startHour}
                    {shift.startHour >= 12 ? 'pm' : 'am'} - 
                    {shift.endHour > 12 ? shift.endHour - 12 : shift.endHour}
                    {shift.endHour >= 12 ? 'pm' : 'am'}
                  </span>
                </div>
              ))}
            {employeeShifts.filter(s => new Date(s.date) >= new Date()).length === 0 && (
              <p className="text-sm text-theme-muted text-center py-4">
                No upcoming shifts scheduled
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
