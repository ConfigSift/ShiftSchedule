import { Suspense } from 'react';
import RecoveryClient from './RecoveryClient';
import RecoverySkeleton from './RecoverySkeleton';

export const dynamic = 'force-dynamic';

export default function RecoveryPage() {
  return (
    // Next requires a Suspense boundary around client hooks like useSearchParams on route pages.
    <Suspense fallback={<RecoverySkeleton />}>
      <RecoveryClient />
    </Suspense>
  );
}
