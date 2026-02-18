import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import { getAdminSupabase } from '@/lib/admin/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;
  const requestId = crypto.randomUUID();

  try {
    const db = getAdminSupabase();
    const { data, error } = await db
      .from('organizations')
      .select('id, name, restaurant_code, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message || 'Unable to load organizations.');
    }

    return applySupabaseCookies(
      NextResponse.json({
        requestId,
        data: data ?? [],
      }),
      response,
    );
  } catch (err) {
    console.error('[admin/debug/organizations]', requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load organizations debug data.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}
