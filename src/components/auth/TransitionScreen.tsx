import { Calendar, Loader2 } from 'lucide-react';

type TransitionScreenProps = {
  message?: string;
  subtext?: string;
};

export function TransitionScreen({ message = 'Loading...', subtext }: TransitionScreenProps) {
  return (
    <div className="min-h-screen bg-theme-primary relative flex items-center justify-center p-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative flex flex-col items-center text-center">
        <div className="animate-auth-pulse mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
            <Calendar className="w-8 h-8 text-zinc-900" />
          </div>
        </div>

        <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-4" />

        <p className="text-base font-semibold text-theme-primary">{message}</p>
        {subtext && (
          <p className="text-sm text-theme-tertiary mt-1">{subtext}</p>
        )}
      </div>
    </div>
  );
}
