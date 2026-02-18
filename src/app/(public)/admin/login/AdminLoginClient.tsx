'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

type AdminLoginClientProps = {
  nextPath?: string | null;
};

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function sanitizeNextPath(candidate?: string | null): string {
  const value = String(candidate ?? '').trim();
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/admin';
  if (/http/i.test(value)) return '/admin';
  const pathname = value.split('?')[0] ?? '/admin';
  if (pathMatchesPrefix(pathname, '/admin/login')) return '/admin';
  return value;
}

async function fetchAdminMe() {
  return fetch('/api/admin/me', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
}

export default function AdminLoginClient({ nextPath }: AdminLoginClientProps) {
  const router = useRouter();
  const safeNextPath = useMemo(() => sanitizeNextPath(nextPath), [nextPath]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');

  const verifyAdminAccess = useCallback(async () => {
    const response = await fetchAdminMe();
    if (response.ok) return true;

    if (response.status === 403) {
      await supabase.auth.signOut();
      setError('This account is not authorized for admin access.');
      return false;
    }

    if (response.status === 401) {
      await supabase.auth.signOut();
      setError('Session verification failed. Please sign in again.');
      return false;
    }

    setError('Unable to verify admin access right now. Please try again.');
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyExistingSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) {
          setCheckingSession(false);
          return;
        }

        const isAdmin = await verifyAdminAccess();
        if (cancelled) return;

        if (isAdmin) {
          router.replace(safeNextPath);
          return;
        }

        setCheckingSession(false);
      } catch {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    };

    void verifyExistingSession();
    return () => {
      cancelled = true;
    };
  }, [router, safeNextPath, verifyAdminAccess]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (signInError) {
        setError(signInError.message || 'Unable to sign in.');
        return;
      }

      // `next` is only used for safe internal admin redirects after authorization succeeds.
      const isAdmin = await verifyAdminAccess();
      if (!isAdmin) return;

      router.replace(safeNextPath);
    } catch {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-theme-primary bg-theme-secondary p-6 text-center text-theme-secondary">
          Checking admin session...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-theme-primary bg-theme-secondary p-6 shadow-xl">
        <h1 className="text-2xl font-bold text-theme-primary">Admin Sign In</h1>
        <p className="mt-1 text-sm text-theme-tertiary">Sign in with your platform admin account.</p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-theme-secondary">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-theme-primary bg-theme-tertiary px-3 py-2 text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="admin@company.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-theme-secondary">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-theme-primary bg-theme-tertiary px-3 py-2 text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-amber-400 disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
