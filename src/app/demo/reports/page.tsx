import type { Metadata } from 'next';
import { DemoReportsContent } from './DemoReportsContent';

export const metadata: Metadata = {
  title: 'CrewShyft Demo Reports',
  description: 'Explore CrewShyft reports with fully interactive demo data.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value?: string | string[]): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function isReportView(value?: string): value is 'roster' | 'timeline' | 'weekly' {
  return value === 'roster' || value === 'timeline' || value === 'weekly';
}

export default function DemoReportsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const viewParam = firstParam(searchParams?.view);
  const dateParam = firstParam(searchParams?.date);
  const startParam = firstParam(searchParams?.start);
  const initialView = isReportView(viewParam) ? viewParam : undefined;
  const initialDate = startParam ?? dateParam;

  return <DemoReportsContent initialView={initialView} initialDate={initialDate} />;
}
