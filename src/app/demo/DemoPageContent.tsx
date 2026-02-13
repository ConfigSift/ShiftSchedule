'use client';

import Link from 'next/link';
import { DemoProvider } from '../../demo/DemoProvider';
import { DemoHeader } from './DemoHeader';
import { Dashboard } from '../../components/Dashboard';
import { StatsFooter } from '../../components/StatsFooter';
import { ArrowRight } from 'lucide-react';

/**
 * Client-side shell for the /demo page.
 *
 * Wraps everything in DemoProvider so the real schedule components
 * read mock data from the overridden Zustand stores.
 */
export function DemoPageContent() {
  return (
    <DemoProvider>
      <div className="h-[100dvh] flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
        {/* Sticky demo banner — renders immediately */}
        <div className="shrink-0 bg-amber-500 text-zinc-900" data-analytics="demo_page_viewed">
          <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-medium truncate">
              You&apos;re exploring a demo of <span className="font-bold">CrewShyft</span>
            </p>
            <Link
              href="/start"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg bg-zinc-900 text-amber-400 hover:bg-zinc-800 transition-colors text-xs sm:text-sm font-semibold"
              data-analytics="demo_banner_cta"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Demo header — renders immediately */}
        <DemoHeader />

        {/* Main content — fades in with entry animation */}
        <div className="flex-1 min-h-0 bg-theme-timeline flex flex-col overflow-hidden animate-demo-enter">
          <Dashboard autoLoad={false} />
        </div>

        {/* Stats footer — part of entry animation */}
        <div className="animate-demo-enter">
          <StatsFooter />
        </div>

        {/* Demo footer CTA */}
        <div
          className="shrink-0 border-t border-zinc-800 bg-zinc-900 text-center py-4 sm:py-5 px-4"
          data-analytics="demo_footer_cta"
        >
          <p className="text-sm sm:text-base font-semibold text-zinc-100 mb-1">
            Ready to get started?
          </p>
          <p className="text-xs sm:text-sm text-zinc-400 mb-3">
            Create your account in under 2 minutes. $1 for your first month.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/start"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-sm font-semibold"
              data-analytics="demo_footer_get_started"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Back to Homepage
            </Link>
          </div>
        </div>
      </div>
    </DemoProvider>
  );
}
