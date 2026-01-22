import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { supabase, response } = createSupabaseRouteClient(request);
    const cookiePresent = request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return applySupabaseCookies(
        NextResponse.json(
          {
            hasSession: false,
            authUserId: null,
            email: null,
            organizationId: null,
            role: null,
            userRowFound: false,
            cookiePresent,
            error: process.env.NODE_ENV === 'production' ? undefined : error.message,
          },
          { status: 200 }
        ),
        response
      );
    }
    const user = data.user;
    let organizationId: string | null = null;
    let role: string | null = null;
    let userRowFound = false;
    if (user?.id) {
      const { data: row, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!userError && row) {
        const normalized = normalizeUserRow(row);
        organizationId = normalized.organizationId ?? null;
        role = normalized.role ?? null;
        userRowFound = true;
      }
    }
    return applySupabaseCookies(
      NextResponse.json({
        hasSession: Boolean(user),
        authUserId: user?.id ?? null,
        email: user?.email ?? null,
        organizationId,
        role,
        userRowFound,
        cookiePresent,
      }),
      response
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to read session.';
    const cookiePresent = request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));
    return NextResponse.json(
      {
        hasSession: false,
        authUserId: null,
        email: null,
        organizationId: null,
        role: null,
        userRowFound: false,
        cookiePresent,
        error: process.env.NODE_ENV === 'production' ? undefined : message,
      },
      { status: 200 }
    );
  }
}
