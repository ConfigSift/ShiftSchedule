'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { Calendar, Lock, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getAuthCallbackUrl } from '@/lib/site-url';

function getSignupRedirectUrl() {
  const next = encodeURIComponent('/login?notice=email-verified');
  return `${getAuthCallbackUrl()}?next=${next}`;
}

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendMessage, setResendMessage] = useState('');

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const passwordValid = password.length >= 6;
  const canSubmit = emailValid && passwordValid && !submitting;
  const emailRedirectTo = useMemo(() => getSignupRedirectUrl(), []);

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setResendError('');
    setResendMessage('');
    setSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (signUpError) {
        setError(signUpError.message || 'Unable to create account right now.');
        return;
      }

      if (data.session) {
        await supabase.auth.signOut();
      }

      setSubmittedEmail(normalizedEmail);
      setSubmitted(true);
    } catch {
      setError('Unable to create account right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendConfirmation = async (targetEmail: string) => {
    setResendError('');
    setResendMessage('');
    setResending(true);
    try {
      const { error: resendErrorResult } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail.trim().toLowerCase(),
        options: {
          emailRedirectTo,
        },
      });
      if (resendErrorResult) {
        setResendError(resendErrorResult.message || 'Unable to resend confirmation email.');
        return;
      }
      setResendMessage('Confirmation email sent. Check your inbox and spam folder.');
    } catch {
      setResendError('Unable to resend confirmation email.');
    } finally {
      setResending(false);
    }
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

      <div className="relative w-full max-w-md animate-auth-enter">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-theme-primary">Create your account</h1>
          <p className="text-theme-tertiary mt-1">Sign up with email and password</p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          {!submitted ? (
            <>
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
                      className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      placeholder="you@restaurant.com"
                      autoFocus
                      required
                    />
                  </div>
                  {!emailValid && email.length > 0 && (
                    <p className="text-xs text-red-400 mt-1">Enter a valid email.</p>
                  )}
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
                      className="w-full pl-10 pr-4 py-3 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      placeholder="At least 6 characters"
                      required
                    />
                  </div>
                  {!passwordValid && password.length > 0 && (
                    <p className="text-xs text-red-400 mt-1">Password must be at least 6 characters.</p>
                  )}
                </div>

                {error && <p className="text-sm text-red-400 text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-3 bg-amber-500 text-zinc-900 font-semibold rounded-lg hover:bg-amber-400 transition-all hover:scale-[1.02] disabled:opacity-50"
                >
                  {submitting ? 'Creating account...' : 'Create account'}
                </button>
              </form>
              <p className="text-xs text-theme-muted text-center mt-4">
                Already have an account?{' '}
                <Link href="/login" className="text-amber-400 hover:text-amber-300">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <p className="text-sm font-semibold text-amber-400">Check your email to confirm your account</p>
                <p className="text-xs text-amber-300/90 mt-2">
                  We sent a confirmation link to <span className="font-semibold">{submittedEmail}</span>.
                  Please verify your email before signing in.
                </p>
              </div>

              {resendError && <p className="text-xs text-red-400">{resendError}</p>}
              {resendMessage && <p className="text-xs text-emerald-400">{resendMessage}</p>}

              <button
                type="button"
                onClick={() => handleResendConfirmation(submittedEmail)}
                disabled={resending}
                className="w-full py-2.5 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors disabled:opacity-50"
              >
                {resending ? 'Sending...' : 'Resend confirmation email'}
              </button>

              <Link
                href="/login"
                className="block w-full text-center py-2.5 rounded-lg border border-theme-primary text-theme-secondary hover:bg-theme-hover transition-colors"
              >
                Back to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
