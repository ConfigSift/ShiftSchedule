'use client';

import { useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { Modal } from './Modal';
import { getUserRole, isManagerRole } from '../utils/role';

export function AddEmployeeModal() {
  const { modalType, closeModal } = useScheduleStore();
  const { currentUser } = useAuthStore();

  const isManager = isManagerRole(getUserRole(currentUser?.role));
  const isOpen = modalType === 'addEmployee' || modalType === 'editEmployee';

  useEffect(() => {
    if (!isManager && isOpen) {
      closeModal();
    }
  }, [isManager, isOpen, closeModal]);

  if (!isManager || !isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Add Staff" size="md">
      <div className="space-y-4">
        <p className="text-sm text-theme-tertiary">
          Staff accounts are created in the Staff Manager. Use the Manage Staff page to add or edit team members.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
