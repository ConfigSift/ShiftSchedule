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
import { apiFetch } from '../../../lib/apiClient';

type ProfileUser = {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  phone: string;
  employeeNumber?: number | null;
  accountType: string;
  jobs: string[];
  hourlyPay?: number;
  jobPay?: Record<string, number>;
};

export default function StaffProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params?.userId ?? '');

  const { currentUser, init, isInitialized, activeRestaurantId, updateProfile, signOut, accessibleRestaurants } = useAuthStore();
  const { loadRestaurantData, getBlockedRequestsForEmployee, deleteBlockedPeriod, openModal, showToast } =
    useScheduleStore();

  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('EMPLOYEE');
  const [jobs, setJobs] = useState<string[]>([]);
  const [jobPay, setJobPay] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [authBanner, setAuthBanner] = useState<string | null>(null);

  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);
  const isAdmin = currentRole === 'ADMIN';
  const allowAdminCreation = process.env.NEXT_PUBLIC_ENABLE_ADMIN_CREATION === 'true';
  const isSelf = Boolean(currentUser?.id && currentUser.id === user?.id);
  const targetRole = getUserRole(user?.accountType);
  const hasManagerMembership = accessibleRestaurants.some((restaurant) => {
    const value = String(restaurant.role ?? '').trim().toLowerCase();
    return value === 'admin' || value === 'manager';
  });

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
      employeeNumber: normalized.employeeNumber ?? null,
      accountType: normalized.role,
      jobs: normalized.jobs,
      hourlyPay: normalized.hourlyPay,
      jobPay: normalized.jobPay,
    };

    setUser(mapped);
    setFullName(mapped.fullName);
    setPhone(mapped.phone);
    setAccountType(mapped.accountType);
    setJobs(mapped.jobs);
    const initialJobPay: Record<string, string> = {};
    mapped.jobs.forEach((job) => {
      const value = mapped.jobPay?.[job];
      initialJobPay[job] = value !== undefined ? value.toFixed(2) : '0.00';
    });
    setJobPay(initialJobPay);
    setEmail(mapped.email);
    setEmployeeNumber(mapped.employeeNumber ? String(mapped.employeeNumber).padStart(4, '0') : '');
    setLoading(false);
  };

  useEffect(() => {
    if (isInitialized && currentUser && activeRestaurantId && userId) {
      loadUser();
    }
  }, [isInitialized, currentUser, activeRestaurantId, userId]);

  const blockedShifts = useMemo(() => {
    if (!user) return [];
    return getBlockedRequestsForEmployee(user.id).filter((req) => req.status === 'APPROVED');
  }, [user, getBlockedRequestsForEmployee]);

  const parseBlockedReason = (note?: string) => note ?? '';

  const canEditJobs = isAdmin || (isManager && targetRole !== 'ADMIN');
  const canEditAccountType = isAdmin && !isSelf;
  const canEditProfile = isSelf || (isManager && (isAdmin || targetRole !== 'ADMIN'));

  const toggleJob = (job: string) => {
    setJobs((prev) => {
      if (prev.includes(job)) {
        setJobPay((payPrev) => {
          const updated = { ...payPrev };
          delete updated[job];
          return updated;
        });
        return prev.filter((j) => j !== job);
      }
      setJobPay((payPrev) => ({ ...payPrev, [job]: '0.00' }));
      return [...prev, job];
    });
  };

  const handleSave = async () => {
    if (!user || !activeRestaurantId) return;
    setError('');
    setAuthBanner(null);
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (employeeNumber.trim() && !/^\d{4}$/.test(employeeNumber.trim())) {
      setError('Employee number must be 4 digits.');
      return;
    }
    if (employeeNumber.trim() === '0000') {
      setError('Employee number 0000 is not allowed.');
      return;
    }
    if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && jobs.length === 0 && canEditJobs) {
      setError('Managers and employees must have at least one job.');
      return;
    }

    setSaving(true);
    let emailPendingNotice = false;
    try {
      if (isSelf && !isAdmin) {
        const result = await updateProfile({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
        });
        if (!result.success) {
          setError(result.error || 'Unable to update profile.');
          setSaving(false);
          return;
        }
        emailPendingNotice = Boolean(result.emailPending);
        if (currentRole === 'EMPLOYEE') {
          await loadUser();
          showToast(
            emailPendingNotice ? 'Check your email to confirm this change.' : 'Profile updated',
            'success'
          );
          setSaving(false);
          return;
        }
      }

      const jobPayPayload: Record<string, number> = {};
      for (const job of jobs) {
        const rawValue = jobPay[job];
        if (rawValue === undefined || rawValue === '') continue;
        const parsed = parseFloat(rawValue);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setError(`Invalid hourly pay for ${job}.`);
          setSaving(false);
          return;
        }
        jobPayPayload[job] = Math.round(parsed * 100) / 100;
      }
      const payValues = Object.values(jobPayPayload);
      const avgHourlyPay = payValues.length > 0
        ? Math.round((payValues.reduce((sum, v) => sum + v, 0) / payValues.length) * 100) / 100
        : 0;

      const result = await apiFetch('/api/admin/update-user', {
        method: 'POST',
        json: {
          userId: user.id,
          organizationId: activeRestaurantId,
          fullName: fullName.trim(),
          email: isAdmin && isSelf ? email.trim() : undefined,
          phone: phone.trim() || '',
          employeeNumber: employeeNumber.trim() ? Number(employeeNumber) : undefined,
          accountType: canEditAccountType ? accountType : undefined,
          jobs: canEditJobs ? jobs : user.jobs,
          hourlyPay: canEditJobs ? avgHourlyPay : user.hourlyPay,
          jobPay: canEditJobs ? jobPayPayload : user.jobPay,
        },
      });

      if (!result.ok) {
        if (result.status === 401) {
          const message = 'Session expired. Please sign out and sign in again.';
          setAuthBanner(message);
          showToast(message, 'error');
          setError(message);
        } else if (result.status === 403) {
          const message = 'You dont have permission for that action.';
          setError(message);
          showToast(message, 'error');
        } else if (result.status === 409 && result.code === 'EMPLOYEE_ID_TAKEN') {
          setError('Employee ID already exists. Please choose a different one.');
        } else if (result.status === 409 && result.code === 'EMAIL_TAKEN_ORG') {
          setError('Email is already used by another employee in this restaurant.');
        } else if (result.status === 409 && result.code === 'EMAIL_TAKEN_AUTH') {
          setError('Email is already used by another account.');
        } else if (result.status === 409 && result.code === 'MISSING_AUTH_ID') {
          setError(
            result.error || 'User has no auth identity. Ask an admin to re-link this user.'
          );
        } else if (result.status === 404 && result.code === 'TARGET_NOT_FOUND') {
          setError('Target user not found.');
        } else if (result.status === 422 && result.code === 'INVALID_UUID') {
          setError(result.error || 'Invalid identifier for this user.');
        } else {
          setError(result.error || 'Unable to update profile.');
        }
        setSaving(false);
        return;
      }

      await loadUser();
      showToast(
        emailPendingNotice ? 'Check your email to confirm this change.' : 'Profile updated',
        'success'
      );
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
                {hasManagerMembership && (
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isSelf}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-sm text-theme-secondary">Employee # (4 digits)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  if (employeeNumber.trim() && /^\d{1,4}$/.test(employeeNumber.trim())) {
                    setEmployeeNumber(employeeNumber.trim().padStart(4, '0'));
                  }
                }}
                disabled={!canEditProfile}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
              />
            </div>
          {isManager && (
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
          )}
          </div>
          {isManager && (
            <>
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
              {jobs.length > 0 && (
                <div>
                  <label className="text-sm text-theme-secondary">Hourly Pay by Job</label>
                  <div className="mt-2 space-y-2">
                    {jobs.map((job) => (
                      <div key={job} className="flex items-center gap-2">
                        <label className="text-xs text-theme-secondary w-32 shrink-0 truncate" title={job}>
                          {job}
                        </label>
                        <div className="flex-1 flex items-center gap-1">
                          <span className="text-xs text-theme-muted">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={jobPay[job] ?? ''}
                            onChange={(e) => setJobPay((prev) => ({ ...prev, [job]: e.target.value }))}
                            disabled={!canEditJobs}
                            placeholder="0.00"
                            className="flex-1 px-2 py-1.5 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm disabled:opacity-60"
                          />
                          <span className="text-xs text-theme-muted">/hr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

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
                    <p className="text-sm text-red-400 font-medium">
                      {formatDateLong(shift.startDate)}
                      {shift.startDate !== shift.endDate && ` - ${formatDateLong(shift.endDate)}`}
                    </p>
                    <p className="text-xs text-theme-tertiary">
                      {parseBlockedReason(shift.reason) || 'Blocked'}
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
