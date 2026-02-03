'use client';

import { useEffect } from 'react';
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
  const isChatPage = pathname === '/chat';
  const isDashboardPage = pathname === '/dashboard';
  const isRestaurantsPage = pathname === '/restaurants';

  const { currentUser, activeRestaurantId, refreshProfile } = useAuthStore();
  const { showToast } = useScheduleStore();
  const { isProfileModalOpen, closeProfileModal } = useUIStore();
  const role = getUserRole(currentUser?.role);
  const isAdmin = role === 'ADMIN';
  const isManager = isManagerRole(role);
  const isEmployee = role === 'EMPLOYEE';
  // Hide footer on /restaurants or for employees
  const shouldShowFooter = showFooter && !isRestaurantsPage && !isEmployee;
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
        jobPay: currentUser.jobPay,
        employeeNumber: currentUser.employeeNumber ?? null,
      }
    : null;

  // Chat page scroll lock - must be called before any early returns
  useEffect(() => {
    if (!isChatPage) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
    };
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
    };
  }, [isChatPage]);

  // Render standalone pages without header/footer
  if (isStandalonePage) {
    return (
      <div className="min-h-[100dvh] bg-theme-primary text-theme-primary transition-theme">
        {children}
      </div>
    );
  }

  return (
    <div
      className={`min-h-[100dvh] bg-theme-primary text-theme-primary transition-theme flex flex-col ${
        isChatPage || isDashboardPage ? 'h-[100dvh] overflow-hidden' : ''
      }`}
      data-chat-shell={isChatPage ? 'true' : undefined}
    >
      <Header minimal={isRestaurantsPage} />
      {/* Main content area - accounts for fixed header and footer */}
      <div
        className={`flex-1 min-h-0 pt-14 sm:pt-16 ${shouldShowFooter ? 'pb-12 sm:pb-14' : ''} bg-theme-timeline flex flex-col ${
          isChatPage || isDashboardPage ? 'overflow-hidden' : ''
        }`}
        data-chat-content={isChatPage ? 'true' : undefined}
      >
        <div
          className={`flex-1 min-h-0 bg-theme-timeline ${
            isChatPage || isDashboardPage ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          {children}
        </div>
      </div>
      {shouldShowFooter && <StatsFooter />}
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
