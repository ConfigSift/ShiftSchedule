import type { Metadata } from 'next';
import { DemoPageContent } from './DemoPageContent';

export const metadata: Metadata = {
  title: 'CrewShyft Demo — Interactive Schedule Preview',
  description:
    'Explore the CrewShyft scheduling interface with real mock data. No signup required.',
};

export default function DemoPage() {
  return <DemoPageContent />;
}
