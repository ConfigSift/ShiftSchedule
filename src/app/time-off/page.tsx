'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import Link from 'next/link';

export default function TimeOffPage() {
  const router = useRouter();
  const { currentUser, isInitialized, init } = useAuthStore();
  const isManager = isManagerRole(getUserRole(currentUser?.role));

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && (!currentUser || !isManager)) {
      router.push('/dashboard?notice=forbidden');
    }
  }, [isInitialized, currentUser, isManager, router]);

  if (!isInitialized || !currentUser || !isManager) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-theme-primary">Time Off Requests</h1>
        <p className="text-theme-tertiary">
          Time off reviews now live in Review Requests.
        </p>
        <Link
          href="/review-requests"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors"
        >
          Go to Review Requests
        </Link>
      </div>
    </div>
  );
}
