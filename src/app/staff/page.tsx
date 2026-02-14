'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

type InvitationsResponse = {
  invites?: Array<Record<string, unknown>>;
};

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
  const [modalError, setModalError] = useState('');
  const [emailCheck, setEmailCheck] = useState({
    status: 'idle' as 'idle' | 'checking' | 'ready' | 'invalid' | 'error',
    existsInAuth: false,
    existsInOrg: false,
    hasPendingInvite: false,
    alreadyMember: false,
    hasMembershipInThisOrg: false,
    hasMembershipInOtherOrg: false,
  });
  
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

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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

  const loadUsers = useCallback(async () => {
    if (!activeRestaurantId) return null;
    setLoading(true);
    setError('');

    const { data, error: loadError } = (await supabase
      .from('users')
      .select('*')
      .eq('organization_id', activeRestaurantId)
      .order('email', { ascending: true })) as {
      data: Array<Record<string, unknown>> | null;
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
    const inviteResult = await apiFetch<InvitationsResponse>(
      `/api/admin/invitations?organization_id=${encodeURIComponent(activeRestaurantId)}`
    );
    if (!inviteResult.ok) {
      if (process.env.NODE_ENV !== 'production') {
         
        console.log('[invitations] status', inviteResult.status, 'error', inviteResult.error);
      }
      setInvites([]);
      setLoading(false);
      return { users: mapped, invites: [] };
    }
    const inviteRows = Array.isArray(inviteResult.data?.invites) ? inviteResult.data.invites : [];
    const mappedInvites = inviteRows.map((invite: Record<string, unknown>) => ({
      id: String(invite.id),
      email: String(invite.email ?? ''),
      role: String(invite.role ?? 'employee'),
      status: String(invite.status ?? 'pending'),
      createdAt: invite.created_at == null ? null : String(invite.created_at),
      expiresAt: invite.expires_at == null ? null : String(invite.expires_at),
      isInvite: true as const,
    }));
    setInvites(mappedInvites);
    setLoading(false);
    return { users: mapped, invites: mappedInvites };
  }, [activeRestaurantId]);

  useEffect(() => {
    if (activeRestaurantId && isInitialized && currentUser) {
      void loadUsers();
    }
  }, [activeRestaurantId, isInitialized, currentUser, loadUsers]);

  useEffect(() => {
    if (!modalOpen || !activeRestaurantId) return;
    const rawEmail = formState.email.trim().toLowerCase();
    if (!rawEmail) {
      setEmailCheck({
        status: 'idle',
        existsInAuth: false,
        existsInOrg: false,
        hasPendingInvite: false,
        alreadyMember: false,
        hasMembershipInThisOrg: false,
        hasMembershipInOtherOrg: false,
      });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      setEmailCheck({
        status: 'invalid',
        existsInAuth: false,
        existsInOrg: false,
        hasPendingInvite: false,
        alreadyMember: false,
        hasMembershipInThisOrg: false,
        hasMembershipInOtherOrg: false,
      });
      return;
    }

    let cancelled = false;
    setEmailCheck((prev) => ({
      ...prev,
      status: 'checking',
      existsInAuth: false,
      existsInOrg: false,
      hasPendingInvite: false,
      alreadyMember: false,
      hasMembershipInThisOrg: false,
      hasMembershipInOtherOrg: false,
    }));
    const handle = setTimeout(async () => {
      const result = await apiFetch(
        `/api/admin/check-email?organizationId=${encodeURIComponent(activeRestaurantId)}&email=${encodeURIComponent(
          rawEmail
        )}`,
        { method: 'GET', skipAuthDebug: true }
      );
      if (cancelled) return;
      if (!result.ok) {
        setEmailCheck({
          status: 'error',
          existsInAuth: false,
          existsInOrg: false,
          hasPendingInvite: false,
          alreadyMember: false,
          hasMembershipInThisOrg: false,
          hasMembershipInOtherOrg: false,
        });
        return;
      }
      const data = (result.data ?? {}) as Record<string, unknown>;
      const existsInAuth = Boolean(data.existsInAuth ?? data.authExists);
      const existsInOrg = Boolean(data.existsInOrg);
      const hasPendingInvite = Boolean(data.hasPendingInvite);
      const hasMembershipInThisOrg = Boolean(data.hasMembershipInThisOrg);
      const hasMembershipInOtherOrg = Boolean(data.hasMembershipInOtherOrg);
      const alreadyMember = Boolean(data.alreadyMember ?? hasMembershipInThisOrg);
      setEmailCheck({
        status: 'ready',
        existsInAuth,
        existsInOrg,
        hasPendingInvite,
        alreadyMember,
        hasMembershipInThisOrg,
        hasMembershipInOtherOrg,
      });
      if (existsInAuth) {
        setFormState((prev) => (prev.passcode ? { ...prev, passcode: '' } : prev));
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [formState.email, activeRestaurantId, modalOpen]);

  const openAddModal = () => {
    setFormState(EMPTY_FORM);
    setEmailCheck({
      status: 'idle',
      existsInAuth: false,
      existsInOrg: false,
      hasPendingInvite: false,
      alreadyMember: false,
      hasMembershipInThisOrg: false,
      hasMembershipInOtherOrg: false,
    });
    setModalError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormState(EMPTY_FORM);
    setEmailCheck({
      status: 'idle',
      existsInAuth: false,
      existsInOrg: false,
      hasPendingInvite: false,
      alreadyMember: false,
      hasMembershipInThisOrg: false,
      hasMembershipInOtherOrg: false,
    });
    setModalError('');
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
        nextJobPay[job] = '0.00';
      }
      return { ...prev, jobs: nextJobs, jobPay: nextJobPay };
    });
  };

  const handleSave = async () => {
    if (!activeRestaurantId) return;
    setError('');
    setModalError('');
    setSuccessMessage('');
    setAuthBanner(null);
    const missingFields: string[] = [];
    if (!formState.fullName.trim()) missingFields.push('Full name');
    if (!formState.email.trim()) missingFields.push('Email');
    if (!formState.employeeNumber.trim()) missingFields.push('Employee number');
    const requiresPin = !emailCheck.existsInAuth;
    if (requiresPin && !formState.passcode.trim()) missingFields.push('PIN');
    if (missingFields.length > 0) {
      setModalError(`Missing required fields: ${missingFields.join(', ')}.`);
      return;
    }

    if (emailCheck.status === 'checking') {
      setModalError('Checking email. Please wait a moment.');
      return;
    }
    if (emailCheck.status === 'invalid') {
      setModalError('Please enter a valid email address.');
      return;
    }

    if (emailCheck.existsInOrg) {
      setModalError('Email is already used by another employee in this restaurant.');
      return;
    }
    if (emailCheck.alreadyMember) {
      setModalError('User already belongs to this restaurant.');
      return;
    }

    if (requiresPin && !/^\d{6}$/.test(formState.passcode)) {
      setModalError('PIN must be exactly 6 digits.');
      return;
    }

    if (!/^\d{4}$/.test(formState.employeeNumber.trim())) {
      setModalError('Employee number must be 4 digits.');
      return;
    }
    if (formState.employeeNumber.trim() === '0000') {
      setModalError('Employee number 0000 is not allowed.');
      return;
    }

    if (!accountTypeOptions.includes(formState.accountType)) {
      setModalError('Invalid account type selection.');
      return;
    }

    if (['EMPLOYEE', 'MANAGER'].includes(formState.accountType) && formState.jobs.length === 0) {
      setModalError('Managers and employees must have at least one job.');
      return;
    }

    const jobPayPayload: Record<string, number> = {};
    for (const job of formState.jobs) {
      const rawValue = formState.jobPay[job];
      if (rawValue === undefined || rawValue === '') continue;
      const parsed = parseFloat(rawValue);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setModalError(`Invalid hourly pay for ${job}.`);
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
      const pinToSend = requiresPin ? formState.passcode : '';
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
          ...(pinToSend ? { pinCode: pinToSend } : {}),
          hourlyPay: avgHourlyPay,
          jobPay: jobPayPayload,
        },
      });

      const responseData = result.data;
      const responseObject =
        responseData && typeof responseData === 'object'
          ? (responseData as Record<string, unknown>)
          : null;
      const action =
        typeof responseObject?.action === 'string' ? String(responseObject.action) : '';
      const created =
        action === 'CREATED'
        || action === 'ADDED_EXISTING_AUTH'
        || Boolean(responseObject?.created);
      const invited =
        action === 'INVITED'
        || Boolean(responseObject?.invited);
      const alreadyMember =
        action === 'ALREADY_MEMBER'
        || Boolean(
          (responseObject as Record<string, unknown> | null)?.already_member
          ?? (responseObject as Record<string, unknown> | null)?.alreadyMember
        );
      const alreadySent = Boolean(responseObject?.alreadySent);
      const isSuccess = created || alreadyMember || invited;

      if (!result.ok || !isSuccess) {
        if (process.env.NODE_ENV !== 'production') {
           
          console.log('[create-user] status', result.status, 'error', result.error, 'data', result.data);
        }
        if (result.status === 409 && result.code === 'EMPLOYEE_ID_TAKEN') {
          setModalError('Employee ID already exists. Please choose a different one.');
          setSubmitting(false);
          return;
        }
        if (result.status === 409 && result.code === 'EMAIL_TAKEN_ORG') {
          setModalError('Email is already used by another employee in this restaurant.');
          setSubmitting(false);
          return;
        }
        if (result.status === 409 && result.code === 'EMAIL_TAKEN_AUTH') {
          setModalError('Email is already used by another account.');
          setSubmitting(false);
          return;
        }
        if (result.status === 409 && result.code === 'INVITE_ALREADY_SENT') {
          setModalError('Invite already sent for this email.');
          setSubmitting(false);
          return;
        }
        if (result.status === 409 && result.code === 'ALREADY_MEMBER') {
          setModalError('User already belongs to this restaurant.');
          setSubmitting(false);
          return;
        }
        if (result.status === 422 && result.code === 'INVALID_UUID') {
          setModalError(result.error || 'Invalid organization id.');
          setSubmitting(false);
          return;
        }
        const errorFromJson =
          responseObject && typeof responseObject.error === 'string' ? responseObject.error : '';
        const errorObject =
          responseObject && typeof responseObject.error === 'object' && responseObject.error
            ? responseObject.error as Record<string, unknown>
            : null;
        const rawText = (result.rawText ?? '').trim();
        const details = errorObject?.details ? ` ${String(errorObject.details)}` : '';
        const hint = errorObject?.hint ? ` ${String(errorObject.hint)}` : '';
        const baseMessage =
          errorFromJson
          || (errorObject?.message ? `${String(errorObject.message)}${details}${hint}` : '')
          || rawText
          || (typeof result.error === 'string' ? result.error : '')
          || 'Unexpected response from server.';
        const trimmed = baseMessage.length > 300 ? `${baseMessage.slice(0, 300)}...` : baseMessage;
        const prefix = result.ok ? 'Unexpected response from server' : 'Request failed';
        const message = `${prefix} (status ${result.status}). ${trimmed}`;

        if (result.status === 401) {
          handleAuthExpired(message);
          setModalError(message);
        } else {
          setModalError(message);
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
        const msg = action === 'ADDED_EXISTING_AUTH' ? 'Employee added.' : 'Employee created.';
        setSuccessMessage(msg);
        closeModal();
      } else if (invited) {
        setSuccessMessage(alreadySent ? 'Invite already sent.' : 'Invite sent.');
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
    if (!user?.id || !isUuid(user.id)) {
      setError('Unable to delete: missing or invalid user id.');
      return;
    }
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

    const normalizedPin = resetPasscode.replace(/\D/g, '').slice(0, 6);
    const normalizedConfirm = resetConfirm.replace(/\D/g, '').slice(0, 6);

    if (normalizedPin !== resetPasscode) {
      setResetPasscode(normalizedPin);
    }
    if (normalizedConfirm !== resetConfirm) {
      setResetConfirm(normalizedConfirm);
    }

    if (!/^\d{6}$/.test(normalizedPin)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }

    if (normalizedPin === '000000') {
      setError('PIN cannot be 000000.');
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
         
        console.debug('[reset-pin] pin', normalizedPin, normalizedPin.length, 'confirm', normalizedConfirm, normalizedConfirm.length);
      }
      const payload = {
        userId: resetTarget.id,
        organizationId: activeRestaurantId,
        pinCode: normalizedPin,
      };
      if (process.env.NODE_ENV !== 'production') {
         
        console.debug('[reset-pin]', {
          userId: resetTarget.id,
          email: resetTarget.email,
          pinLen: normalizedPin.length,
        });
         
        console.debug('[reset-pin] payload', payload);
      }
      const result = await apiFetch('/api/admin/set-passcode', {
        method: 'POST',
        json: payload,
      });

      if (!result.ok) {
        if (process.env.NODE_ENV !== 'production') {
           
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
    const staffEmails = new Set(
      users
        .map((user) => String(user.email ?? '').trim().toLowerCase())
        .filter((email) => email.length > 0)
    );
    const filteredInvites = invites.filter((invite) => {
      const email = String(invite.email ?? '').trim().toLowerCase();
      return !staffEmails.has(email);
    });
    const combined: StaffRow[] = [...users, ...filteredInvites];
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

  const authExists = emailCheck.existsInAuth;
  const inviteOnly = authExists && emailCheck.hasMembershipInOtherOrg;
  const addDirect = authExists && !emailCheck.hasMembershipInOtherOrg;

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
            {modalError && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400 whitespace-pre-wrap">{modalError}</p>
              </div>
            )}
            <div className="space-y-3 overflow-y-auto pr-1 mt-4 flex-1">
              <div>
                <label className="text-sm text-theme-secondary">Full name</label>
                <input
                  type="text"
                  value={formState.fullName}
                  onChange={(e) => {
                    if (modalError) setModalError('');
                    setFormState((prev) => ({ ...prev, fullName: e.target.value }));
                  }}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                />
              </div>
              <div>
                <label className="text-sm text-theme-secondary">Email</label>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(e) => {
                    if (modalError) setModalError('');
                    setFormState((prev) => ({ ...prev, email: e.target.value }));
                  }}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
                />
                {emailCheck.status === 'checking' && (
                  <p className="text-xs text-theme-muted mt-1">Checking email...</p>
                )}
                {emailCheck.status === 'invalid' && (
                  <p className="text-xs text-red-400 mt-1">Enter a valid email.</p>
                )}
                {emailCheck.existsInOrg && (
                  <p className="text-xs text-red-400 mt-1">
                    Email already used in this restaurant.
                  </p>
                )}
                {emailCheck.hasPendingInvite && (
                  <p className="text-xs text-amber-400 mt-1">
                    Invite already sent for this email.
                  </p>
                )}
                {emailCheck.alreadyMember && (
                  <p className="text-xs text-amber-400 mt-1">
                    User already belongs to this restaurant.
                  </p>
                )}
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
                  onChange={(e) => {
                    if (modalError) setModalError('');
                    setFormState((prev) => ({ ...prev, phone: e.target.value }));
                  }}
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
                <label className="text-sm text-theme-secondary">PIN (6 digits)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={formState.passcode}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      passcode: e.target.value.replace(/\D/g, '').slice(0, 6),
                    }))
                  }
                  disabled={authExists}
                  className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
                />
                {inviteOnly && (
                  <p className="text-xs text-theme-muted mt-1">
                    This employee already has an account in another restaurant. An invitation will be sent.
                  </p>
                )}
                {addDirect && (
                  <p className="text-xs text-theme-muted mt-1">
                    This employee already has an account. They will be added directly. PIN cannot be set here.
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
                {submitting ? 'Saving...' : 'Create User'}
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
                  onChange={(e) => setResetPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                  onChange={(e) => setResetConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                disabled={!/^\d{6}$/.test(resetPasscode) || resetPasscode === '000000' || resetPasscode !== resetConfirm || submitting}
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
