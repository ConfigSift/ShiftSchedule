'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DemoProvider } from '../../../demo/DemoProvider';
import { DemoHeader } from '../DemoHeader';
import { ReportsPageContent } from '../../../components/reports/ReportsPageContent';

type DemoReportsContentProps = {
  initialView?: 'roster' | 'timeline' | 'weekly';
  initialDate?: string;
};

export function DemoReportsContent({ initialView, initialDate }: DemoReportsContentProps) {
  return (
    <DemoProvider>
      <div className="h-[100dvh] flex flex-col bg-theme-primary text-theme-primary overflow-hidden transition-theme">
        <div className="shrink-0 bg-amber-500 text-zinc-900" data-analytics="demo_reports_viewed">
          <div className="px-3 sm:px-4 lg:px-6 py-2 flex items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-medium truncate">
              You are exploring demo reports for <span className="font-bold">CrewShyft</span>
            </p>
            <Link
              href="/start"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg bg-zinc-900 text-amber-400 hover:bg-zinc-800 transition-colors text-xs sm:text-sm font-semibold"
              data-analytics="demo_reports_banner_cta"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <DemoHeader />

        <main className="flex-1 min-h-0 overflow-auto bg-theme-timeline p-3 sm:p-4 lg:p-6">
          <ReportsPageContent initialView={initialView} initialDate={initialDate} />
        </main>
      </div>
    </DemoProvider>
  );
}
