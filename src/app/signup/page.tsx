'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Lock, Mail, Phone, Store, UserPlus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useRestaurantStore } from '../../store/restaurantStore';
import { supabase } from '../../lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const { hydrate: hydrateRestaurants, isHydrated: restaurantsHydrated, getRestaurantByCode } = useRestaurantStore();
  const { currentUser, init } = useAuthStore();

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatSupabaseError = (err: unknown, fallback: string) => {
    if (!err) return fallback;
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err && 'message' in err) {
      const message = String((err as { message?: string }).message ?? fallback);
      const status = (err as { status?: number }).status;
      return status ? `${message} (status ${status})` : message;
    }
    return fallback;
  };

  useEffect(() => {
    hydrateRestaurants();
  }, [hydrateRestaurants]);

  useEffect(() => {
    if (currentUser) {
      router.push(currentUser.role === 'STAFF' ? '/dashboard' : '/manager');
    }
  }, [currentUser, router]);

  useEffect(() => {
    let isMounted = true;
    supabase.rpc('has_manager').then(({ data }) => {
      if (isMounted && !data) {
        router.push('/setup');
      }
    });
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Email is required');
      return;
    }

    if (!restaurantId.trim()) {
      setError('Restaurant ID is required');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    const normalizedRestaurantId = restaurantId.trim().toUpperCase();
    const restaurant = await getRestaurantByCode(normalizedRestaurantId);
    if (!restaurant) {
      setError('Restaurant ID not found. Ask your manager for the correct code.');
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        setError(formatSupabaseError(authError, 'Signup failed'));
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        setError('Signup failed. Check your email for a confirmation link.');
        return;
      }

      const displayName = normalizedEmail.split('@')[0] || normalizedPhone || 'Team Member';

      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        email: normalizedEmail,
        phone: normalizedPhone || null,
        full_name: displayName,
        role: 'STAFF',
      });

      if (profileError) {
        setError(profileError.message);
        return;
      }

      const { error: membershipError } = await supabase.from('restaurant_memberships').insert({
        user_id: userId,
        restaurant_id: restaurant.id,
        role: 'STAFF',
      });

      if (membershipError) {
        setError(membershipError.message);
        return;
      }

      await init();
      router.push('/dashboard');
    } catch (err) {
      setError(formatSupabaseError(err, 'Signup failed'));
    } finally {
      setLoading(false);
    }
  };

  if (!restaurantsHydrated) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">Create Account</h1>
          <p className="text-theme-tertiary mt-1">Join your restaurant team</p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSignup} className="space-y-4">
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
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="you@restaurant.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="555-0100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Restaurant ID
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={restaurantId}
                  onChange={(e) => setRestaurantId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="e.g. RST-K7M2Q9PJ"
                  required
                />
              </div>
              <p className="text-xs text-theme-muted mt-1">
                Ask your manager for the Restaurant ID.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="******"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="******"
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-500 text-zinc-900 font-semibold rounded-lg hover:bg-emerald-400 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>

            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-2 py-3 bg-theme-tertiary text-theme-secondary rounded-lg hover:bg-theme-hover transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Back to login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
