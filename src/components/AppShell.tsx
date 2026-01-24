'use client';

import { usePathname } from 'next/navigation';
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
  /** If true, shows the stats footer (default: true) */
  showFooter?: boolean;
};

export function AppShell({ children, showFooter = true }: AppShellProps) {
  const pathname = usePathname();
  const isStandalonePage = pathname === '/login' || pathname === '/setup';

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

  // Render standalone pages without header/footer
  if (isStandalonePage) {
    return (
      <div className="min-h-[100dvh] bg-theme-primary text-theme-primary transition-theme">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-theme-primary text-theme-primary transition-theme flex flex-col">
      <Header />
      {/* Main content area - accounts for fixed header and footer */}
      <div className={`flex-1 pt-14 sm:pt-16 ${showFooter ? 'pb-12 sm:pb-14' : ''} bg-theme-timeline`}>
        <div className="h-full overflow-y-auto bg-theme-timeline">
          {children}
        </div>
      </div>
      {showFooter && <StatsFooter />}
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
