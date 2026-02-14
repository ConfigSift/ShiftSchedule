import { ReactNode, Suspense } from 'react';
import { Header } from '@/components/Header';

export function OnboardingBackground({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-theme-primary relative overflow-hidden flex items-center justify-center p-4 pt-20 sm:p-6 sm:pt-24">
      <Suspense fallback={null}>
        <Header onboardingMode />
      </Suspense>

      {/* Light mode atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{
          background:
            'radial-gradient(ellipse at 50% 12%, rgba(245,158,11,0.14) 0%, rgba(245,158,11,0.04) 30%, transparent 65%), linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 dark:hidden opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(rgba(24,24,27,0.06) 0.75px, transparent 0.75px), linear-gradient(rgba(24,24,27,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(24,24,27,0.03) 1px, transparent 1px)',
          backgroundSize: '16px 16px, 56px 56px, 56px 56px',
          backgroundPosition: '0 0, 0 0, 0 0',
        }}
      />

      {/* Dark mode atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            'radial-gradient(ellipse at 50% 8%, rgba(245,158,11,0.16) 0%, rgba(245,158,11,0.06) 28%, transparent 65%), linear-gradient(180deg, #09090b 0%, #0a0a0b 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(rgba(250,250,250,0.08) 0.7px, transparent 0.7px), linear-gradient(rgba(250,250,250,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(250,250,250,0.028) 1px, transparent 1px)',
          backgroundSize: '16px 16px, 56px 56px, 56px 56px',
          backgroundPosition: '0 0, 0 0, 0 0',
        }}
      />

      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
