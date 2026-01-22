'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../store/authStore';
import { JOB_OPTIONS } from '../../types';
import { getUserRole, isManagerRole } from '../../utils/role';
import { normalizeJobs } from '../../utils/jobs';
import { StaffProfileModal } from '../../components/StaffProfileModal';

interface OrgUser {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  phone: string;
  accountType: string;
  jobs: string[];
}

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  accountType: 'EMPLOYEE',
  jobs: [] as string[],
  passcode: '',
};

export default function StaffPage() {
  const router = useRouter();
  const { currentUser, init, isInitialized, activeRestaurantId } = useAuthStore();

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const currentRole = getUserRole(currentUser?.role);
  const isManager = isManagerRole(currentRole);
  const isAdmin = currentRole === 'ADMIN';
  const allowAdminCreation = process.env.NEXT_PUBLIC_ENABLE_ADMIN_CREATION === 'true';

  const canManageUser = (user: OrgUser) => {
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

  const normalizeAccountType = (value: unknown) => getUserRole(value);

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
      .order('full_name', { ascending: true })) as {
      data: Array<Record<string, any>> | null;
      error: { message: string } | null;
    };

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const mapped = (data || []).map((row) => ({
      id: row.id,
      authUserId: row.auth_user_id ?? null,
      fullName: row.full_name ?? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      email: row.email ?? '',
      phone: row.phone ?? '',
      accountType: normalizeAccountType(row.account_type ?? row.role),
      jobs: normalizeJobs(row.jobs),
    }));

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
    const missingFields: string[] = [];
    if (!formState.fullName.trim()) missingFields.push('Full name');
    if (!formState.email.trim()) missingFields.push('Email');
    if (!formState.passcode.trim()) missingFields.push('Passcode');
    if (missingFields.length > 0) {
      setError(`Missing required fields: ${missingFields.join(', ')}.`);
      return;
    }

    if (!/^\d{6}$/.test(formState.passcode)) {
      setError('Passcode must be exactly 6 digits.');
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
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: activeRestaurantId,
          fullName: formState.fullName.trim(),
          phone: formState.phone.trim() || '',
          email: formState.email.trim().toLowerCase(),
          accountType: formState.accountType,
          jobs: formState.jobs,
          passcode: formState.passcode,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const isDev = process.env.NODE_ENV !== 'production';
        if (response.status === 401) {
          setError('You must be logged in as an ADMIN/MANAGER.');
        } else if (response.status === 403) {
          setError(payload.error || 'You do not have permission to create this user.');
        } else if (response.status === 400 && payload?.error) {
          setError(isDev ? payload.error : 'Unable to create user. Please verify the fields.');
        } else {
          setError(isDev ? payload.error || 'Unable to create user.' : 'Unable to create user.');
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

    const response = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        organizationId: activeRestaurantId,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || 'Unable to delete user.');
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

    if (!/^\d{6}$/.test(resetPasscode)) {
      setError('Passcode must be exactly 6 digits.');
      return;
    }

    if (resetPasscode !== resetConfirm) {
      setError('Passcodes do not match.');
      return;
    }

    if (canResetSelf()) {
      const confirmed = window.confirm('Reset your own passcode? This will sign you out.');
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/set-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: activeRestaurantId,
          email: resetTarget.email || undefined,
          authUserId: resetTarget.email ? undefined : resetTarget.authUserId,
          passcode: resetPasscode,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || 'Unable to reset passcode.');
        setSubmitting(false);
        return;
      }

      setSuccessMessage('Passcode updated.');
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

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-4">
          {loading ? (
            <p className="text-theme-secondary">Loading team...</p>
          ) : users.length === 0 ? (
            <p className="text-theme-muted">No users found.</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-theme-tertiary border border-theme-primary rounded-xl p-4"
                >
                  <div>
                    <p className="text-theme-primary font-medium">{user.fullName}</p>
                    <p className="text-xs text-theme-muted">{user.email}</p>
                    <p className="text-xs text-theme-muted">{user.phone}</p>
                    <p className="text-xs text-theme-muted mt-1">
                      {user.accountType}
                      {user.jobs.length > 0 ? ` - ${user.jobs.join(', ')}` : ''}
                    </p>
                  </div>
                  {isManager && (
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/staff/${user.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-theme-secondary text-theme-secondary hover:bg-theme-hover transition-colors text-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => openProfile(user, 'edit')}
                        disabled={!canManageUser(user)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-theme-secondary text-theme-secondary hover:bg-theme-hover transition-colors text-xs disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        disabled={!canManageUser(user) || user.authUserId === currentUser?.authUserId}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openResetModal(user)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors text-xs"
                        >
                          Reset Passcode
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative w-full max-w-lg bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">
              Add User
            </h2>
            <div className="space-y-3">
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
                <label className="text-sm text-theme-secondary">Passcode (6 digits)</label>
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

            <div className="flex items-center justify-end gap-2">
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
      />

      {resetModalOpen && resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeResetModal} />
          <div className="relative w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Reset Passcode</h2>
            <p className="text-sm text-theme-tertiary">
              Update passcode for {resetTarget.fullName || resetTarget.email}.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-theme-secondary">New passcode</label>
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
                <label className="text-sm text-theme-secondary">Confirm passcode</label>
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
                {submitting ? 'Updating...' : 'Update Passcode'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
