'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../store/authStore';
import { useScheduleStore } from '../../store/scheduleStore';
import { Toast } from '../../components/Toast';
import { JOB_OPTIONS } from '../../types';
import { getUserRole, isManagerRole } from '../../utils/role';
import { normalizeUserRow } from '../../utils/userMapper';
import { StaffProfileModal } from '../../components/StaffProfileModal';
import { apiFetch } from '../../lib/apiClient';

interface OrgUser {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  phone: string;
  accountType: string;
  jobs: string[];
  hourlyPay?: number;
  jobPay?: Record<string, number>;
}

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  accountType: 'EMPLOYEE',
  jobs: [] as string[],
  passcode: '',
  hourlyPay: '0',
};

export default function StaffPage() {
  const router = useRouter();
  const { currentUser, init, isInitialized, activeRestaurantId, signOut } = useAuthStore();
  const { showToast } = useScheduleStore();

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<OrgUser | null>(null);
  const [resetPasscode, setResetPasscode] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [profileUser, setProfileUser] = useState<OrgUser | null>(null);
  const [profileMode, setProfileMode] = useState<'view' | 'edit' | null>(null);
  const [authBanner, setAuthBanner] = useState<string | null>(null);

  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);
  const isAdmin = currentRole === 'ADMIN';
  const allowAdminCreation = process.env.NEXT_PUBLIC_ENABLE_ADMIN_CREATION === 'true';

  const canManageUser = (user: OrgUser) => {
    if (isAdmin) return true;
    if (!isManager) return false;
    return user.accountType !== 'ADMIN';
  };

  const canResetPin = (user: OrgUser) => {
    if (isAdmin) return true;
    if (!isManager) return false;
    return user.accountType !== 'ADMIN';
  };

  const accountTypeOptions = useMemo(() => {
    if (isAdmin) {
      return allowAdminCreation ? ['ADMIN', 'MANAGER', 'EMPLOYEE'] : ['MANAGER', 'EMPLOYEE'];
    }
    return ['MANAGER', 'EMPLOYEE'];
  }, [isAdmin, allowAdminCreation]);


  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && (!currentUser || !isManager)) {
      router.push('/dashboard?notice=forbidden');
    }
  }, [isInitialized, currentUser, isManager, router]);

  useEffect(() => {
    if (isInitialized && currentUser && isManager && !activeRestaurantId) {
      router.push('/manager');
    }
  }, [isInitialized, currentUser, isManager, activeRestaurantId, router]);

  const loadUsers = async () => {
    if (!activeRestaurantId) return;
    setLoading(true);
    setError('');

    const { data, error: loadError } = (await supabase
      .from('users')
      .select('*')
      .eq('organization_id', activeRestaurantId)
      .order('email', { ascending: true })) as {
      data: Array<Record<string, any>> | null;
      error: { message: string } | null;
    };

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const mapped = (data || []).map((row) => {
      const normalized = normalizeUserRow(row);
      return {
        id: normalized.id,
        authUserId: normalized.authUserId ?? null,
        fullName: normalized.fullName,
        email: normalized.email ?? '',
        phone: normalized.phone ?? '',
        accountType: normalized.role,
        jobs: normalized.jobs,
        hourlyPay: normalized.hourlyPay,
        jobPay: normalized.jobPay,
      };
    });

    setUsers(mapped);
    setLoading(false);
  };

  useEffect(() => {
    if (activeRestaurantId && isInitialized && currentUser) {
      loadUsers();
    }
  }, [activeRestaurantId, isInitialized, currentUser]);

  const openAddModal = () => {
    setFormState(EMPTY_FORM);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormState(EMPTY_FORM);
    setError('');
  };

  const openResetModal = (user: OrgUser) => {
    setError('');
    setSuccessMessage('');
    setResetTarget(user);
    setResetPasscode('');
    setResetConfirm('');
    setResetModalOpen(true);
  };

  const closeResetModal = () => {
    setResetModalOpen(false);
    setResetTarget(null);
    setResetPasscode('');
    setResetConfirm('');
  };

  const openProfile = (user: OrgUser, mode: 'view' | 'edit') => {
    setError('');
    setSuccessMessage('');
    setProfileUser(user);
    setProfileMode(mode);
  };

  const closeProfile = () => {
    setProfileUser(null);
    setProfileMode(null);
  };

  const handleAuthExpired = (message: string) => {
    setAuthBanner(message);
    showToast(message, 'error');
    setError(message);
  };

  const toggleJob = (job: string) => {
    setFormState((prev) => ({
      ...prev,
      jobs: prev.jobs.includes(job) ? prev.jobs.filter((j) => j !== job) : [...prev.jobs, job],
    }));
  };

  const handleSave = async () => {
    if (!activeRestaurantId) return;
    setError('');
    setSuccessMessage('');
    setAuthBanner(null);
    const missingFields: string[] = [];
    if (!formState.fullName.trim()) missingFields.push('Full name');
    if (!formState.email.trim()) missingFields.push('Email');
    if (!formState.passcode.trim()) missingFields.push('PIN');
    if (missingFields.length > 0) {
      setError(`Missing required fields: ${missingFields.join(', ')}.`);
      return;
    }

    if (!/^\d{6}$/.test(formState.passcode)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }

    if (!accountTypeOptions.includes(formState.accountType)) {
      setError('Invalid account type selection.');
      return;
    }

    if (['EMPLOYEE', 'MANAGER'].includes(formState.accountType) && formState.jobs.length === 0) {
      setError('Managers and employees must have at least one job.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await apiFetch('/api/admin/create-user', {
        method: 'POST',
        json: {
          organizationId: activeRestaurantId,
          fullName: formState.fullName.trim(),
          phone: formState.phone.trim() || '',
          email: formState.email.trim().toLowerCase(),
          accountType: formState.accountType,
          jobs: formState.jobs,
          pinCode: formState.passcode,
          hourlyPay: Number(formState.hourlyPay || 0),
        },
      });

      if (!result.ok) {
        const isDev = process.env.NODE_ENV !== 'production';
        if (result.status === 401) {
          const message = 'Session expired. Please sign out and sign in again.';
          handleAuthExpired(isDev ? result.error || message : message);
        } else if (result.status === 403) {
          const message = 'You dont have permission for that action.';
          setError(isDev ? result.error || message : message);
          showToast(message, 'error');
        } else if (result.status === 400 && result.error) {
          setError(isDev ? result.error : 'Unable to create user. Please verify the fields.');
        } else {
          setError(isDev ? result.error || 'Unable to create user.' : 'Unable to create user.');
        }
        setSubmitting(false);
        return;
      }

      await loadUsers();
      setSuccessMessage('User created successfully.');
      closeModal();
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: OrgUser) => {
    if (!activeRestaurantId) return;
    if (user.authUserId && user.authUserId === currentUser?.authUserId) {
      setError("You can't delete your own account.");
      return;
    }

    const confirmed = window.confirm(`Delete ${user.fullName || user.email}? This cannot be undone.`);
    if (!confirmed) return;

    const result = await apiFetch('/api/admin/delete-user', {
      method: 'POST',
      json: {
        userId: user.id,
        organizationId: activeRestaurantId,
      },
    });

    if (!result.ok) {
      if (result.status === 401) {
        const message = 'Session expired. Please sign out and sign in again.';
        handleAuthExpired(message);
      } else if (result.status === 403) {
        const message = 'You dont have permission for that action.';
        setError(message);
        showToast(message, 'error');
      } else {
        setError(result.error || 'Unable to delete user.');
      }
      return;
    }

    await loadUsers();
  };

  const canResetSelf = () => {
    if (!resetTarget || !currentUser) return false;
    return resetTarget.authUserId === currentUser.authUserId;
  };

  const handleResetPasscode = async () => {
    if (!activeRestaurantId || !resetTarget) return;
    setError('');
    setSuccessMessage('');
    setAuthBanner(null);

    if (!/^\d{6}$/.test(resetPasscode)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }

    if (resetPasscode !== resetConfirm) {
      setError('PINs do not match.');
      return;
    }

    if (canResetSelf()) {
      const confirmed = window.confirm('Reset your own PIN? This will sign you out.');
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch('/api/admin/set-passcode', {
        method: 'POST',
        json: {
          organizationId: activeRestaurantId,
          email: resetTarget.email || undefined,
          authUserId: resetTarget.email ? undefined : resetTarget.authUserId,
          pinCode: resetPasscode,
        },
      });

      if (!result.ok) {
        if (result.status === 401) {
          const message = 'Session expired. Please sign out and sign in again.';
          handleAuthExpired(message);
        } else if (result.status === 403) {
          const message = 'You dont have permission for that action.';
          setError(message);
          showToast(message, 'error');
        } else {
          setError(result.error || 'Unable to reset PIN.');
        }
        setSubmitting(false);
        return;
      }

      setSuccessMessage('PIN updated.');
      closeResetModal();
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isInitialized || !currentUser || !activeRestaurantId) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => {
      if (user.fullName.toLowerCase().includes(term)) return true;
      if (user.email.toLowerCase().includes(term)) return true;
      const parts = user.fullName.toLowerCase().split(/\s+/);
      return parts.some((part) => part.includes(term));
    });
  }, [users, searchTerm]);

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-theme-primary">Staff</h1>
            <p className="text-theme-tertiary mt-1">Manage team members for this restaurant.</p>
          </div>
          {isManager && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          )}
        </header>

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
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg p-3">
            {successMessage}
          </div>
        )}

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-4 space-y-3">
          {loading ? (
            <p className="text-theme-secondary">Loading team...</p>
          ) : users.length === 0 ? (
            <p className="text-theme-muted">No users found.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 text-sm">
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 bg-theme-primary/40 border border-theme-primary rounded-lg px-3 py-2 text-sm text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="text-xs text-theme-muted hover:text-theme-primary"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-2 divide-y divide-theme-primary/30">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <p className="text-theme-primary font-medium text-base leading-tight">{user.fullName}</p>
                      <p className="text-xs text-theme-muted">{user.email}</p>
                      <p className="text-xs text-theme-muted">{user.phone}</p>
                      <p className="text-xs text-theme-muted mt-1">
                        {user.accountType}
                        {user.jobs.length > 0 ? ` · ${user.jobs.join(', ')}` : ''}
                        {typeof user.hourlyPay === 'number' ? ` · $${user.hourlyPay.toFixed(2)}/hr` : ''}
                      </p>
                    </div>
                    {isManager && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => openProfile(user, 'edit')}
                          disabled={!canManageUser(user)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-theme-secondary text-theme-secondary hover:bg-theme-hover transition-colors disabled:opacity-50"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          disabled={!canManageUser(user) || user.authUserId === currentUser?.authUserId}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                        {canResetPin(user) && (
                          <button
                            type="button"
                            onClick={() => openResetModal(user)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                          >
                            Reset PIN
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative w-full max-w-lg bg-theme-secondary border border-theme-primary rounded-2xl p-6 max-h-[90vh] overflow-hidden flex flex-col">
            <h2 className="text-lg font-semibold text-theme-primary shrink-0">
              Add User
            </h2>
            <div className="space-y-3 overflow-y-auto pr-1 mt-4 flex-1">
              <div>
                <label className="text-sm text-theme-secondary">Full name</label>
                <input
                  type="text"
                  value={formState.fullName}
                  onChange={(e) => setFormState((prev) => ({ ...prev, fullName: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Email</label>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Phone</label>
                <input
                  type="tel"
                  value={formState.phone}
                  onChange={(e) => setFormState((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Hourly Pay</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.hourlyPay}
                  onChange={(e) => setFormState((prev) => ({ ...prev, hourlyPay: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Account type</label>
                <select
                  value={formState.accountType}
                  onChange={(e) => setFormState((prev) => ({ ...prev, accountType: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                >
                  {accountTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Jobs</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {JOB_OPTIONS.map((job) => (
                    <label key={job} className="flex items-center gap-2 text-xs text-theme-secondary">
                      <input
                        type="checkbox"
                        checked={formState.jobs.includes(job)}
                        onChange={() => toggleJob(job)}
                        className="accent-amber-500"
                      />
                      {job}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-theme-muted mt-2">
                  Managers and employees must have at least one job.
                </p>
              </div>
              <div>
                <label className="text-sm text-theme-secondary">PIN (6 digits)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={formState.passcode}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      passcode: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <StaffProfileModal
        isOpen={Boolean(profileUser && profileMode)}
        mode={profileMode ?? 'view'}
        user={profileUser}
        isAdmin={isAdmin}
        isManager={isManager}
        organizationId={activeRestaurantId}
        currentAuthUserId={currentUser?.authUserId ?? null}
        onClose={closeProfile}
        onSaved={loadUsers}
        onError={setError}
        onAuthError={handleAuthExpired}
      />

      {resetModalOpen && resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeResetModal} />
          <div className="relative w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Reset PIN</h2>
            <p className="text-sm text-theme-tertiary">
              Update PIN for {resetTarget.fullName || resetTarget.email}.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-theme-secondary">New PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={resetPasscode}
                  onChange={(e) => setResetPasscode(e.target.value.replace(/\D/g, ''))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value.replace(/\D/g, ''))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeResetModal}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetPasscode}
                disabled={!/^\d{6}$/.test(resetPasscode) || resetPasscode !== resetConfirm || submitting}
                className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Updating...' : 'Update PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast />
    </div>
  );
}
