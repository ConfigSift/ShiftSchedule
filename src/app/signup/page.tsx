'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login?notice=manager-only');
  }, [router]);

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center">
      <p className="text-theme-secondary">Redirecting to login...</p>
    </div>
  );
}
