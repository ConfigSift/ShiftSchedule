'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../components/Dashboard';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';

export default function DashboardPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const { hydrate, isHydrated } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, init, userProfiles } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setNotice(params.get('notice'));
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      init();
    }
  }, [isHydrated, init]);

  useEffect(() => {
    if (isHydrated && isInitialized) {
      if (!currentUser) {
        router.push('/login');
        return;
      }
      const role = getUserRole(currentUser.role);
      if (isManagerRole(role) && !activeRestaurantId) {
        router.push('/manager');
      } else if (!activeRestaurantId) {
        router.push(role === 'EMPLOYEE' ? '/login' : '/manager');
      }
    }
  }, [isHydrated, isInitialized, currentUser, activeRestaurantId, userProfiles, router]);

  if (!isHydrated || !isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary">
      {notice === 'forbidden' && (
        <div className="bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm text-center py-2">
          You do not have access to that page.
        </div>
      )}
      <Dashboard />
    </div>
  );
}
