'use client';

import { useState, useRef, useEffect } from 'react';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useUIStore } from '../store/uiStore';
import { 
  Calendar,
  Plus,
  Sun,
  Moon,
  MessageSquare,
  User,
  LogOut,
  CalendarOff,
  Users,
  Clock,
  ClipboardList,
  ShieldCheck,
  Menu,
  X,
  MoreHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { getUserRole, isManagerRole } from '../utils/role';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  
  const { 
    openModal,
    getPendingTimeOffRequests,
  } = useScheduleStore();

  const { currentUser, signOut } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const currentRole = getUserRole(currentUser?.role);
  const { openProfileModal, openTimeOffModal, toggleSidebar } = useUIStore();

  const handleLogout = () => {
    signOut();
    router.push('/login');
  };

  const pendingRequests = getPendingTimeOffRequests();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    if (moreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [pathname]);

  const isOnDashboard = pathname === '/dashboard';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 sm:h-16 bg-theme-secondary border-b border-theme-primary transition-theme">
      <div className="h-full px-2 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Logo + Mobile sidebar toggle + Primary nav */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          {/* Mobile sidebar toggle - only on dashboard */}
          {isOnDashboard && (
            <button
              onClick={toggleSidebar}
              className="md:hidden p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
              aria-label="Toggle staff sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-zinc-900" />
            </div>
            <span className="hidden sm:inline font-semibold text-theme-primary">ShiftFlow</span>
          </Link>
          
          {/* Primary nav - always visible */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              aria-label="Schedule"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Schedule</span>
            </Link>
            
            {/* Review Requests - visible on tablet+ */}
            <Link
              href="/review-requests"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              aria-label="Review Requests"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="hidden lg:inline">Review Requests</span>
              {pendingRequests.length > 0 && (
                <span className="w-5 h-5 bg-amber-500 text-zinc-900 text-xs font-bold rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </Link>
          </nav>
        </div>

        {/* Right: Actions + More menu */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Add Shift - always visible for managers */}
          {isManagerRole(currentRole) && (
            <button 
              onClick={() => openModal('addShift')}
              className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-all hover:shadow-lg text-sm font-medium"
              aria-label="Add Shift"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Shift</span>
            </button>
          )}

          {/* Request Time Off - visible on larger screens */}
          {currentUser && (
            <button
              onClick={() => openTimeOffModal({ employeeId: currentUser.id })}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
              aria-label="Request Time Off"
            >
              <CalendarOff className="w-4 h-4" />
              <span className="hidden lg:inline">Request Time Off</span>
            </button>
          )}

          {/* My Profile - visible on larger screens */}
          <button
            onClick={openProfileModal}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
            aria-label="My Profile"
          >
            <User className="w-4 h-4" />
            <span className="hidden lg:inline">My Profile</span>
          </button>

          {/* More menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className="inline-flex items-center gap-1.5 p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
              aria-label="More options"
              aria-expanded={moreMenuOpen}
            >
              {moreMenuOpen ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
            </button>

            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-theme-secondary border border-theme-primary rounded-xl shadow-xl py-2 z-50 animate-slide-in">
                {/* Mobile-only items */}
                <div className="sm:hidden border-b border-theme-primary pb-2 mb-2">
                  <Link
                    href="/review-requests"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Review Requests
                    {pendingRequests.length > 0 && (
                      <span className="ml-auto w-5 h-5 bg-amber-500 text-zinc-900 text-xs font-bold rounded-full flex items-center justify-center">
                        {pendingRequests.length}
                      </span>
                    )}
                  </Link>
                  
                  <button
                    onClick={() => { openProfileModal(); setMoreMenuOpen(false); }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                  >
                    <User className="w-4 h-4" />
                    My Profile
                  </button>
                </div>

                {/* Request Time Off - mobile/tablet */}
                {currentUser && (
                  <button
                    onClick={() => { openTimeOffModal({ employeeId: currentUser.id }); setMoreMenuOpen(false); }}
                    className="md:hidden flex items-center gap-3 w-full px-4 py-2.5 text-sm text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                  >
                    <CalendarOff className="w-4 h-4" />
                    Request Time Off
                  </button>
                )}

                <Link
                  href="/chat"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Team Chat
                </Link>

                {isManagerRole(currentRole) && (
                  <>
                    <Link
                      href="/manager"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Site Manager
                    </Link>
                    <Link
                      href="/staff"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                    >
                      <Users className="w-4 h-4" />
                      Manage Staff
                    </Link>
                    <Link
                      href="/blocked-days"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                    >
                      <CalendarOff className="w-4 h-4" />
                      Blocked Days
                    </Link>
                    <Link
                      href="/business-hours"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                    >
                      <Clock className="w-4 h-4" />
                      Business Hours
                    </Link>
                  </>
                )}

                <div className="border-t border-theme-primary pt-2 mt-2">
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
                  </button>
                  
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
