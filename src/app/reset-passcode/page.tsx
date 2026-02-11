'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';

export default function ResetPasscodePage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const hydrateSessionFromHash = async () => {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash.replace('#', '');
      const params = new URLSearchParams(hash);
      const type = params.get('type');
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (type === 'recovery' && access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError) {
          if (isMounted) {
            setError(sessionError.message || 'Unable to start recovery session.');
          }
          return;
        }

        if (isMounted) {
          setReady(true);
        }

        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        setReady(Boolean(data.session));
      }
    };

    hydrateSessionFromHash();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    return () => {
      isMounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const isValidPin = useMemo(() => /^\d{6}$/.test(pin), [pin]);
  const matches = pin === confirmPin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isValidPin) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    if (!matches) {
      setError('PINs do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: pin });
      if (updateError) {
        setError(updateError.message || 'Unable to update PIN.');
        return;
      }
      setSuccess('PIN updated. You can now sign in.');
      await supabase.auth.signOut();
      setTimeout(() => {
        router.push('/login');
      }, 600);
    } catch {
      setError('Unable to update PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">ShiftFlow</h1>
          <p className="text-theme-tertiary mt-1">Reset your PIN</p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          {error && !ready && !success && (
            <p className="text-sm text-red-400 text-center mb-4">{error}</p>
          )}
          {!ready && !success && (
            <div className="text-sm text-theme-tertiary">
              Open the recovery link from your email to set a new PIN.
            </div>
          )}

          {ready && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  New PIN (6 digits)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="123456"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  Confirm PIN
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="123456"
                    required
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-400 text-center">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update PIN'}
              </button>
            </form>
          )}

          {success && (
            <div className="space-y-4">
              <p className="text-sm text-emerald-400 text-center">{success}</p>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full py-3 bg-theme-tertiary text-theme-secondary rounded-lg hover:bg-theme-hover transition-colors"
              >
                Back to login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
