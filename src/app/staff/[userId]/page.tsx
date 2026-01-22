'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarOff, Shield, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase/client';
import { useAuthStore } from '../../../store/authStore';
import { useScheduleStore } from '../../../store/scheduleStore';
import { Toast } from '../../../components/Toast';
import { JOB_OPTIONS } from '../../../types';
import { getUserRole, isManagerRole } from '../../../utils/role';
import { normalizeUserRow } from '../../../utils/userMapper';
import { formatDateLong } from '../../../utils/timeUtils';

type ProfileUser = {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  phone: string;
  accountType: string;
  jobs: string[];
};

export default function StaffProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params?.userId ?? '');

  const { currentUser, init, isInitialized, activeRestaurantId, updateProfile, userProfiles, signOut } = useAuthStore();
  const { loadRestaurantData, getBlockedShiftsForEmployee, deleteBlockedPeriod, openModal, showToast } =
    useScheduleStore();

  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('EMPLOYEE');
  const [jobs, setJobs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [authBanner, setAuthBanner] = useState<string | null>(null);

  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);
  const isAdmin = currentRole === 'ADMIN';
  const allowAdminCreation = process.env.NEXT_PUBLIC_ENABLE_ADMIN_CREATION === 'true';
  const isSelf = Boolean(currentUser?.id && currentUser.id === user?.id);
  const targetRole = getUserRole(user?.accountType);
  const showSiteManager = isManager && userProfiles.length > 1;

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  }, [activeRestaurantId, loadRestaurantData]);

  useEffect(() => {
    if (isInitialized && (!currentUser || !activeRestaurantId)) {
      router.push('/login?notice=login');
    }
  }, [isInitialized, currentUser, activeRestaurantId, router]);

  useEffect(() => {
    if (!isInitialized || !currentUser || !activeRestaurantId) return;
    if (currentRole === 'EMPLOYEE' && currentUser.id !== userId) {
      router.push('/dashboard?notice=forbidden');
    }
  }, [isInitialized, currentUser, activeRestaurantId, currentRole, userId, router]);

  const loadUser = async () => {
    if (!activeRestaurantId || !userId) return;
    setLoading(true);
    setError('');

    const { data, error: loadError } = (await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('organization_id', activeRestaurantId)
      .maybeSingle()) as {
      data: Record<string, any> | null;
      error: { message: string } | null;
    };

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setError('User not found.');
      setLoading(false);
      return;
    }

    const normalized = normalizeUserRow(data);
    const mapped: ProfileUser = {
      id: normalized.id,
      authUserId: normalized.authUserId ?? null,
      fullName: normalized.fullName,
      email: normalized.email ?? '',
      phone: normalized.phone ?? '',
      accountType: normalized.role,
      jobs: normalized.jobs,
    };

    setUser(mapped);
    setFullName(mapped.fullName);
    setPhone(mapped.phone);
    setAccountType(mapped.accountType);
    setJobs(mapped.jobs);
    setLoading(false);
  };

  useEffect(() => {
    if (isInitialized && currentUser && activeRestaurantId && userId) {
      loadUser();
    }
  }, [isInitialized, currentUser, activeRestaurantId, userId]);

  const blockedShifts = useMemo(() => {
    if (!user) return [];
    return getBlockedShiftsForEmployee(user.id);
  }, [user, getBlockedShiftsForEmployee]);

  const parseBlockedReason = (note?: string) => {
    if (!note) return '';
    return note.replace('[BLOCKED]', '').trim();
  };

  const canEditJobs = isAdmin || (isManager && targetRole !== 'ADMIN');
  const canEditAccountType = isAdmin && !isSelf;
  const canEditProfile = currentRole === 'EMPLOYEE'
    ? isSelf
    : isManager && (isAdmin || targetRole !== 'ADMIN');

  const toggleJob = (job: string) => {
    setJobs((prev) => (prev.includes(job) ? prev.filter((j) => j !== job) : [...prev, job]));
  };

  const handleSave = async () => {
    if (!user || !activeRestaurantId) return;
    setError('');
    setAuthBanner(null);
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && jobs.length === 0 && canEditJobs) {
      setError('Managers and employees must have at least one job.');
      return;
    }

    setSaving(true);
    try {
      if (currentRole === 'EMPLOYEE') {
        const result = await updateProfile({ fullName: fullName.trim(), phone: phone.trim() || null });
        if (!result.success) {
          setError(result.error || 'Unable to update profile.');
          setSaving(false);
          return;
        }
        await loadUser();
        showToast('Profile updated', 'success');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/admin/update-user', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          organizationId: activeRestaurantId,
          fullName: fullName.trim(),
          phone: phone.trim() || '',
          accountType: canEditAccountType ? accountType : undefined,
          jobs: canEditJobs ? jobs : user.jobs,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          const message = 'Session expired. Please sign out and sign in again.';
          setAuthBanner(message);
          showToast(message, 'error');
          setError(message);
        } else if (response.status === 403) {
          const message = 'You dont have permission for that action.';
          setError(message);
          showToast(message, 'error');
        } else {
          setError(payload.error || 'Unable to update profile.');
        }
        setSaving(false);
        return;
      }

      await loadUser();
      showToast('Profile updated', 'success');
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!isManager) return;
    const confirmed = window.confirm('Remove this blocked day?');
    if (!confirmed) return;
    const result = await deleteBlockedPeriod(blockId);
    if (!result.success) {
      showToast(result.error || 'Unable to remove block', 'error');
      return;
    }
    showToast('Block removed', 'success');
  };

  if (!isInitialized || loading || !currentUser || !activeRestaurantId) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-2">
            {isManager ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-theme-tertiary">
                <Link href="/staff" className="hover:text-theme-primary">
                  Back to Staff
                </Link>
                <span>/</span>
                <Link href="/dashboard" className="hover:text-theme-primary">
                  Dashboard
                </Link>
                {showSiteManager && (
                  <>
                    <span>/</span>
                    <Link href="/manager" className="hover:text-theme-primary">
                      Site Manager
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-theme-tertiary">
                <Link href="/dashboard" className="hover:text-theme-primary">
                  Back to Dashboard
                </Link>
              </div>
            )}
            <h1 className="text-2xl font-bold text-theme-primary">{user.fullName}</h1>
            <p className="text-theme-tertiary">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {isManager && (
              <button
                type="button"
                onClick={() => openModal('blockedPeriod', { employeeId: user.id })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <CalendarOff className="w-4 h-4" />
                Block Out Days
              </button>
            )}
          </div>
        </header>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
          {authBanner && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>{authBanner}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                  await signOut();
                  router.push('/login?notice=signed-out');
                }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 text-xs font-semibold hover:bg-amber-400"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/login?notice=session-expired')}
                  className="px-3 py-1.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover text-xs"
                >
                  Go to login
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            {isManagerRole(targetRole) && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-500 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {targetRole}
              </span>
            )}
            {!isManagerRole(targetRole) && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-theme-tertiary text-theme-secondary">
                EMPLOYEE
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-theme-secondary">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={!canEditProfile}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-sm text-theme-secondary">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!canEditProfile}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-sm text-theme-secondary">Email</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary opacity-60"
              />
            </div>
            <div>
              <label className="text-sm text-theme-secondary">Account type</label>
              {canEditAccountType && (allowAdminCreation || targetRole !== 'ADMIN') ? (
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                >
                  {allowAdminCreation && <option value="ADMIN">ADMIN</option>}
                  <option value="MANAGER">MANAGER</option>
                  <option value="EMPLOYEE">EMPLOYEE</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={targetRole}
                  disabled
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary opacity-60"
                />
              )}
              {!canEditAccountType && (
                <p className="text-xs text-theme-muted mt-2">
                  Only admins can change account type.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm text-theme-secondary">Jobs</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {JOB_OPTIONS.map((job) => (
                <label key={job} className="flex items-center gap-2 text-xs text-theme-secondary">
                  <input
                    type="checkbox"
                    checked={jobs.includes(job)}
                    onChange={() => toggleJob(job)}
                    disabled={!canEditJobs}
                    className="accent-amber-500"
                  />
                  {job}
                </label>
              ))}
            </div>
            {!canEditJobs && jobs.length === 0 && (
              <p className="text-xs text-theme-muted mt-1">No jobs assigned.</p>
            )}
            {canEditJobs ? (
              <p className="text-xs text-theme-muted mt-2">
                Managers and employees must have at least one job.
              </p>
            ) : (
              <p className="text-xs text-theme-muted mt-2">Jobs can only be edited by managers or admins.</p>
            )}
          </div>

          {canEditProfile && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-theme-primary">Blocked Days</h2>
          {blockedShifts.length === 0 ? (
            <p className="text-theme-muted text-sm">No blocked days on record.</p>
          ) : (
            <div className="space-y-2">
              {blockedShifts.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3"
                >
                  <div>
                    <p className="text-sm text-red-400 font-medium">{formatDateLong(shift.date)}</p>
                    <p className="text-xs text-theme-tertiary">
                      {parseBlockedReason(shift.notes) || 'Blocked'}
                    </p>
                  </div>
                  {isManager && (
                    <button
                      type="button"
                      onClick={() => handleDeleteBlock(shift.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Toast />
    </div>
  );
}
