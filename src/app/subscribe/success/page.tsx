'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { apiFetch } from '../../../lib/apiClient';

const POLL_BACKOFF_STEPS_MS = [750, 1250, 2000, 3000, 5000];

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.log('[subscribe:success]', message, payload ?? {});
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function SubscribeSuccessPage() {
  const router = useRouter();
  const { activeRestaurantId, isInitialized, init } = useAuthStore();

  const [status, setStatus] = useState<'polling' | 'active' | 'timeout'>('polling');
  const [syncCompleted, setSyncCompleted] = useState(false);
  const pollingRef = useRef(false);
  const syncRef = useRef(false);

  // Initialize auth if needed
  useEffect(() => {
    if (!isInitialized) init();
  }, [isInitialized, init]);

  // Trigger one server-side sync from checkout session before status polling.
  useEffect(() => {
    if (syncRef.current) return;
    syncRef.current = true;
    let mounted = true;

    async function syncAfterCheckout() {
      const checkoutSessionId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('session_id')
          : null;

      if (!checkoutSessionId) {
        debugLog('no checkout session id in URL; skipping sync-after-checkout');
        if (mounted) setSyncCompleted(true);
        return;
      }

      debugLog('calling sync-after-checkout', { sessionId: checkoutSessionId });
      const result = await apiFetch<{ ok: boolean; status: string; organization_id: string }>(
        '/api/billing/sync-after-checkout',
        {
          method: 'POST',
          json: { session_id: checkoutSessionId },
        },
      );

      debugLog('sync-after-checkout response', {
        sessionId: checkoutSessionId,
        ok: result.ok,
        status: result.data?.status ?? null,
        organizationId: result.data?.organization_id ?? null,
        error: result.error ?? null,
      });

      if (!mounted) return;
      setSyncCompleted(true);
    }

    syncAfterCheckout().catch((error) => {
      debugLog('sync-after-checkout error', {
        sessionId:
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('session_id')
            : null,
        error: error instanceof Error ? error.message : String(error),
      });
      if (mounted) setSyncCompleted(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Poll subscription status
  useEffect(() => {
    if (!syncCompleted || !activeRestaurantId || pollingRef.current) return;
    pollingRef.current = true;

    let mounted = true;

    async function checkStatus(): Promise<boolean> {
      const result = await apiFetch<{ status: string }>(
        `/api/billing/subscription-status?organizationId=${activeRestaurantId}`,
      );
      const subStatus = result.data?.status;
      debugLog('subscription-status response', {
        organizationId: activeRestaurantId,
        status: subStatus ?? null,
        ok: result.ok,
      });
      return subStatus === 'active' || subStatus === 'trialing';
    }

    async function runFinalizationPolling() {
      debugLog('starting finalization polling', { organizationId: activeRestaurantId });

      // Attempt immediately, then back off between retries.
      if (await checkStatus()) {
        if (!mounted) return;
        setStatus('active');
        router.refresh();
        router.replace('/dashboard');
        return;
      }

      for (const waitMs of POLL_BACKOFF_STEPS_MS) {
        await delay(waitMs);
        if (!mounted) return;

        if (await checkStatus()) {
          if (!mounted) return;
          setStatus('active');
          router.refresh();
          router.replace('/dashboard');
          return;
        }
      }

      if (!mounted) return;
      debugLog('polling timed out', { organizationId: activeRestaurantId });
      setStatus('timeout');
    }

    runFinalizationPolling().catch((error) => {
      debugLog('polling error', {
        organizationId: activeRestaurantId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (mounted) setStatus('timeout');
    });

    return () => {
      mounted = false;
    };
  }, [activeRestaurantId, router, syncCompleted]);

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <p className="text-xl font-bold text-theme-primary">ShiftFlow</p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-8 shadow-xl">
          {status === 'polling' && (
            <>
              <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
              <h1 className="text-xl font-bold text-theme-primary mb-2">
                Finalizing subscription...
              </h1>
              <p className="text-sm text-theme-tertiary">
                We&#39;re activating your subscription. This usually takes just a moment.
              </p>
            </>
          )}

          {status === 'active' && (
            <>
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-theme-primary mb-2">
                You&#39;re all set!
              </h1>
              <p className="text-sm text-theme-tertiary">
                Your subscription is active. Redirecting to your dashboard...
              </p>
            </>
          )}

          {status === 'timeout' && (
            <>
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-6 h-6 text-amber-500" />
              </div>
              <h1 className="text-xl font-bold text-theme-primary mb-2">
                Taking longer than expected
              </h1>
              <p className="text-sm text-theme-tertiary mb-6">
                Your payment was received. You can continue to your dashboard now.
                If you still see Subscription Required, refresh once.
              </p>
              <button
                onClick={() => router.replace('/dashboard')}
                className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
              >
                Continue to dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
