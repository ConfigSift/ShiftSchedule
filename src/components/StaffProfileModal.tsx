'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { JOB_OPTIONS } from '../types';
import { normalizeJobs } from '../utils/jobs';
import { getUserRole } from '../utils/role';
import { apiFetch } from '../lib/apiClient';
import { supabase } from '../lib/supabase/client';

type StaffProfileUser = {
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

type StaffProfileModalProps = {
  isOpen: boolean;
  mode: 'view' | 'edit';
  user: StaffProfileUser | null;
  isAdmin: boolean;
  isManager: boolean;
  organizationId: string;
  currentAuthUserId?: string | null;
  onClose: () => void;
  onSaved: (updatedUser?: StaffProfileUser) => Promise<void>;
  onError: (message: string) => void;
  onAuthError?: (message: string) => void;
};

type UpdateUserApiResponse = {
  user?: {
    id: string;
    authUserId?: string | null;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    employeeNumber?: number | null;
    role?: string | null;
    jobs?: string[] | null;
    jobPay?: Record<string, number> | null;
  };
  count?: number;
  earliestDate?: string;
  exampleDates?: string[];
  removedJobs?: string[];
};

type SetPasscodeApiResponse = {
  authPasswordUpdated?: boolean;
};

export function StaffProfileModal({
  isOpen,
  mode,
  user,
  isAdmin,
  isManager,
  organizationId,
  currentAuthUserId,
  onClose,
  onSaved,
  onError,
  onAuthError,
}: StaffProfileModalProps) {
  const allowAdminCreation = process.env.NEXT_PUBLIC_ENABLE_ADMIN_CREATION === 'true';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [employeeNumberError, setEmployeeNumberError] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('EMPLOYEE');
  const [jobs, setJobs] = useState<string[]>([]);
  const [jobPay, setJobPay] = useState<Record<string, string>>({});
  const [jobPayErrors, setJobPayErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [blockedJobs, setBlockedJobs] = useState<string[]>([]);
  const [initializedKey, setInitializedKey] = useState<string | null>(null);
  const [workedRoles, setWorkedRoles] = useState<Array<{ job: string; lastDate: string }>>([]);
  const [workedRolesLoading, setWorkedRolesLoading] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const employeeNumberRef = useRef<HTMLInputElement | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  // Create a stable key that changes when user ID or jobPay data changes
  // This ensures re-initialization when saved data differs from local state
  const userDataKey = user
    ? `${user.id}:${JSON.stringify(user.jobPay ?? {})}:${(user.jobs ?? []).join(',')}:${user.employeeNumber ?? ''}`
    : null;

  // Initialize state only when modal opens OR user data changes
  useEffect(() => {
    if (!isOpen || !user) return;
    // Skip if already initialized for this exact user data
    if (initializedKey === userDataKey) return;

    setFullName(user.fullName);
    setEmail(user.email || '');
    setEmailError('');
    setPhone(user.phone || '');
    setEmployeeNumber(
      user.employeeNumber ? String(user.employeeNumber).padStart(4, '0') : ''
    );
    setEmployeeNumberError('');
    setAccountType(getUserRole(user.accountType));
    const normalizedJobs = normalizeJobs(user.jobs);
    setJobs(normalizedJobs);

    // Initialize per-job pay with 2 decimal formatting.
    // Default missing values to 0.00 for assigned jobs.
    const existingJobPay = user.jobPay ?? {};
    const initialJobPay: Record<string, string> = {};
    normalizedJobs.forEach((job) => {
      const payValue = existingJobPay[job];
      initialJobPay[job] = payValue !== undefined ? payValue.toFixed(2) : '0.00';
    });
    setJobPay(initialJobPay);
    setJobPayErrors({});
    setModalError('');
    setBlockedJobs([]);
    setPinCode('');
    setPinError('');
    setPinSuccess('');
    setInitializedKey(userDataKey);
    if (process.env.NODE_ENV !== 'production') {
       
      console.log('[StaffProfileModal] init user.jobPay', user.jobPay);
       
      console.log('[StaffProfileModal] init localJobPay', initialJobPay);
    }
  }, [isOpen, user, initializedKey, userDataKey]);

  // Reset initializedKey when modal closes so next open re-initializes
  useEffect(() => {
    if (!isOpen) {
      setInitializedKey(null);
      setModalError('');
      setEmployeeNumberError('');
      setPinCode('');
      setPinError('');
      setPinSuccess('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !user) return;
    let isActive = true;
    const fetchWorkedRoles = async () => {
      setWorkedRolesLoading(true);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const cutoffDate = cutoff.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('shifts')
        .select('job, shift_date')
        .eq('user_id', user.id)
        .not('job', 'is', null)
        .gte('shift_date', cutoffDate)
        .order('shift_date', { ascending: false })
        .limit(500);
      if (!isActive) return;
      if (error || !data) {
        setWorkedRoles([]);
        setWorkedRolesLoading(false);
        return;
      }
      const lastByJob = new Map<string, string>();
      (data as Array<{ job: string | null; shift_date: string }>).forEach((row) => {
        if (!row.job) return;
        const current = lastByJob.get(row.job);
        if (!current || row.shift_date > current) {
          lastByJob.set(row.job, row.shift_date);
        }
      });
      const roles = Array.from(lastByJob.entries())
        .map(([job, lastDate]) => ({ job, lastDate }))
        .sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
      setWorkedRoles(roles);
      setWorkedRolesLoading(false);
    };
    fetchWorkedRoles();
    return () => {
      isActive = false;
    };
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const isSelf = Boolean(user?.authUserId && currentAuthUserId && user.authUserId === currentAuthUserId);
  const targetIsAdmin = getUserRole(user.accountType) === 'ADMIN';
  const showAdminFields = isManager || isAdmin;
  // Manager/Admin can edit others; employees can only edit their own profile
  const canEdit = mode === 'edit' && (isManager || isSelf) && !(targetIsAdmin && !isAdmin);
  // Email can be edited by admins for anyone, or by the user themselves
  const canEditEmail = mode === 'edit' && isAdmin && !(targetIsAdmin && !isAdmin);
  const canEditAccountType =
    canEdit && (isAdmin || isManager) && !isSelf && !(targetIsAdmin && !isAdmin);
  const requiresJobs = accountType === 'EMPLOYEE' || accountType === 'MANAGER';

  // Email validation helper
  const validateEmail = (emailValue: string): boolean => {
    const trimmed = emailValue.trim();
    if (!trimmed) {
      setEmailError('Email is required.');
      return false;
    }
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return false;
    }
    setEmailError('');
    return true;
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    // Clear error when user types
    if (emailError) {
      setEmailError('');
    }
    if (modalError) {
      setModalError('');
    }
  };

  const toggleJob = (job: string) => {
    setModalError(''); // Clear error on job change
    setBlockedJobs([]); // Clear blocked jobs indicator
    setJobs((prev) => {
      if (prev.includes(job)) {
        // Remove job and drop its local pay entry
        setJobPay((payPrev) => {
          const updated = { ...payPrev };
          delete updated[job];
          return updated;
        });
        setJobPayErrors((errPrev) => {
          const updated = { ...errPrev };
          delete updated[job];
          return updated;
        });
        return prev.filter((j) => j !== job);
      } else {
        // Add job - default to 0.00
        setJobPay((payPrev) => ({
          ...payPrev,
          ...(payPrev[job] === undefined ? { [job]: '0.00' } : {}),
        }));
        return [...prev, job];
      }
    });
  };

  const updateJobPay = (job: string, value: string) => {
    setJobPay((prev) => ({ ...prev, [job]: value }));
    setModalError(''); // Clear modal error on edit
    // Clear field error when user types
    if (jobPayErrors[job]) {
      setJobPayErrors((prev) => {
        const updated = { ...prev };
        delete updated[job];
        return updated;
      });
    }
  };

  // Normalize pay to 2 decimals on blur
  const handleJobPayBlur = (job: string) => {
    const value = jobPay[job];
    if (value === undefined || value === '') return;
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setJobPay((prev) => ({ ...prev, [job]: num.toFixed(2) }));
    }
  };

  const validateJobPay = (): boolean => {
    const errors: Record<string, string> = {};
    let isValid = true;
    jobs.forEach((job) => {
      const value = jobPay[job];
      // Blank is allowed (omitted on save); only validate if user entered something
      if (value !== undefined && value !== '') {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) {
          errors[job] = 'Invalid';
          isValid = false;
        }
      }
    });
    setJobPayErrors(errors);
    return isValid;
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (!fullName.trim()) {
      onError('Full name is required.');
      return;
    }
    if (employeeNumber.trim() && !/^\d{4}$/.test(employeeNumber.trim())) {
      onError('Employee number must be 4 digits.');
      return;
    }
    if (employeeNumber.trim() === '0000') {
      onError('Employee number 0000 is not allowed.');
      return;
    }
    // Validate email if it can be edited
    if (canEditEmail && !validateEmail(email)) {
      return;
    }
    const normalizedEmail = email.trim();
    const previousEmail = String(user?.email ?? '').trim().toLowerCase();
    const emailChanged =
      normalizedEmail !== '' && normalizedEmail.toLowerCase() !== previousEmail;
    const shouldSendEmailToServer = canEditEmail && emailChanged;
    if (requiresJobs && jobs.length === 0) {
      onError('At least one job is required for employees.');
      return;
    }
    // Validate per-job pay
    if (jobs.length > 0 && !validateJobPay()) {
      onError('Please enter valid hourly pay for all selected jobs.');
      return;
    }
    setSubmitting(true);

    // Convert jobPay strings to numbers, rounded to 2 decimals (omit blanks)
    const jobPayNumeric: Record<string, number> = {};
    jobs.forEach((job) => {
      const rawValue = jobPay[job];
      if (rawValue === undefined) return;
      const trimmed = rawValue.trim();
      if (trimmed === '') return;
      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      const value = Math.round(parsed * 100) / 100;
      jobPayNumeric[job] = value;
    });

    // Calculate average for legacy hourlyPay field (backwards compatibility), rounded to 2 decimals
    const payValues = Object.values(jobPayNumeric);
    const avgHourlyPay = payValues.length > 0
      ? Math.round((payValues.reduce((sum, v) => sum + v, 0) / payValues.length) * 100) / 100
      : 0;

    try {
      if (process.env.NODE_ENV !== 'production') {
         
        console.log('[StaffProfileModal] save payload jobPay', jobPayNumeric);
      }
      const result = await apiFetch<UpdateUserApiResponse>('/api/admin/update-user', {
        method: 'POST',
        json: {
          userId: user.id,
          organizationId,
          fullName: fullName.trim(),
          email: shouldSendEmailToServer ? normalizedEmail : undefined,
          phone: phone.trim() || '',
          employeeNumber: employeeNumber.trim() ? Number(employeeNumber) : undefined,
          accountType: canEditAccountType ? accountType : undefined,
          jobs,
          hourlyPay: avgHourlyPay,
          jobPay: jobPayNumeric,
        },
      });
      if (!result.ok) {
        if (result.status === 401) {
          const message = 'Session expired. Please sign out and sign in again.';
          onAuthError?.(message);
          onError(message);
        } else if (result.status === 403) {
          const message = 'You dont have permission for that action.';
          onError(message);
        } else if (result.status === 409 && result.code === 'EMPLOYEE_ID_TAKEN') {
          const message = 'Employee ID already exists. Please choose a different one.';
          setModalError(message);
          setEmployeeNumberError(message);
          employeeNumberRef.current?.focus();
        } else if (
          result.status === 409 &&
          (result.code === 'EMAIL_TAKEN_ORG' || result.code === 'EMAIL_TAKEN_AUTH')
        ) {
          const message = result.error || 'Email is already used by another account.';
          setModalError(message);
          setEmailError(message);
        } else if (result.status === 409 && result.code === 'MISSING_AUTH_ID') {
          const message =
            result.error || 'User has no auth identity. Ask an admin to re-link this user.';
          setModalError(message);
        } else if (result.status === 404 && result.code === 'TARGET_NOT_FOUND') {
          const message = result.error || 'Target user not found.';
          setModalError(message);
        } else if (result.status === 422 && result.code === 'INVALID_UUID') {
          const message = result.error || 'Invalid identifier for this user.';
          setModalError(message);
        } else if (result.code === 'JOB_IN_USE' || result.code === 'JOB_REMOVAL_BLOCKED') {
          // Show job removal error inside modal and highlight blocked jobs
          const payload = result.data ?? {};
          const details: string[] = [];
          if (payload.count) details.push(`${payload.count} future shift(s)`);
          if (payload.earliestDate) details.push(`earliest ${payload.earliestDate}`);
          if (Array.isArray(payload.exampleDates) && payload.exampleDates.length > 0) {
            details.push(`e.g. ${payload.exampleDates.join(', ')}`);
          }
          const detailText = details.length > 0 ? ` (${details.join(' - ')})` : '';
          setModalError((result.error || 'Cannot remove job with future shifts.') + detailText);
          const blocked = payload.removedJobs ?? [];
          setBlockedJobs(Array.isArray(blocked) ? blocked : []);
        } else if (result.code === 'EMAIL_TAKEN') {
          // Show email error inside modal
          const message = result.error || 'This email is already in use.';
          setModalError(message);
          setEmailError(message);
        } else {
          onError(result.error || 'Unable to update profile.');
        }
        setSubmitting(false);
        return;
      }
      // Extract updated user from API response if available
      const returnedUser = result.data?.user;
      const updatedUser: StaffProfileUser | undefined = returnedUser
        ? {
            id: returnedUser.id,
            authUserId: returnedUser.authUserId ?? null,
            fullName: returnedUser.fullName || '',
            email: returnedUser.email || '',
            phone: returnedUser.phone || '',
            employeeNumber: returnedUser.employeeNumber ?? null,
            accountType: String(returnedUser.role ?? user.accountType ?? 'EMPLOYEE'),
            jobs: returnedUser.jobs || [],
            jobPay: returnedUser.jobPay ?? undefined,
          }
        : undefined;
      if (process.env.NODE_ENV !== 'production') {
         
        console.log('[StaffProfileModal] response user.jobPay', returnedUser?.jobPay);
      }
      await onSaved(updatedUser);
      onClose();
    } catch {
      onError('Request failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinUpdate = async () => {
    if (!showAdminFields || !user) return;
    const trimmed = pinCode.trim();
    setPinError('');
    setPinSuccess('');
    if (!/^\d{6}$/.test(trimmed) || trimmed === '000000') {
      setPinError('PIN must be 6 digits.');
      pinInputRef.current?.focus();
      return;
    }
    setPinSubmitting(true);
    const pinUrl = '/api/admin/set-passcode';
    try {
      if (process.env.NODE_ENV !== 'production') {
         
        console.log('[StaffProfileModal] Update PIN ->', pinUrl);
         
        console.log('[reset-pin] payload', { userId: user.id, organizationId });
      }
      const result = await apiFetch<SetPasscodeApiResponse>(pinUrl, {
        method: 'POST',
        json: {
          userId: user.id,
          organizationId,
          pinCode: trimmed,
        },
      });
      if (!result.ok) {
        if (result.status === 401) {
          setPinError('Not logged in / session missing.');
        } else if (result.status === 404) {
          setPinError(`Endpoint not found (client routing bug): ${pinUrl}`);
        } else {
          setPinError(result.error || 'Unable to update PIN.');
        }
        return;
      }
      const updatedFlag = result.data?.authPasswordUpdated;
      if (process.env.NODE_ENV !== 'production' && typeof updatedFlag === 'boolean') {
        setPinSuccess(`PIN updated (auth password ${updatedFlag ? 'updated' : 'skipped'})`);
      } else {
        setPinSuccess('PIN updated');
      }
      setPinCode('');
    } catch {
      setPinError('Unable to update PIN.');
    } finally {
      setPinSubmitting(false);
    }
  };

  // Compute average hourly pay from jobPay state (ignores blank/undefined values)
  const computedAvgPay = (() => {
    const values = Object.values(jobPay)
      .map((v) => parseFloat(v))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (values.length === 0) return null;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.round(avg * 100) / 100;
  })();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Staff Profile" size="lg">
      <div className="space-y-4">
        {/* Average pay summary (read-only) */}
        {showAdminFields && computedAvgPay !== null && (
          <div className="flex items-center justify-between p-3 bg-theme-tertiary rounded-lg">
            <span className="text-sm text-theme-secondary">Avg hourly pay</span>
            <span className="text-sm font-semibold text-theme-primary">${computedAvgPay.toFixed(2)}/hr</span>
          </div>
        )}

        {/* Modal-local error banner */}
        {modalError && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{modalError}</p>
          </div>
        )}

        <div>
          <label className="text-sm text-theme-secondary">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={!canEdit}
            className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-sm text-theme-secondary">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            disabled={!canEditEmail}
            className={`w-full mt-1 px-3 py-2 bg-theme-tertiary border rounded-lg text-theme-primary disabled:opacity-60 ${
              emailError ? 'border-red-500' : 'border-theme-primary'
            }`}
          />
          {emailError && (
            <p className="text-xs text-red-400 mt-1">{emailError}</p>
          )}
        </div>

        <div>
          <label className="text-sm text-theme-secondary">Employee # (4 digits)</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={employeeNumber}
            ref={employeeNumberRef}
            onChange={(e) => {
              setEmployeeNumber(e.target.value.replace(/\D/g, ''));
              if (employeeNumberError) setEmployeeNumberError('');
              if (modalError) setModalError('');
            }}
            onBlur={() => {
              if (employeeNumber.trim() && /^\d{1,4}$/.test(employeeNumber.trim())) {
                const padded = employeeNumber.trim().padStart(4, '0');
                setEmployeeNumber(padded);
              }
            }}
            disabled={!canEdit}
            className={`w-full mt-1 px-3 py-2 bg-theme-tertiary border rounded-lg text-theme-primary disabled:opacity-60 ${
              employeeNumberError ? 'border-red-500' : 'border-theme-primary'
            }`}
          />
          {employeeNumberError && (
            <p className="text-xs text-red-400 mt-1">{employeeNumberError}</p>
          )}
        </div>

        <div>
          <label className="text-sm text-theme-secondary">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!canEdit}
            className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
          />
        </div>

        {showAdminFields && (
          <div>
            <label className="text-sm text-theme-secondary">Set new PIN (6 digits)</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinCode}
                onChange={(e) => {
                  setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (pinError) setPinError('');
                  if (pinSuccess) setPinSuccess('');
                }}
                disabled={!canEdit}
                className={`flex-1 px-3 py-2 bg-theme-tertiary border rounded-lg text-theme-primary disabled:opacity-60 ${
                  pinError ? 'border-red-500' : 'border-theme-primary'
                }`}
              />
              <button
                type="button"
                onClick={handlePinUpdate}
                disabled={!canEdit || pinSubmitting}
                className="px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors disabled:opacity-50"
              >
                {pinSubmitting ? 'Saving...' : 'Update PIN'}
              </button>
            </div>
            {pinError && <p className="text-xs text-red-400 mt-1">{pinError}</p>}
            {pinSuccess && <p className="text-xs text-emerald-400 mt-1">{pinSuccess}</p>}
          </div>
        )}

        {showAdminFields && (
          <div>
            <label className="text-sm text-theme-secondary">Account type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              disabled={!canEditAccountType || isSelf}
              className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
            >
              {isAdmin && allowAdminCreation && <option value="ADMIN">ADMIN</option>}
              <option value="MANAGER">MANAGER</option>
              <option value="EMPLOYEE">EMPLOYEE</option>
            </select>
            {!canEditAccountType && (
              <p className="text-xs text-theme-muted mt-1">Account type changes are restricted.</p>
            )}
          </div>
        )}

        {showAdminFields && (
          <div>
            <label className="text-sm text-theme-secondary">Jobs</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {JOB_OPTIONS.map((job) => {
                const isBlocked = blockedJobs.includes(job);
                const isSelected = jobs.includes(job);
                return (
                  <div
                    key={job}
                    className={`flex items-center gap-2 text-xs ${isBlocked ? 'text-red-400' : 'text-theme-secondary'}`}
                  >
                    <label className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleJob(job)}
                        disabled={!canEdit}
                        className="accent-amber-500"
                      />
                      <span className="truncate">{job}</span>
                      {isBlocked && <span className="text-[10px] text-red-400">(in use)</span>}
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-theme-muted">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={isSelected ? (jobPay[job] ?? '') : ''}
                        onChange={(e) => updateJobPay(job, e.target.value)}
                        onBlur={() => handleJobPayBlur(job)}
                        disabled={!canEdit || !isSelected}
                        placeholder="0.00"
                        className={`w-20 px-2 py-1 bg-theme-tertiary border rounded-md text-theme-primary text-[11px] disabled:opacity-50 disabled:cursor-not-allowed ${
                          jobPayErrors[job] ? 'border-red-500' : 'border-theme-primary'
                        }`}
                      />
                      <span className="text-[10px] text-theme-muted">/hr</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {requiresJobs && jobs.length === 0 && (
              <p className="text-xs text-red-400 mt-1">Assign at least one job.</p>
            )}
          </div>
        )}

        {showAdminFields && (
          <div>
            <label className="text-sm text-theme-secondary">Previously worked roles (last 12 months)</label>
            <div className="mt-2 rounded-lg border border-theme-primary bg-theme-tertiary/40 px-3 py-2">
              {workedRolesLoading ? (
                <p className="text-xs text-theme-muted">Loading roles...</p>
              ) : workedRoles.length === 0 ? (
                <p className="text-xs text-theme-muted">No historical roles found.</p>
              ) : (
                <ul className="space-y-1">
                  {workedRoles.map((role) => (
                    <li key={role.job} className="flex items-center justify-between text-xs text-theme-secondary">
                      <span className="truncate">{role.job}</span>
                      <span className="text-theme-muted">{role.lastDate}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
          >
            Close
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
