'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { Toast } from '../../components/Toast';
import { SECTIONS } from '../../types';
import { formatDateLong } from '../../utils/timeUtils';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  FileText, 
  Calendar, 
  Clock, 
  Shield,
  Save,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { 
    hydrate, 
    isHydrated, 
    employees, 
    shifts,
    timeOffRequests,
    updateEmployee,
    openModal,
    showToast,
  } = useScheduleStore();
  const { currentUser, checkSession, isInitialized, setCurrentUser } = useAuthStore();

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated) {
      checkSession(employees);
    }
  }, [isHydrated, employees, checkSession]);

  useEffect(() => {
    if (isHydrated && isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [isHydrated, isInitialized, currentUser, router]);

  useEffect(() => {
    if (currentUser) {
      setEmail(currentUser.profile?.email || '');
      setPhone(currentUser.profile?.phone || '');
      setNotes(currentUser.profile?.notes || '');
    }
  }, [currentUser]);

  if (!isHydrated || !isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const sectionConfig = SECTIONS[currentUser.section];
  
  // Stats
  const myShifts = shifts.filter(s => s.employeeId === currentUser.id);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  const thisWeekShifts = myShifts.filter(s => {
    const shiftDate = new Date(s.date);
    return shiftDate >= weekStart && shiftDate <= weekEnd;
  });
  const weeklyHours = thisWeekShifts.reduce((sum, s) => sum + (s.endHour - s.startHour), 0);

  const pendingRequests = timeOffRequests.filter(
    r => r.employeeId === currentUser.id && r.status === 'pending'
  );

  const handleSave = () => {
    updateEmployee(currentUser.id, {
      profile: { email, phone, notes },
    });
    
    // Update current user in auth store
    const updated = employees.find(e => e.id === currentUser.id);
    if (updated) {
      setCurrentUser({ ...updated, profile: { email, phone, notes } });
    }
    
    showToast('Profile updated', 'success');
    setHasChanges(false);
  };

  const handleChange = (setter: (val: string) => void, value: string) => {
    setter(value);
    setHasChanges(true);
  };

  return (
    <div className="min-h-screen bg-theme-primary">
      {/* Header */}
      <header className="h-16 bg-theme-secondary border-b border-theme-primary flex items-center px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {/* Profile Header */}
        <div className="flex items-start gap-4 mb-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold"
            style={{
              backgroundColor: sectionConfig.bgColor,
              color: sectionConfig.color,
            }}
          >
            {currentUser.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-theme-primary">
                {currentUser.name}
              </h1>
              {currentUser.userRole === 'manager' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-500 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Manager
                </span>
              )}
            </div>
            <p className="text-theme-tertiary mt-1">{sectionConfig.label}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-theme-secondary border border-theme-primary rounded-xl text-center">
            <Clock className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-theme-primary">{weeklyHours}h</p>
            <p className="text-sm text-theme-muted">This Week</p>
          </div>
          <div className="p-4 bg-theme-secondary border border-theme-primary rounded-xl text-center">
            <Calendar className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-theme-primary">{myShifts.length}</p>
            <p className="text-sm text-theme-muted">Total Shifts</p>
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-theme-secondary border border-theme-primary rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-theme-primary mb-4">
            Contact Information
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                <Mail className="w-4 h-4 inline mr-2" />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => handleChange(setEmail, e.target.value)}
                className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => handleChange(setPhone, e.target.value)}
                className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="555-0100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                <FileText className="w-4 h-4 inline mr-2" />
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => handleChange(setNotes, e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                placeholder="Any notes about yourself..."
              />
            </div>

            {hasChanges && (
              <button
                onClick={handleSave}
                className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02]"
              >
                <Save className="w-5 h-5" />
                Save Changes
              </button>
            )}
          </div>
        </div>

        {/* Request Time Off */}
        <button
          onClick={() => openModal('timeOffRequest', { employeeId: currentUser.id })}
          className="w-full flex items-center justify-center gap-2 p-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/20 transition-colors font-medium mb-8"
        >
          <Calendar className="w-5 h-5" />
          Request Time Off
        </button>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-theme-primary mb-4">
              Pending Time Off Requests
            </h2>
            <div className="space-y-2">
              {pendingRequests.map(request => (
                <div
                  key={request.id}
                  className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl"
                >
                  <p className="font-medium text-amber-500">
                    {formatDateLong(request.startDate)}
                    {request.startDate !== request.endDate && ` - ${formatDateLong(request.endDate)}`}
                  </p>
                  {request.reason && (
                    <p className="text-sm text-theme-tertiary mt-1">{request.reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Shifts */}
        <div>
          <h2 className="text-lg font-semibold text-theme-primary mb-4">
            Upcoming Shifts
          </h2>
          <div className="space-y-2">
            {myShifts
              .filter(s => new Date(s.date) >= new Date())
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 7)
              .map(shift => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between p-4 bg-theme-secondary border border-theme-primary rounded-xl"
                >
                  <span className="text-theme-primary font-medium">
                    {formatDateLong(shift.date)}
                  </span>
                  <span className="text-theme-secondary">
                    {shift.startHour > 12 ? shift.startHour - 12 : shift.startHour}
                    {shift.startHour >= 12 ? 'pm' : 'am'} - 
                    {shift.endHour > 12 ? shift.endHour - 12 : shift.endHour}
                    {shift.endHour >= 12 ? 'pm' : 'am'}
                  </span>
                </div>
              ))}
            {myShifts.filter(s => new Date(s.date) >= new Date()).length === 0 && (
              <p className="text-center text-theme-muted py-8">
                No upcoming shifts scheduled
              </p>
            )}
          </div>
        </div>
      </main>

      <Toast />
    </div>
  );
}
