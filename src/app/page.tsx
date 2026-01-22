'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '../store/scheduleStore';
import { useAuthStore } from '../store/authStore';

export default function Home() {
  const router = useRouter();
  const { employees, isHydrated, hydrate } = useScheduleStore();
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
    if (isHydrated && isInitialized) {
      if (employees.length === 0) {
        // No employees exist, go to setup
        router.push('/login?setup=true');
      } else if (currentUser) {
        // Logged in, go to dashboard
        router.push('/dashboard');
      } else {
        // Not logged in, go to login
        router.push('/login');
      }
    }
  }, [isHydrated, isInitialized, employees, currentUser, router]);

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-theme-secondary">Loading...</p>
      </div>
    </div>
  );
}
