'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Lock, Mail, Store } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';
import { getUserRole, isManagerRole } from '../../utils/role';
import { normalizeUserRow } from '../../utils/userMapper';

type LoginClientProps = {
  notice?: string | null;
  setupDisabled: boolean;
};

export default function LoginClient({ notice, setupDisabled }: LoginClientProps) {
  const router = useRouter();
  const { currentUser, activeRestaurantId, init, setActiveOrganization } = useAuthStore();

  const [restaurantId, setRestaurantId] = useState('');
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
    if (currentUser) {
      if (isManagerRole(currentUser.role) && !activeRestaurantId) {
        router.push('/manager');
      } else {
        router.push('/dashboard');
      }
    }
  }, [currentUser, activeRestaurantId, router]);

  const normalizedRestaurantId = useMemo(
    () => restaurantId.trim().toUpperCase(),
    [restaurantId]
  );
  const isRestaurantIdValid = /^RST-[0-9A-HJKMNP-TV-Z]{8}$/.test(normalizedRestaurantId);
  const isPasscodeValid = /^\d{6}$/.test(passcode);
  const isEmailValid = Boolean(email.trim());
  const canSubmit = isRestaurantIdValid && isPasscodeValid && isEmailValid && !loading;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loginEmail = email.trim().toLowerCase();

      const { data: orgData, error: orgError } = (await supabase
        .from('organizations')
        .select('id,restaurant_code')
        .eq('restaurant_code', normalizedRestaurantId)
        .maybeSingle()) as {
        data: { id: string; restaurant_code: string } | null;
        error: { message: string } | null;
      };

      if (orgError || !orgData) {
        setError('Restaurant ID not found.');
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: passcode,
      });

      if (authError) {
        setError('Invalid email or PIN.');
        setPasscode('');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user?.id;
      if (!authUserId) {
        setError('Invalid email or PIN.');
        return;
      }

      const { data: userData, error: userError } = (await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)) as {
        data: Array<Record<string, any>> | null;
        error: { message: string } | null;
      };

      if (userError) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('Profile lookup failed', userError);
        }
        await supabase.auth.signOut();
        setError('Profile lookup failed (schema mismatch). Run migrations or contact admin.');
        return;
      }

      if (!userData || userData.length === 0) {
        await supabase.auth.signOut();
        setError('No user profile found. Contact your manager.');
        return;
      }

      const matchingUser = userData.find((user) => user.organization_id === orgData.id);
      if (!matchingUser) {
        await supabase.auth.signOut();
        setError("Restaurant ID doesn't match this account.");
        return;
      }

      await init();
      setActiveOrganization(orgData.id, orgData.restaurant_code);

      const accountType = normalizeUserRow(matchingUser).role;
      if (isManagerRole(accountType)) {
        router.push('/manager');
      } else {
        router.push('/dashboard');
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
                Restaurant ID
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={restaurantId}
                  onChange={(e) => setRestaurantId(e.target.value.toUpperCase())}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="RST-K7M2Q9PJ"
                  autoFocus
                  required
                />
              </div>
              {!isRestaurantIdValid && restaurantId.length > 0 && (
                <p className="text-xs text-red-400 mt-1">Use format RST-XXXXXXXX.</p>
              )}
            </div>

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
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                PIN
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="******"
                  required
                />
              </div>
              {!isPasscodeValid && passcode.length > 0 && (
                <p className="text-xs text-red-400 mt-1">PIN must be 6 digits.</p>
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
