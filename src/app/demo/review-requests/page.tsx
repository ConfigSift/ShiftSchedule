import type { Metadata } from 'next';
import { DemoRequestsContent } from './DemoRequestsContent';

export const metadata: Metadata = {
  title: 'CrewShyft Demo Requests',
  description: 'Review and submit demo time-off requests in CrewShyft.',
};

export default function DemoReviewRequestsPage() {
  return <DemoRequestsContent />;
}
