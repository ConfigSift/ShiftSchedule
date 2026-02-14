import Link from 'next/link';
import { Calendar } from 'lucide-react';

export default function AuthErrorPage() {
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
          <h1 className="text-2xl font-bold text-theme-primary">CrewShyft</h1>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-theme-primary mb-2">Verification link invalid or expired</h2>
          <p className="text-sm text-theme-tertiary mb-6">
            Request a new confirmation email and try again.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/login?notice=verification-failed"
              className="w-full py-2.5 rounded-lg bg-amber-500 text-zinc-900 text-center font-semibold hover:bg-amber-400 transition-colors"
            >
              Go to login
            </Link>
            <Link
              href="/signup"
              className="w-full py-2.5 rounded-lg border border-theme-primary text-theme-secondary text-center hover:bg-theme-hover transition-colors"
            >
              Back to signup
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
