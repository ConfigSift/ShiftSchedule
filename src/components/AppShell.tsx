'use client';

import { Header } from './Header';
import { StatsFooter } from './StatsFooter';

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary transition-theme">
      <Header />
      <div className="h-screen pt-16 pb-14">
        <div className="h-full overflow-y-auto">{children}</div>
      </div>
      <StatsFooter />
    </div>
  );
}
