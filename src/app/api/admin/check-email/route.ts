import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function findAuthUserIdByEmail(normalizedEmail: string): Promise<string | null> {
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('users')
    .select('auth_user_id, real_email')
    .eq('real_email', normalizedEmail)
    .maybeSingle();
  if (!userErr && userRow?.auth_user_id) {
    return userRow.auth_user_id;
  }

  const adminAuth: any = supabaseAdmin.auth.admin;
  if (typeof adminAuth.listUsers !== 'function') {
    return null;
  }

  const perPage = 200;
  let page = 1;
  while (true) {
    const { data: listData, error: listErr } = await adminAuth.listUsers({ page, perPage });
    if (listErr) {
      return null;
    }
    const users = listData?.users ?? [];
    const match = users.find(
      (user: any) => String(user.email ?? '').toLowerCase() === normalizedEmail
    );
    if (match?.id) {
      return match.id;
    }
    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawEmail = String(searchParams.get('email') ?? '').trim().toLowerCase();
    const organizationId = String(searchParams.get('organization_id') ?? '').trim();

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization is required.' }, { status: 400 });
    }
    if (!rawEmail) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const { supabase, response } = createSupabaseRouteClient(req);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const requesterAuthId = authData.user?.id;
    if (!requesterAuthId) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : authError?.message || 'Unauthorized.';
      return applySupabaseCookies(jsonError(message, 401), response);
    }

    const { data: requesterMembership, error: requesterMembershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('auth_user_id', requesterAuthId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (requesterMembershipError || !requesterMembership) {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    const requesterRole = String(requesterMembership.role ?? '').trim().toLowerCase();
    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    const authUserId = await findAuthUserIdByEmail(rawEmail);
    return applySupabaseCookies(
      NextResponse.json({ exists: Boolean(authUserId) }),
      response
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error.' }, { status: 500 });
  }
}
