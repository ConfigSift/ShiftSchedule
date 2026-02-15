'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { DemoProvider } from '../../demo/DemoProvider';
import { DemoHeader } from './DemoHeader';
import { Dashboard } from '../../components/Dashboard';
import { StatsFooter } from '../../components/StatsFooter';
import { ArrowRight } from 'lucide-react';
import { getAppBase, getIsLocalhost } from '@/lib/routing/getBaseUrls';

export function DemoPageContent() {
  const handleGetStartedClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (getIsLocalhost(window.location.host)) return;
    event.preventDefault();
    window.location.assign(`${getAppBase(window.location.origin)}/start`);
  }, []);

  return (
    <DemoProvider>
      <div className="h-[100dvh] flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
        <div className="shrink-0 bg-amber-500 text-zinc-900" data-analytics="demo_page_viewed">
          <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-medium truncate">
              You&apos;re exploring a demo of <span className="font-bold">CrewShyft</span>
            </p>
            <Link
              href="/start"
              onClick={handleGetStartedClick}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg bg-zinc-900 text-amber-400 hover:bg-zinc-800 transition-colors text-xs sm:text-sm font-semibold"
              data-analytics="demo_banner_cta"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <DemoHeader />

        <div className="flex-1 min-h-0 bg-theme-timeline flex flex-col overflow-hidden animate-demo-enter">
          <Dashboard autoLoad={false} />
        </div>

        <div className="animate-demo-enter">
          <StatsFooter compact />
        </div>
      </div>
    </DemoProvider>
  );
}
