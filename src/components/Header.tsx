'use client';

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
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getUserRole, isManagerRole } from '../utils/role';

export function Header() {
  const router = useRouter();
  const { 
    openModal,
    getPendingTimeOffRequests,
  } = useScheduleStore();

  const { currentUser, signOut } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const currentRole = getUserRole(currentUser?.role);
  const { openProfileModal, openTimeOffModal } = useUIStore();

  const handleLogout = () => {
    signOut();
    router.push('/login');
  };

  const pendingRequests = getPendingTimeOffRequests();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-theme-secondary border-b border-theme-primary transition-theme">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-zinc-900" />
          </div>
          <nav className="flex items-center gap-2 overflow-x-auto">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Schedule</span>
            </Link>
            <Link
              href="/review-requests"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Review Requests</span>
              {pendingRequests.length > 0 && (
                <span className="w-5 h-5 bg-amber-500 text-zinc-900 text-xs font-bold rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Team Chat</span>
            </Link>
            {isManagerRole(currentRole) && (
              <Link
                href="/staff"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Manage Staff</span>
              </Link>
            )}
            {isManagerRole(currentRole) && (
              <Link
                href="/blocked-days"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              >
                <CalendarOff className="w-4 h-4" />
                <span className="hidden sm:inline">Blocked Days</span>
              </Link>
            )}
            {isManagerRole(currentRole) && (
              <Link
                href="/business-hours"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              >
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Business Hours</span>
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
          </button>

          {isManagerRole(currentRole) && (
            <button 
              onClick={() => openModal('addShift')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-all hover:shadow-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Shift</span>
            </button>
          )}

          {currentUser && (
            <button
              onClick={() => openTimeOffModal({ employeeId: currentUser.id })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
            >
              <CalendarOff className="w-4 h-4" />
              <span className="hidden sm:inline">Request Time Off</span>
            </button>
          )}

          <button
            onClick={openProfileModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">My Profile</span>
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-red-500/20 hover:text-red-400 transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>

        </div>
      </div>
    </header>
  );
}
