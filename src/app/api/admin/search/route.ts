import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import { globalSearch } from '@/lib/admin/queries/search';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return applySupabaseCookies(
      NextResponse.json({ results: [] }),
      response,
    );
  }

  try {
    const results = await globalSearch(q);

    return applySupabaseCookies(
      NextResponse.json({ results }),
      response,
    );
  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error('[admin/search]', requestId, `q="${q}"`, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Search failed.', requestId, results: [] },
        { status: 500 },
      ),
      response,
    );
  }
}
