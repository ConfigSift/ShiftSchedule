'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Repeat2, Umbrella, User, MessageSquare } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { getAppHomeHref } from '../../lib/routing/getAppHomeHref';

export function EmployeeMobileNav() {
  const pathname = usePathname();
  const { openProfileModal, isProfileModalOpen } = useUIStore();
  const isProfileActive = pathname === '/profile' || isProfileModalOpen;
  const appHomeHref = getAppHomeHref();
  const navItems = useMemo(
    () => [
      { href: appHomeHref, label: 'Schedule', icon: CalendarDays },
      { href: '/shift-exchange', label: 'Swap', icon: Repeat2 },
      { href: '/review-requests', label: 'Time Off', icon: Umbrella },
      { href: '/chat', label: 'Chat', icon: MessageSquare },
    ],
    [appHomeHref],
  );

  return (
    <nav
      id="employee-mobile-nav"
      className="md:hidden fixed bottom-0 left-0 right-0 bg-theme-secondary border-t border-theme-primary px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] flex items-center justify-between"
    >
      {navItems.map((item) => {
        const isScheduleRoute = item.href === '/' && (pathname === '/' || pathname === '/dashboard');
        const isActive = isScheduleRoute || pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 ${
              isActive ? 'text-amber-400' : 'text-theme-tertiary'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="text-[10px] font-semibold">{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={openProfileModal}
        className={`flex flex-col items-center gap-1 ${
          isProfileActive ? 'text-amber-400' : 'text-theme-tertiary'
        }`}
        aria-label="My Profile"
      >
        <User className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-semibold">Profile</span>
      </button>
    </nav>
  );
}
