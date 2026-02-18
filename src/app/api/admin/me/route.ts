import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);

  if (!result.ok) {
    const requestId = crypto.randomUUID();
    const status = result.error.status || 403;
    const error = status === 401 ? 'Not signed in.' : 'Forbidden - not a platform admin.';
    const response = NextResponse.json({ error, requestId }, { status });
    result.error.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  }

  const { ctx, response } = result;
  return applySupabaseCookies(
    NextResponse.json({
      ok: true,
      authUserId: ctx.authUserId,
      email: ctx.email,
    }),
    response,
  );
}

