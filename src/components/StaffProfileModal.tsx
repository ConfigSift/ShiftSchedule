'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { JOB_OPTIONS } from '../types';
import { normalizeJobs } from '../utils/jobs';
import { getUserRole } from '../utils/role';

type StaffProfileUser = {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  phone: string;
  accountType: string;
  jobs: string[];
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
}: StaffProfileModalProps) {
  const allowAdminCreation = process.env.NEXT_PUBLIC_ENABLE_ADMIN_CREATION === 'true';
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('EMPLOYEE');
  const [jobs, setJobs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.fullName);
      setPhone(user.phone || '');
      setAccountType(getUserRole(user.accountType));
      setJobs(normalizeJobs(user.jobs));
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const isSelf = Boolean(user?.authUserId && currentAuthUserId && user.authUserId === currentAuthUserId);
  const targetIsAdmin = getUserRole(user.accountType) === 'ADMIN';
  const canEdit = mode === 'edit' && isManager && !(targetIsAdmin && !isAdmin) && !(targetIsAdmin && !allowAdminCreation);
  const canEditAccountType =
    canEdit && (isAdmin || isManager) && !isSelf && !(targetIsAdmin && !isAdmin);
  const requiresJobs = accountType === 'EMPLOYEE' || accountType === 'MANAGER';

  const toggleJob = (job: string) => {
    setJobs((prev) => (prev.includes(job) ? prev.filter((j) => j !== job) : [...prev, job]));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (!fullName.trim()) {
      onError('Full name is required.');
      return;
    }
    if (requiresJobs && jobs.length === 0) {
      onError('At least one job is required for employees.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          organizationId,
          fullName: fullName.trim(),
          phone: phone.trim() || '',
          accountType,
          jobs,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        onError(payload.error || 'Unable to update profile.');
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
            value={user.email || ''}
            disabled
            className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary opacity-60"
          />
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
