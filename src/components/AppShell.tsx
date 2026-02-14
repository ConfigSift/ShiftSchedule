'use client';

import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { StatsFooter } from './StatsFooter';
import { StaffProfileModal } from './StaffProfileModal';
import { TimeOffRequestModal } from './TimeOffRequestModal';
import { EmployeeMobileNav } from './employee/EmployeeMobileNav';
import { useAuthStore } from '../store/authStore';
import { useScheduleStore } from '../store/scheduleStore';
import { useUIStore } from '../store/uiStore';
import { getUserRole, isManagerRole } from '../utils/role';
import { SubscriptionBanner } from './billing/SubscriptionBanner';
import { SubscriptionGate } from './billing/SubscriptionGate';

type AppShellProps = {
  children: React.ReactNode;
  /** If true, shows the stats footer (default: true) */
  showFooter?: boolean;
};

export function AppShell({ children, showFooter = true }: AppShellProps) {
  const pathname = usePathname();
  const isStandalonePage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/start' ||
    pathname === '/onboarding' ||
    pathname === '/setup' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/subscribe') ||
    pathname.startsWith('/demo');
  const isChatPage = pathname === '/chat';
  const isDashboardPage = pathname === '/dashboard';
  const isRestaurantsPage = pathname === '/restaurants';
  const isEmployeeNavPage =
    pathname === '/dashboard' ||
    pathname === '/shift-exchange' ||
    pathname === '/review-requests' ||
    pathname === '/profile' ||
    pathname === '/chat';

  const { currentUser, activeRestaurantId, refreshProfile } = useAuthStore();
  const { showToast } = useScheduleStore();
  const { isProfileModalOpen, closeProfileModal } = useUIStore();
  const role = getUserRole(currentUser?.role);
  const isAdmin = role === 'ADMIN';
  const isManager = isManagerRole(role);
  const isEmployee = role === 'EMPLOYEE';
  // Hide footer on /restaurants or for employees
  const shouldShowFooter = showFooter && !isRestaurantsPage && !isEmployee;
  const shouldShowEmployeeNav = isEmployee && isEmployeeNavPage && !isStandalonePage;
  const [employeeNavHeight, setEmployeeNavHeight] = useState(0);
  const shouldPadContent = shouldShowEmployeeNav && !isDashboardPage && !isChatPage;
  const employeeNavPadding = shouldPadContent ? 'employee-nav-pad' : '';
  const employeeNavStyle: CSSProperties | undefined = shouldShowEmployeeNav
    ? ({ ['--employee-nav-h' as const]: `${employeeNavHeight}px` } as CSSProperties)
    : undefined;
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

  useEffect(() => {
    if (!shouldShowEmployeeNav) {
      const timer = setTimeout(() => setEmployeeNavHeight(0), 0);
      return () => clearTimeout(timer);
    }

    const measure = () => {
      const nav = document.getElementById('employee-mobile-nav');
      if (!nav) return;
      const { height } = nav.getBoundingClientRect();
      setEmployeeNavHeight((prev) => (Math.abs(prev - height) > 1 ? height : prev));
    };

    const timer = setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [shouldShowEmployeeNav]);

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
      style={employeeNavStyle}
    >
      <Suspense fallback={null}>
        <Header minimal={isRestaurantsPage} />
      </Suspense>
      {/* Main content area - accounts for fixed header and footer */}
      <div
        className={`flex-1 min-h-0 pt-14 sm:pt-16 ${shouldShowFooter ? 'pb-12 sm:pb-14' : ''} bg-theme-timeline flex flex-col ${
          isChatPage || isDashboardPage ? 'overflow-hidden' : ''
        }`}
        data-chat-content={isChatPage ? 'true' : undefined}
      >
        {!isRestaurantsPage && <SubscriptionBanner />}
        <SubscriptionGate>
          <div
            className={`flex-1 min-h-0 bg-theme-timeline ${employeeNavPadding} ${
              isChatPage || isDashboardPage ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
            }`}
          >
            {children}
          </div>
        </SubscriptionGate>
      </div>
      {shouldShowFooter && <StatsFooter />}
      {shouldShowEmployeeNav && <EmployeeMobileNav />}
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
