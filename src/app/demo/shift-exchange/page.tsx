import type { Metadata } from 'next';
import { DemoShiftExchangeContent } from './DemoShiftExchangeContent';

export const metadata: Metadata = {
  title: 'CrewShyft Demo Shift Exchange',
  description: 'Offer and claim demo shifts in CrewShyft.',
};

export default function DemoShiftExchangePage() {
  return <DemoShiftExchangeContent />;
}
