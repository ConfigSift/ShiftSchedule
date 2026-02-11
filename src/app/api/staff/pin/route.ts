import { NextRequest } from 'next/server';
import { setPasscodeHandler } from '@/lib/passcode/setPasscode';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  return setPasscodeHandler(req);
}
