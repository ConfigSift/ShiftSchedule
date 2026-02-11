import { NextRequest } from 'next/server';
import { handleWhoami } from '@/lib/debug/whoami';

// DEV ONLY: auth/membership inspection for debugging. Do not enable in prod.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return handleWhoami(req);
}
