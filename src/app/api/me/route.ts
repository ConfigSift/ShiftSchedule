import { NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/route';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return NextResponse.json(
        {
          hasSession: false,
          authUserId: null,
          email: null,
          organizationId: null,
          role: null,
          userRowFound: false,
          error: process.env.NODE_ENV === 'production' ? undefined : error.message,
        },
        { status: 200 }
      );
    }
    const session = data.session;
    let organizationId: string | null = null;
    let role: string | null = null;
    let userRowFound = false;
    if (session?.user?.id) {
      const { data: row, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (!userError && row) {
        const normalized = normalizeUserRow(row);
        organizationId = normalized.organizationId ?? null;
        role = normalized.role ?? null;
        userRowFound = true;
      }
    }
    return NextResponse.json({
      hasSession: Boolean(session),
      authUserId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      organizationId,
      role,
      userRowFound,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to read session.';
    return NextResponse.json(
      {
        hasSession: false,
        authUserId: null,
        email: null,
        organizationId: null,
        role: null,
        userRowFound: false,
        error: process.env.NODE_ENV === 'production' ? undefined : message,
      },
      { status: 200 }
    );
  }
}
