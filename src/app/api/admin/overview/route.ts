import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import { fetchOverviewData } from '@/lib/admin/queries/overview';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;

  try {
    const data = await fetchOverviewData();
    const requestId = crypto.randomUUID();

    return applySupabaseCookies(
      NextResponse.json({ requestId, ...data }),
      response,
    );
  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error('[admin/overview]', requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load overview data.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}
