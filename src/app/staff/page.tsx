'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Edit3, XCircle } from 'lucide-react';
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
  employeeNumber?: number | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt?: string | null;
  expiresAt?: string | null;
  isInvite: true;
}

type StaffRow = OrgUser | PendingInvite;

const isInviteRow = (row: StaffRow): row is PendingInvite =>
  (row as PendingInvite).isInvite === true;

const EMPTY_FORM = {
  fullName: '',
  email: '',
  employeeNumber: '',
  phone: '',
  accountType: 'EMPLOYEE',
  jobs: [] as string[],
  passcode: '',
  jobPay: {} as Record<string, string>,
};

export default function StaffPage() {
  const router = useRouter();
  const { currentUser, init, isInitialized, activeRestaurantId, signOut } = useAuthStore();
  const { showToast } = useScheduleStore();

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [invitationMode, setInvitationMode] = useState(false);
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<OrgUser | null>(null);
  const [resetPasscode, setResetPasscode] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
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
      // Redirect to /restaurants to select a restaurant, not /manager (which just redirects to /restaurants anyway)
      router.push('/restaurants');
    }
  }, [isInitialized, currentUser, isManager, activeRestaurantId, router]);

  const loadUsers = async () => {
    if (!activeRestaurantId) return null;
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
      return null;
    }

    const mapped = (data || []).map((row) => {
      const normalized = normalizeUserRow(row);
      const displayEmail = normalized.email ?? normalized.realEmail ?? '';
      return {
        id: normalized.id,
        authUserId: normalized.authUserId ?? null,
        fullName: normalized.fullName,
        email: displayEmail,
        phone: normalized.phone ?? '',
        employeeNumber: normalized.employeeNumber ?? null,
        accountType: normalized.role,
        jobs: normalized.jobs,
        hourlyPay: normalized.hourlyPay,
        jobPay: normalized.jobPay,
      };
    });

    setUsers(mapped);
    const inviteResult = await apiFetch(
      `/api/admin/invitations?organization_id=${encodeURIComponent(activeRestaurantId)}`
    );
    if (!inviteResult.ok) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('[invitations] status', inviteResult.status, 'error', inviteResult.error);
      }
      setInvites([]);
      setLoading(false);
      return { users: mapped, invites: [] };
    }
    const inviteRows = Array.isArray(inviteResult.data?.invites) ? inviteResult.data.invites : [];
    const mappedInvites = inviteRows.map((invite: Record<string, any>) => ({
      id: String(invite.id),
      email: String(invite.email ?? ''),
      role: String(invite.role ?? 'employee'),
      status: String(invite.status ?? 'pending'),
      createdAt: invite.created_at ?? null,
      expiresAt: invite.expires_at ?? null,
      isInvite: true as const,
    }));
    setInvites(mappedInvites);
    setLoading(false);
    return { users: mapped, invites: mappedInvites };
  };

  useEffect(() => {
    if (activeRestaurantId && isInitialized && currentUser) {
      loadUsers();
    }
  }, [activeRestaurantId, isInitialized, currentUser]);

  const openAddModal = () => {
    setFormState(EMPTY_FORM);
    setInvitationMode(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormState(EMPTY_FORM);
    setError('');
    setInvitationMode(false);
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

  const openDeleteModal = (user: OrgUser) => {
    setError('');
    setSuccessMessage('');
    setDeleteTarget(user);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteTarget(null);
    setDeleteSubmitting(false);
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

  const handleEmailBlur = async () => {
    if (!activeRestaurantId) return;
    const normalizedEmail = formState.email.trim().toLowerCase();
    if (!normalizedEmail) {
      setInvitationMode(false);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setInvitationMode(false);
      return;
    }
    const result = await apiFetch(
      `/api/admin/check-email?organization_id=${encodeURIComponent(activeRestaurantId)}&email=${encodeURIComponent(normalizedEmail)}`
    );
    if (!result.ok) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('[check-email] status', result.status, 'error', result.error);
      }
      setInvitationMode(false);
      return;
    }
    setInvitationMode(Boolean(result.data?.exists));
  };

  // Handle profile save: update users array with returned user
  const handleProfileSaved = async (updatedUser?: OrgUser) => {
    if (updatedUser) {
      // Immediately update the users array with the returned user
      setUsers((prev) =>
        prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      );
      // Also update profileUser so if modal re-renders before close, it has fresh data
      setProfileUser(updatedUser);
      // Don't call loadUsers() here - we already have fresh data from API
      // Calling loadUsers() could overwrite with stale data due to replication lag
    } else {
      // Only refetch if we didn't get updated user from API
      await loadUsers();
    }
  };

  const handleAuthExpired = (message: string) => {
    setAuthBanner(message);
    showToast(message, 'error');
    setError(message);
  };

  const toggleJob = (job: string) => {
    setFormState((prev) => {
      const isSelected = prev.jobs.includes(job);
      const nextJobs = isSelected ? prev.jobs.filter((j) => j !== job) : [...prev.jobs, job];
      const nextJobPay = { ...prev.jobPay };
      if (isSelected) {
        delete nextJobPay[job];
      } else {
        nextJobPay[job] = '';
      }
      return { ...prev, jobs: nextJobs, jobPay: nextJobPay };
    });
  };

  const handleSave = async () => {
    if (!activeRestaurantId) return;
    setError('');
    setSuccessMessage('');
    setAuthBanner(null);
    const missingFields: string[] = [];
    if (!formState.fullName.trim()) missingFields.push('Full name');
    if (!formState.email.trim()) missingFields.push('Email');
    if (!formState.employeeNumber.trim()) missingFields.push('Employee number');
    if (!invitationMode && !formState.passcode.trim()) missingFields.push('PIN');
    if (missingFields.length > 0) {
      setError(`Missing required fields: ${missingFields.join(', ')}.`);
      return;
    }

    if (!invitationMode && !/^\d{4}$/.test(formState.passcode)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }

    if (!/^\d{4}$/.test(formState.employeeNumber.trim())) {
      setError('Employee number must be 4 digits.');
      return;
    }
    if (formState.employeeNumber.trim() === '0000') {
      setError('Employee number 0000 is not allowed.');
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

    const jobPayPayload: Record<string, number> = {};
    for (const job of formState.jobs) {
      const rawValue = formState.jobPay[job];
      if (rawValue === undefined || rawValue === '') continue;
      const parsed = parseFloat(rawValue);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(`Invalid hourly pay for ${job}.`);
        return;
      }
      jobPayPayload[job] = Math.round(parsed * 100) / 100;
    }
    const payValues = Object.values(jobPayPayload);
    const avgHourlyPay = payValues.length > 0
      ? Math.round((payValues.reduce((sum, v) => sum + v, 0) / payValues.length) * 100) / 100
      : 0;

    setSubmitting(true);

    try {
      const pinToSend = invitationMode ? '1111' : formState.passcode;
      const normalizedEmail = formState.email.trim().toLowerCase();
      const result = await apiFetch('/api/admin/create-user', {
        method: 'POST',
        json: {
          organizationId: activeRestaurantId,
          fullName: formState.fullName.trim(),
          phone: formState.phone.trim() || '',
          email: normalizedEmail,
          employeeNumber: Number(formState.employeeNumber),
          accountType: formState.accountType,
          jobs: formState.jobs,
          pinCode: pinToSend,
          hourlyPay: avgHourlyPay,
          jobPay: jobPayPayload,
        },
      });

      const responseData = result.data;
      const responseObject =
        responseData && typeof responseData === 'object'
          ? (responseData as Record<string, unknown>)
          : null;
      const created = Boolean(responseObject?.created);
      const invited = Boolean(responseObject?.invited);
      const alreadyMember = Boolean(
        (responseObject as Record<string, unknown> | null)?.already_member
        ?? (responseObject as Record<string, unknown> | null)?.alreadyMember
      );
      const isSuccess = created || invited || alreadyMember;

      if (!result.ok || !isSuccess) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log('[create-user] status', result.status, 'error', result.error, 'data', result.data);
        }
        const errorFromJson =
          responseObject && typeof responseObject.error === 'string' ? responseObject.error : '';
        const rawText = (result.rawText ?? '').trim();
        const baseMessage =
          errorFromJson
          || rawText
          || result.error
          || 'Unexpected response from server.';
        const trimmed = baseMessage.length > 300 ? `${baseMessage.slice(0, 300)}...` : baseMessage;
        const prefix = result.ok ? 'Unexpected response from server' : 'Request failed';
        const message = `${prefix} (status ${result.status}). ${trimmed}`;

        if (result.status === 401) {
          handleAuthExpired(message);
        } else {
          setError(message);
          if (result.status === 403) {
            showToast(message, 'error');
          }
        }
        setSubmitting(false);
        return;
      }

      let refreshedUsers: OrgUser[] = [];
      if (isSuccess) {
        const refreshResult = await loadUsers();
        refreshedUsers = refreshResult?.users ?? [];
      }

      if (created) {
        setSuccessMessage('Employee created.');
        closeModal();
      } else if (invited) {
        setSuccessMessage('Invitation sent.');
        setInvitationModalOpen(true);
        closeModal();
      } else if (alreadyMember) {
        const hasUser = refreshedUsers.some(
          (user) => user.email?.toLowerCase() === normalizedEmail
        );
        if (!hasUser) {
          const extra =
            responseObject && typeof responseObject.error === 'string'
              ? ` ${responseObject.error}`
              : '';
          setError(`Membership exists but profile missing for this restaurant.${extra}`);
          return;
        }
        setSuccessMessage('Employee already in this restaurant.');
        closeModal();
      }
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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    await handleDelete(deleteTarget);
    closeDeleteModal();
  };

  const handleRevokeInvite = async (invite: PendingInvite) => {
    const confirmed = window.confirm(`Cancel invitation for ${invite.email}?`);
    if (!confirmed) return;

    setError('');
    const result = await apiFetch('/api/admin/invitations/revoke', {
      method: 'POST',
      json: { invitationId: invite.id },
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
        setError(result.error || 'Unable to cancel invitation.');
        showToast(result.error || 'Unable to cancel invitation.', 'error');
      }
      return;
    }

    showToast('Invitation canceled', 'success');
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

    const normalizedPin = resetPasscode.replace(/\D/g, '').slice(0, 4);
    const normalizedConfirm = resetConfirm.replace(/\D/g, '').slice(0, 4);

    if (normalizedPin !== resetPasscode) {
      setResetPasscode(normalizedPin);
    }
    if (normalizedConfirm !== resetConfirm) {
      setResetConfirm(normalizedConfirm);
    }

    if (!/^\d{4}$/.test(normalizedPin)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }

    if (normalizedPin === '0000') {
      setError('PIN cannot be 0000.');
      return;
    }

    if (normalizedPin !== normalizedConfirm) {
      setError('PINs do not match.');
      return;
    }

    if (canResetSelf()) {
      const confirmed = window.confirm('Reset your own PIN? This will sign you out.');
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[reset-pin] pin', normalizedPin, normalizedPin.length, 'confirm', normalizedConfirm, normalizedConfirm.length);
      }
      const payload = {
        userId: resetTarget.id,
        pinCode: normalizedPin,
      };
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[reset-pin]', {
          userId: resetTarget.id,
          email: resetTarget.email,
          pinLen: normalizedPin.length,
        });
        // eslint-disable-next-line no-console
        console.debug('[reset-pin] payload', payload);
      }
      const result = await apiFetch('/api/admin/set-passcode', {
        method: 'POST',
        json: payload,
      });

      if (!result.ok) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log('[set-passcode] status', result.status, 'error', result.error, 'data', result.data);
        }
        if (result.status === 401) {
          const message = result.error || 'Session expired. Please sign out and sign in again.';
          handleAuthExpired(message);
        } else if (result.status === 403) {
          const message = result.error || 'You dont have permission for that action.';
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

  // Must be called before any early returns
  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const combined: StaffRow[] = [...users, ...invites];
    if (!term) return combined;
    return combined.filter((row) => {
      if (isInviteRow(row)) {
        return row.email.toLowerCase().includes(term);
      }
      if (row.fullName.toLowerCase().includes(term)) return true;
      if (row.email.toLowerCase().includes(term)) return true;
      const parts = row.fullName.toLowerCase().split(/\s+/);
      return parts.some((part) => part.includes(term));
    });
  }, [users, invites, searchTerm]);

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
          ) : filteredUsers.length === 0 ? (
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
              <p className="text-theme-muted">No users found.</p>
            </>
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
                {filteredUsers.map((row) => {
                  if (isInviteRow(row)) {
                    return (
                      <div
                        key={row.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3"
                      >
                        <div>
                          <p className="text-theme-primary font-medium text-base leading-tight">Pending Employee</p>
                          <p className="text-xs text-theme-muted">{row.email}</p>
                          <div className="mt-2">
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-400 px-2 py-0.5 text-xs font-semibold">
                              Invitation Sent
                            </span>
                          </div>
                        </div>
                        {isManager && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => handleRevokeInvite(row)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              <XCircle className="w-3 h-3" />
                              Cancel Invite
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  const user = row;

                  return (
                    <div
                      key={user.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3"
                    >
                      <div>
                        <p className="text-theme-primary font-medium text-base leading-tight">{user.fullName}</p>
                        <p className="text-xs text-theme-muted">{user.email}</p>
                        {user.employeeNumber !== null && user.employeeNumber !== undefined && (
                          <p className="text-xs text-theme-muted">
                            Employee #: {String(user.employeeNumber).padStart(4, '0')}
                          </p>
                        )}
                        <p className="text-xs text-theme-muted">{user.phone}</p>
                        <p className="text-xs text-theme-muted mt-1">
                          {user.accountType}
                          {user.jobs.length > 0 ? ` · ${user.jobs.join(', ')}` : ''}
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
                            onClick={() => openDeleteModal(user)}
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
                  );
                })}
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
                  onChange={(e) => {
                    setFormState((prev) => ({ ...prev, email: e.target.value }));
                    setInvitationMode(false);
                  }}
                  onBlur={handleEmailBlur}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Employee # (4 digits)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={formState.employeeNumber}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      employeeNumber: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
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
              {formState.jobs.length > 0 && (
                <div>
                  <label className="text-sm text-theme-secondary">Hourly Pay by Job</label>
                  <div className="mt-2 space-y-2">
                    {formState.jobs.map((job) => (
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
                            value={formState.jobPay[job] ?? ''}
                            onChange={(e) =>
                              setFormState((prev) => ({
                                ...prev,
                                jobPay: { ...prev.jobPay, [job]: e.target.value },
                              }))
                            }
                            placeholder="0.00"
                            className="flex-1 px-2 py-1.5 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary text-sm"
                          />
                          <span className="text-xs text-theme-muted">/hr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm text-theme-secondary">PIN (4 digits)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={formState.passcode}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      passcode: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  disabled={invitationMode}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
                />
                {invitationMode && (
                  <p className="text-xs text-theme-muted mt-2">
                    This employee already has an account. PIN cannot be set here.
                  </p>
                )}
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
                {submitting ? 'Saving...' : invitationMode ? 'Send Invitation' : 'Create User'}
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
        onSaved={handleProfileSaved}
        onError={setError}
        onAuthError={handleAuthExpired}
      />

      {invitationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setInvitationModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Employee already exists</h2>
            <p className="text-sm text-theme-tertiary">
              This email already has an account. An invitation has been sent to join this restaurant. Their existing PIN will be used.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInvitationModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

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
                  maxLength={4}
                  value={resetPasscode}
                  onChange={(e) => setResetPasscode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
                disabled={!/^\d{4}$/.test(resetPasscode) || resetPasscode === '0000' || resetPasscode !== resetConfirm || submitting}
                className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Updating...' : 'Update PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeDeleteModal} />
          <div className="relative w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">
              Delete {deleteTarget.fullName || deleteTarget.email}?
            </h2>
            <p className="text-sm text-theme-tertiary">This cannot be undone.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteSubmitting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-400 transition-colors disabled:opacity-50"
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast />
    </div>
  );
}
