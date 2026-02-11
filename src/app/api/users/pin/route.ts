import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const payload = {
  error: 'Endpoint moved.',
  hint: 'Use /api/admin/set-passcode with JSON body {"userId":"...","organizationId":"...","pinCode":"123456"}',
};

export function GET() {
  return NextResponse.json(payload, { status: 410 });
}

export function POST() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
}
