import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  return NextResponse.json(
    { error: 'PIN login is handled via Supabase Auth password. This endpoint is deprecated.' },
    { status: 410 }
  );
}
