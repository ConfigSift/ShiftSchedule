'use client';

import { Header } from './Header';
import { StatsFooter } from './StatsFooter';
import { StaffProfileModal } from './StaffProfileModal';
import { TimeOffRequestModal } from './TimeOffRequestModal';
import { useAuthStore } from '../store/authStore';
import { useScheduleStore } from '../store/scheduleStore';
import { useUIStore } from '../store/uiStore';
import { getUserRole, isManagerRole } from '../utils/role';

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { currentUser, activeRestaurantId, refreshProfile } = useAuthStore();
  const { showToast } = useScheduleStore();
  const { isProfileModalOpen, closeProfileModal } = useUIStore();
  const role = getUserRole(currentUser?.role);
  const isAdmin = role === 'ADMIN';
  const isManager = isManagerRole(role);
  const profileUser = currentUser
    ? {
        id: currentUser.id,
        authUserId: currentUser.authUserId,
        fullName: currentUser.fullName || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        accountType: currentUser.role,
        jobs: currentUser.jobs || [],
        hourlyPay: currentUser.hourlyPay,
      }
    : null;

  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary transition-theme">
      <Header />
      <div className="h-screen pt-16 pb-14 bg-theme-timeline">
        <div className="h-full overflow-y-auto bg-theme-timeline">
          {children}
        </div>
      </div>
      <StatsFooter />
      <StaffProfileModal
        isOpen={isProfileModalOpen}
        mode="edit"
        user={profileUser}
        isAdmin={isAdmin}
        isManager={isManager}
        organizationId={activeRestaurantId ?? ''}
        currentAuthUserId={currentUser?.authUserId ?? null}
        onClose={closeProfileModal}
        onSaved={async () => {
          await refreshProfile();
          showToast('Profile updated', 'success');
        }}
        onError={(message) => showToast(message, 'error')}
        onAuthError={(message) => showToast(message, 'error')}
      />
      <TimeOffRequestModal />
    </div>
  );
}
