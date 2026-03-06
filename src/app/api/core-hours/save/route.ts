import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Core hours have been removed from the app. This endpoint is no longer used.
export async function POST() {
  return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
}
