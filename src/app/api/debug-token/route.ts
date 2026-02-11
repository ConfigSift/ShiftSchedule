import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { supabase, response } = createSupabaseRouteClient(req);
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token ?? null;

  if (!accessToken) {
    const message = error?.message ?? 'Not signed in.';
    return applySupabaseCookies(NextResponse.json({ error: message }, { status: 401 }), response);
  }

  return applySupabaseCookies(NextResponse.json({ access_token: accessToken }), response);
}
