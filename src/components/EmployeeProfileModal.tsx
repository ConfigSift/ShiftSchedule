'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { SECTIONS } from '../types';
import { formatDateLong } from '../utils/timeUtils';
import { Mail, Phone, FileText, Edit2, Calendar, Clock, Shield } from 'lucide-react';

export function EmployeeProfileModal() {
  const { 
    modalType, 
    modalData, 
    closeModal, 
    openModal,
    shifts,
    timeOffRequests,
  } = useScheduleStore();

  const { isManager, currentUser } = useAuthStore();
  
  const isOpen = modalType === 'employeeProfile';
  const employee = modalData;

  if (!isOpen || !employee) return null;

  const sectionConfig = SECTIONS[employee.section];
  const isOwnProfile = currentUser?.id === employee.id;
  const canEdit = isManager || isOwnProfile;
  
  // Stats
  const employeeShifts = shifts.filter(s => s.employeeId === employee.id);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  const thisWeekShifts = employeeShifts.filter(s => {
    const shiftDate = new Date(s.date);
    return shiftDate >= weekStart && shiftDate <= weekEnd;
  });
  const weeklyHours = thisWeekShifts.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);
  
  const pendingRequests = timeOffRequests.filter(
    r => r.employeeId === employee.id && r.status === 'pending'
  );

  const handleEdit = () => {
    if (isManager) {
      closeModal();
      openModal('editEmployee', employee);
    }
  };

  const handleRequestTimeOff = () => {
    closeModal();
    openModal('timeOffRequest', { employeeId: employee.id });
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
              backgroundColor: sectionConfig.bgColor,
              color: sectionConfig.color,
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
                  backgroundColor: sectionConfig.bgColor,
                  color: sectionConfig.color,
                }}
              >
                {sectionConfig.label}
              </span>
              {employee.userRole === 'manager' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-500 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Manager
                </span>
              )}
            </div>
            <p className="text-sm text-theme-tertiary mt-1">
              {employee.isActive ? 'Active' : 'Inactive'}
            </p>
          </div>
          {isManager && (
            <button
              onClick={handleEdit}
              className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-hover text-theme-secondary hover:text-theme-primary transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-theme-tertiary rounded-lg">
            <Mail className="w-4 h-4 text-theme-tertiary" />
            <div>
              <p className="text-xs text-theme-muted">Email</p>
              <p className="text-sm text-theme-primary">{employee.profile?.email || 'Not set'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-theme-tertiary rounded-lg">
            <Phone className="w-4 h-4 text-theme-tertiary" />
            <div>
              <p className="text-xs text-theme-muted">Phone</p>
              <p className="text-sm text-theme-primary">{employee.profile?.phone || 'Not set'}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {employee.profile?.notes && (
          <div className="p-3 bg-theme-tertiary rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-theme-tertiary" />
              <p className="text-xs text-theme-muted">Notes</p>
            </div>
            <p className="text-sm text-theme-primary">{employee.profile.notes}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-theme-tertiary rounded-lg text-center">
            <Clock className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-theme-primary">{weeklyHours}h</p>
            <p className="text-xs text-theme-muted">This Week</p>
          </div>
          <div className="p-4 bg-theme-tertiary rounded-lg text-center">
            <Calendar className="w-5 h-5 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-theme-primary">{employeeShifts.length}</p>
            <p className="text-xs text-theme-muted">Total Shifts</p>
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
                  <p className="text-sm text-amber-500 font-medium">
                    {formatDateLong(request.startDate)}
                    {request.startDate !== request.endDate && ` - ${formatDateLong(request.endDate)}`}
                  </p>
                  {request.reason && (
                    <p className="text-xs text-theme-tertiary mt-1">{request.reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request Time Off Button */}
        {(isOwnProfile || isManager) && (
          <button
            onClick={handleRequestTimeOff}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors font-medium"
          >
            <Calendar className="w-5 h-5" />
            Request Time Off
          </button>
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
