'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Loader2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type VerifyRecoveryResponse = {
  error?: string;
  redirect?: string;
};

function toSafeNext(candidate: string | null) {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return '/reset-password';
  }
  if (/http/i.test(candidate)) {
    return '/reset-password';
  }
  return candidate;
}

function getRecoveryErrorMessage(code: string | undefined) {
  if (code === 'missing_token_hash') {
    return 'This recovery link is missing token_hash. Please request a new link.';
  }
  if (code === 'otp_invalid_or_expired') {
    return 'This recovery link is invalid or has expired. Please request a new link.';
  }
  return 'Unable to continue with password reset. Please request a new link.';
}

export default function RecoveryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const recoveryParams = useMemo(() => {
    const tokenHash = searchParams.get('token_hash')?.trim() || '';
    const code = searchParams.get('code')?.trim() || '';
    const token = searchParams.get('token')?.trim() || '';
    const type = searchParams.get('type')?.trim() || 'recovery';
    const next = toSafeNext(searchParams.get('next'));

    return {
      tokenHash,
      code,
      token,
      type,
      next,
      hasTokenHash: Boolean(tokenHash),
      hasMisconfiguredLink: Boolean(code || token),
    };
  }, [searchParams]);

  const missingTokenMessage = recoveryParams.hasMisconfiguredLink
    ? 'This recovery link is missing token_hash. Please request a new link.'
    : 'This recovery link is missing token_hash. Please request a new link.';

  const handleContinue = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token_hash: recoveryParams.tokenHash,
          type: recoveryParams.type === 'recovery' ? 'recovery' : 'recovery',
          next: recoveryParams.next,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as VerifyRecoveryResponse;

      if (!response.ok || !result.redirect) {
        setError(getRecoveryErrorMessage(result.error));
        return;
      }

      router.replace(result.redirect);
    } catch {
      setError(getRecoveryErrorMessage(undefined));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNewLink = async () => {
    setNavigating(true);
    setError('');

    try {
      await supabase.auth.signOut();
    } catch {
      // Best effort: the recovery session may already be invalid.
    }

    try {
      await fetch('/api/auth/clear-recovery', {
        method: 'POST',
      });
    } catch {
      // Best effort: we still want to return the user to login.
    }

    router.replace('/login?forgot=1');
  };

  return (
    <div className="min-h-screen bg-theme-primary relative flex items-center justify-center p-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">CrewShyft</h1>
          <p className="text-theme-tertiary mt-1">Reset your password</p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-theme-primary bg-theme-tertiary px-4 py-3">
            <div className="mt-0.5 rounded-lg bg-amber-500/10 p-2">
              <Lock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-theme-primary">Reset your password</p>
              <p className="text-sm text-theme-tertiary">
                Continue to verify your recovery link and open the password reset screen.
              </p>
            </div>
          </div>

          {!recoveryParams.hasTokenHash && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">
                {missingTokenMessage}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleContinue}
            disabled={!recoveryParams.hasTokenHash || loading || navigating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 font-semibold text-zinc-900 transition-all hover:bg-amber-400 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Continuing...' : 'Continue'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleRequestNewLink}
              disabled={navigating || loading}
              className="text-sm text-amber-400 transition-colors hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {navigating ? 'Returning to login...' : 'Request a new link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
