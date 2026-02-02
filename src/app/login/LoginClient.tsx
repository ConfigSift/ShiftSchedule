'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Lock, Mail } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';
import { deriveAuthPasswordFromPin, isValidPin } from '../../utils/pin';

type LoginClientProps = {
  notice?: string | null;
  setupDisabled: boolean;
};

export default function LoginClient({ notice, setupDisabled }: LoginClientProps) {
  const router = useRouter();
  const { currentUser, activeRestaurantId, accessibleRestaurants, pendingInvitations, init } = useAuthStore();

  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasManagers, setHasManagers] = useState<boolean | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    let isMounted = true;
    supabase.rpc('has_manager').then(({ data }: { data: boolean | null }) => {
      if (isMounted) {
        setHasManagers(Boolean(data));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    // Rule 1: Pending invitations AND no selection -> /restaurants
    if (pendingInvitations.length > 0 && !activeRestaurantId) {
      router.push('/restaurants');
      return;
    }

    // Rule 2: No memberships -> /restaurants
    if (accessibleRestaurants.length === 0) {
      router.push('/restaurants');
      return;
    }

    // Rule 3: Single membership -> /dashboard (init auto-selects)
    if (accessibleRestaurants.length === 1) {
      router.push('/dashboard');
      return;
    }

    // Rule 4: Multiple memberships
    if (activeRestaurantId) {
      router.push('/dashboard');
    } else {
      router.push('/restaurants');
    }
  }, [currentUser, activeRestaurantId, accessibleRestaurants, pendingInvitations, router]);

  const isPasscodeValid = isValidPin(passcode) || passcode.length >= 6;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = isPasscodeValid && isEmailValid && !loading;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loginEmail = email.trim().toLowerCase();

      const authPassword = isValidPin(passcode) ? deriveAuthPasswordFromPin(passcode) : passcode;
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug(
          '[login] email=',
          loginEmail,
          'pwLen=',
          authPassword.length,
          'pwPrefix=',
          authPassword.slice(0, 4)
        );
      }
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: authPassword,
      });

      if (authError) {
        setError(authError.message || 'Invalid email or PIN.');
        setPasscode('');
        return;
      }

      await useAuthStore.getState().refreshProfile();
      const {
        accessibleRestaurants: refreshedRestaurants,
        pendingInvitations: refreshedInvitations,
      } = useAuthStore.getState();

      // Rule 1: Pending invitations -> /restaurants (to manage invites)
      if (refreshedInvitations.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[login] has pending invitations, redirecting to /restaurants');
        }
        router.push('/restaurants');
        return;
      }

      // Rule 2: No memberships and no invitations -> show error
      if (refreshedRestaurants.length === 0) {
        await supabase.auth.signOut();
        setError('No restaurant access for this account.');
        return;
      }

      // Rule 3: Single membership -> auto-select and go to dashboard
      if (refreshedRestaurants.length === 1) {
        const only = refreshedRestaurants[0];
        useAuthStore.getState().setActiveOrganization(only.id, only.restaurantCode);
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[login] single membership, auto-selecting:', only.id);
        }
        router.push('/dashboard');
        return;
      }

      // Rule 4: Multiple memberships -> /restaurants (do NOT auto-select)
      if (refreshedRestaurants.length > 1) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[login] multiple memberships, redirecting to /restaurants');
        }
        router.push('/restaurants');
        return;
      }
    } catch {
      setError('Login failed.');
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
          <p className="text-theme-tertiary mt-1">Sign in to continue</p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          {notice === 'manager-only' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-400">
                Accounts are created by your manager.
              </p>
            </div>
          )}
          {notice === 'setup-disabled' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-400">
                Setup is disabled. Contact your administrator.
              </p>
            </div>
          )}

          {hasManagers === false && !setupDisabled && (
            <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <div>
                <p className="text-sm font-medium text-amber-500">First time here?</p>
                <p className="text-xs text-amber-400/80">Create the first manager account.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/setup')}
                className="px-3 py-1.5 rounded-md bg-amber-500 text-zinc-900 text-xs font-semibold hover:bg-amber-400"
              >
                Go to setup
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="you@restaurant.com"
                  autoFocus
                  required
                />
              </div>
              {!isEmailValid && email.length > 0 && (
                <p className="text-xs text-red-400 mt-1">Enter a valid email.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                PIN or Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="password"
                  maxLength={64}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="******"
                  required
                />
              </div>
              {!isPasscodeValid && passcode.length > 0 && (
                <p className="text-xs text-red-400 mt-1">Enter a 4-digit PIN or a 6+ character password.</p>
              )}
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
