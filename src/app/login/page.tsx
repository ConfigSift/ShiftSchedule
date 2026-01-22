'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { hashPin } from '../../utils/timeUtils';
import { Calendar, Lock, User, Shield } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSetup = searchParams.get('setup') === 'true';
  
  const { employees, addEmployee, hydrate, isHydrated } = useScheduleStore();
  const { login, currentUser } = useAuthStore();
  
  const [mode, setMode] = useState<'login' | 'setup'>(isSetup ? 'setup' : 'login');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Setup form
  const [setupName, setSetupName] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirmPin, setSetupConfirmPin] = useState('');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated && employees.length === 0) {
      setMode('setup');
    }
  }, [isHydrated, employees]);

  useEffect(() => {
    if (currentUser) {
      router.push('/dashboard');
    }
  }, [currentUser, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(employees, pin);
      if (user) {
        router.push('/dashboard');
      } else {
        setError('Invalid PIN');
        setPin('');
      }
    } catch {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!setupName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (setupPin.length !== 4) {
      setError('PIN must be 4 digits');
      return;
    }

    if (setupPin !== setupConfirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);

    try {
      const pinHash = await hashPin(setupPin);
      
      addEmployee({
        name: setupName.trim(),
        section: 'management',
        userRole: 'manager',
        pinHash,
        isActive: true,
        profile: {},
      });

      // Now login with the new PIN
      setTimeout(async () => {
        const { employees: updatedEmployees } = useScheduleStore.getState();
        const user = await login(updatedEmployees, setupPin);
        if (user) {
          router.push('/dashboard');
        }
      }, 100);
    } catch {
      setError('Setup failed');
      setLoading(false);
    }
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">ShiftFlow</h1>
          <p className="text-theme-tertiary mt-1">
            {mode === 'setup' ? 'Create your manager account' : 'Sign in to continue'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          {mode === 'setup' ? (
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
                <Shield className="w-5 h-5 text-amber-500" />
                <p className="text-sm text-amber-500">
                  You're creating the first manager account
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  Your Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                  <input
                    type="text"
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="John Smith"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  Create PIN (4 digits)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                  <input
                    type="password"
                    value={setupPin}
                    onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-center text-2xl tracking-[0.5em]"
                    placeholder="••••"
                    maxLength={4}
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
                    value={setupConfirmPin}
                    onChange={(e) => setSetupConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-center text-2xl tracking-[0.5em]"
                    placeholder="••••"
                    maxLength={4}
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
                className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  Enter Your PIN
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full pl-10 pr-4 py-4 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-center text-3xl tracking-[0.5em]"
                    placeholder="••••"
                    maxLength={4}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || pin.length !== 4}
                className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {employees.length > 0 && (
                <div className="pt-4 border-t border-theme-primary">
                  <p className="text-xs text-theme-muted text-center">
                    {employees.filter(e => e.isActive).length} team members registered
                  </p>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
