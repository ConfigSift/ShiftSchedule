'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Copy, Lock, Mail, Phone, Shield, Store, User } from 'lucide-react';
import { generateRestaurantCode, useRestaurantStore } from '../../store/restaurantStore';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import { supabase } from '../../lib/supabase/client';

export default function SetupClient() {
  const router = useRouter();
  const { addRestaurant, hydrate: hydrateRestaurants, isHydrated: restaurantsHydrated, getRestaurantByCode } =
    useRestaurantStore();
  const { currentUser, init, setActiveOrganization } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdRestaurantCode, setCreatedRestaurantCode] = useState<string | null>(null);

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
      const role = getUserRole(currentUser.role);
      router.push(isManagerRole(role) ? '/manager' : '/dashboard');
    }
  }, [currentUser, router]);

  useEffect(() => {
    let isMounted = true;
    supabase.rpc('has_manager').then(({ data }) => {
      if (isMounted && data) {
        router.push('/login');
      }
    });
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!restaurantName.trim()) {
      setError('Restaurant name is required');
      return;
    }

    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }

    if (!password) {
      setError('Passcode is required');
      return;
    }

    if (!/^\d{6}$/.test(password)) {
      setError('Passcode must be exactly 6 digits');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passcodes do not match');
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(formatSupabaseError(authError, 'Signup failed'));
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        setError('Setup failed. Check your email for a confirmation link.');
        return;
      }

      let restaurantCode = '';
      for (let i = 0; i < 5; i += 1) {
        const candidate = generateRestaurantCode();
        const existing = await getRestaurantByCode(candidate);
        if (!existing) {
          restaurantCode = candidate;
          break;
        }
      }

      if (!restaurantCode) {
        setError('Unable to generate a unique restaurant ID. Try again.');
        return;
      }

      const restaurant = await addRestaurant({
        name: restaurantName.trim(),
        restaurantCode,
        createdByUserId: userId,
      });

      const { error: userError } = await (supabase as any).from('users').insert({
        auth_user_id: userId,
        organization_id: restaurant.id,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        full_name: name.trim(),
        account_type: 'MANAGER',
        jobs: ['Manager'],
      });

      if (userError) {
        setError(formatSupabaseError(userError, 'Unable to create manager profile'));
        return;
      }

      await init();
      setActiveOrganization(restaurant.id, restaurant.restaurantCode);
      setCreatedRestaurantCode(restaurant.restaurantCode);
    } catch (err) {
      setError(formatSupabaseError(err, 'Setup failed'));
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

  const handleCopyCode = async () => {
    if (!createdRestaurantCode) return;
    try {
      await navigator.clipboard.writeText(createdRestaurantCode);
    } catch {
      setError('Unable to copy restaurant ID. Copy it manually.');
    }
  };

  if (createdRestaurantCode) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Calendar className="w-8 h-8 text-zinc-900" />
            </div>
            <h1 className="text-2xl font-bold text-theme-primary">Setup Complete</h1>
            <p className="text-theme-tertiary mt-1">Share this Restaurant ID with your team</p>
          </div>

          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl space-y-4">
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-xs text-amber-400 uppercase tracking-wide mb-2">Restaurant ID</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold text-amber-400">{createdRestaurantCode}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 text-xs font-semibold hover:bg-amber-400"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              type="button"
              onClick={() => router.push('/manager')}
              className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02]"
            >
              Continue to Site Manager
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">Manager Setup</h1>
          <p className="text-theme-tertiary mt-1">Create your first manager account</p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
            <Shield className="w-5 h-5 text-amber-500" />
            <p className="text-sm text-amber-500">
              This setup is available only when no managers exist.
            </p>
          </div>

          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Jamie Lee"
                  required
                />
              </div>
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
                  placeholder="manager@restaurant.com"
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
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="555-0100"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Restaurant Name
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="Skybird Kitchen"
                  required
                />
              </div>
              <p className="text-xs text-theme-muted mt-1">
                We will generate a Restaurant ID for you.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Passcode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="******"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Confirm Passcode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="******"
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
              {loading ? 'Creating manager...' : 'Create manager account'}
            </button>

            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-2 py-3 bg-theme-tertiary text-theme-secondary rounded-lg hover:bg-theme-hover transition-colors"
            >
              Back to login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
