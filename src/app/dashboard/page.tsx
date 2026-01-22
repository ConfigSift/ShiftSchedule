'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../components/Dashboard';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';

export default function DashboardPage() {
  const router = useRouter();
  const { hydrate, isHydrated, employees } = useScheduleStore();
  const { currentUser, checkSession, isInitialized } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated) {
      checkSession(employees);
    }
  }, [isHydrated, employees, checkSession]);

  useEffect(() => {
    if (isHydrated && isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [isHydrated, isInitialized, currentUser, router]);

  if (!isHydrated || !isInitialized || !currentUser) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return <Dashboard />;
}
