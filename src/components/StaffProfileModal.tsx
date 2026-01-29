'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { JOB_OPTIONS } from '../types';
import { normalizeJobs } from '../utils/jobs';
import { getUserRole } from '../utils/role';
import { apiFetch } from '../lib/apiClient';

type StaffProfileUser = {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  phone: string;
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
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
  onAuthError?: (message: string) => void;
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
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('EMPLOYEE');
  const [jobs, setJobs] = useState<string[]>([]);
  const [hourlyPay, setHourlyPay] = useState('0');
  const [jobPay, setJobPay] = useState<Record<string, string>>({});
  const [jobPayErrors, setJobPayErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.fullName);
      setEmail(user.email || '');
      setEmailError('');
      setPhone(user.phone || '');
      setAccountType(getUserRole(user.accountType));
      const normalizedJobs = normalizeJobs(user.jobs);
      setJobs(normalizedJobs);
      setHourlyPay(String(user.hourlyPay ?? 0));

      // Initialize per-job pay: use existing jobPay if available, otherwise use legacy hourlyPay as default
      const defaultPay = String(user.hourlyPay ?? 0);
      const existingJobPay = user.jobPay ?? {};
      const initialJobPay: Record<string, string> = {};
      normalizedJobs.forEach((job) => {
        initialJobPay[job] = existingJobPay[job] !== undefined
          ? String(existingJobPay[job])
          : defaultPay;
      });
      setJobPay(initialJobPay);
      setJobPayErrors({});
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const isSelf = Boolean(user?.authUserId && currentAuthUserId && user.authUserId === currentAuthUserId);
  const targetIsAdmin = getUserRole(user.accountType) === 'ADMIN';
  const showAdminFields = isManager || isAdmin;
  // Manager/Admin can edit others; employees can only edit their own profile
  const canEdit = mode === 'edit' && (isManager || isSelf) && !(targetIsAdmin && !isAdmin);
  // Email can be edited by managers/admins for anyone, or by the user themselves
  const canEditEmail = mode === 'edit' && (isManager || isSelf) && !(targetIsAdmin && !isAdmin);
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
  };

  const toggleJob = (job: string) => {
    setJobs((prev) => {
      if (prev.includes(job)) {
        // Remove job
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
        // Add job - use legacy hourlyPay as default or 0
        setJobPay((payPrev) => ({
          ...payPrev,
          [job]: hourlyPay || '0',
        }));
        return [...prev, job];
      }
    });
  };

  const updateJobPay = (job: string, value: string) => {
    setJobPay((prev) => ({ ...prev, [job]: value }));
    // Clear error when user types
    if (jobPayErrors[job]) {
      setJobPayErrors((prev) => {
        const updated = { ...prev };
        delete updated[job];
        return updated;
      });
    }
  };

  const validateJobPay = (): boolean => {
    const errors: Record<string, string> = {};
    let isValid = true;
    jobs.forEach((job) => {
      const value = jobPay[job];
      if (value === undefined || value === '') {
        errors[job] = 'Required';
        isValid = false;
      } else {
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
    // Validate email if it can be edited
    if (canEditEmail && !validateEmail(email)) {
      return;
    }
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

    // Convert jobPay strings to numbers
    const jobPayNumeric: Record<string, number> = {};
    jobs.forEach((job) => {
      jobPayNumeric[job] = parseFloat(jobPay[job] || '0') || 0;
    });

    // Calculate average for legacy hourlyPay field (backwards compatibility)
    const avgHourlyPay = jobs.length > 0
      ? Object.values(jobPayNumeric).reduce((sum, v) => sum + v, 0) / jobs.length
      : Number(hourlyPay || 0);

    try {
      const result = await apiFetch('/api/admin/update-user', {
        method: 'POST',
        json: {
          userId: user.id,
          organizationId,
          fullName: fullName.trim(),
          email: canEditEmail ? email.trim() : undefined,
          phone: phone.trim() || '',
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
        } else {
          onError(result.error || 'Unable to update profile.');
        }
        setSubmitting(false);
        return;
      }
      await onSaved();
      onClose();
    } catch {
      onError('Request failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Staff Profile" size="lg">
      <div className="space-y-4">
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
              {JOB_OPTIONS.map((job) => (
                <label key={job} className="flex items-center gap-2 text-xs text-theme-secondary">
                  <input
                    type="checkbox"
                    checked={jobs.includes(job)}
                    onChange={() => toggleJob(job)}
                    disabled={!canEdit}
                    className="accent-amber-500"
                  />
                  {job}
                </label>
              ))}
            </div>
            {requiresJobs && jobs.length === 0 && (
              <p className="text-xs text-red-400 mt-1">Assign at least one job.</p>
            )}
          </div>
        )}

        {/* Per-Job Hourly Pay */}
        {showAdminFields && jobs.length > 0 && (
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
                      onChange={(e) => updateJobPay(job, e.target.value)}
                      disabled={!canEdit}
                      placeholder="0.00"
                      className={`flex-1 px-2 py-1.5 bg-theme-tertiary border rounded-lg text-theme-primary text-sm disabled:opacity-60 ${
                        jobPayErrors[job] ? 'border-red-500' : 'border-theme-primary'
                      }`}
                    />
                    <span className="text-xs text-theme-muted">/hr</span>
                  </div>
                  {jobPayErrors[job] && (
                    <span className="text-xs text-red-400">{jobPayErrors[job]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legacy Hourly Pay field - shown only when no jobs selected */}
        {showAdminFields && jobs.length === 0 && (
          <div>
            <label className="text-sm text-theme-secondary">Default Hourly Pay</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={hourlyPay}
              onChange={(e) => setHourlyPay(e.target.value)}
              disabled={!canEdit}
              className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary disabled:opacity-60"
            />
            <p className="text-xs text-theme-muted mt-1">This will be used as the default when jobs are selected.</p>
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
