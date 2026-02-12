import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-theme-secondary border border-theme-primary rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-bold text-theme-primary mb-2">Verification link invalid or expired</h1>
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
  );
}
