'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';

type AccountDeleteResponse = {
  ok: boolean;
  deletedAuthUser: boolean;
};

type DeleteApiError = {
  error?: string;
  message?: string;
  manageBillingUrl?: string;
  table?: string;
  code?: string;
  details?: string;
  hint?: string;
  count?: number;
};

export default function AccountPage() {
  const router = useRouter();
  const { signOut } = useAuthStore();

  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState<DeleteApiError | null>(null);
  const [manageBillingUrl, setManageBillingUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(Boolean(data.session?.user));
      setSessionReady(true);
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!hasSession) {
      router.replace('/login');
    }
  }, [hasSession, router, sessionReady]);

  const handleDeleteAccount = async () => {
    if (confirm !== 'DELETE' || submitting) return;

    setSubmitting(true);
    setError('');
    setErrorDetails(null);
    setManageBillingUrl(null);

    const result = await apiFetch<AccountDeleteResponse | DeleteApiError>('/api/account/delete', {
      method: 'POST',
      json: { confirm: 'DELETE' },
    });

    if (!result.ok) {
      const body = (result.data ?? null) as DeleteApiError | null;
      const message =
        body?.error === 'RESTAURANTS_REMAIN'
          ? `Delete all restaurants first (${Number(body.count ?? 0)} remaining).`
          : body?.message || body?.error || result.error || 'Unable to delete account.';
      setError(message);
      setErrorDetails(body);
      setManageBillingUrl(body?.manageBillingUrl ?? null);
      setSubmitting(false);
      return;
    }

    await signOut();
    router.replace('/login?notice=account-deleted');
  };

  if (!sessionReady || !hasSession) {
    return null;
  }

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-theme-secondary p-6 shadow-xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-red-500/15 p-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-theme-primary">Delete account</h1>
            <p className="text-sm text-theme-tertiary mt-1">
              This permanently deletes your CrewShyft account and cannot be undone.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-theme-muted">Type DELETE to confirm</label>
          <input
            type="text"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="DELETE"
            className="w-full rounded-lg border border-theme-primary bg-theme-tertiary px-3 py-2 text-theme-primary"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 space-y-2">
            <p className="text-sm text-red-300">{error}</p>
            {(errorDetails?.table || errorDetails?.code || errorDetails?.details || errorDetails?.hint) && (
              <div className="space-y-1 text-xs text-red-200/90">
                {errorDetails?.table && <p>Table: <span className="font-mono">{errorDetails.table}</span></p>}
                {errorDetails?.code && <p>Code: <span className="font-mono">{errorDetails.code}</span></p>}
                {errorDetails?.details && <p>Details: {errorDetails.details}</p>}
                {errorDetails?.hint && <p>Hint: {errorDetails.hint}</p>}
              </div>
            )}
            {manageBillingUrl && (
              <button
                type="button"
                onClick={() => window.open(manageBillingUrl, '_blank')}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-amber-400 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Manage Billing
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={confirm !== 'DELETE' || submitting}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Deleting...' : 'Permanently delete'}
          </button>
          <Link
            href="/join"
            className="inline-flex items-center justify-center rounded-lg border border-theme-primary px-4 py-2.5 text-sm font-medium text-theme-secondary hover:bg-theme-hover transition-colors"
          >
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}
