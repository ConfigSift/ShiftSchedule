import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAdminAuthApi } from '@/lib/supabase/adminAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function findAuthUserIdByEmail(normalizedEmail: string): Promise<string | null> {
  const adminAuth = getAdminAuthApi();
  if (typeof adminAuth.getUserByEmail === 'function') {
    const { data, error } = await adminAuth.getUserByEmail(normalizedEmail);
    if (!error && data?.user?.id) return data.user.id;
  }

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
    const match = users.find((user) => String(user.email ?? '').toLowerCase() === normalizedEmail);
    if (match?.id) return match.id;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = String(searchParams.get('organizationId') ?? searchParams.get('organization_id') ?? '').trim();
    const email = String(searchParams.get('email') ?? '').trim().toLowerCase();

    if (!organizationId || !email) {
      return NextResponse.json({ error: 'organizationId and email are required.' }, { status: 400 });
    }
    if (!isUuid(organizationId)) {
      return NextResponse.json({ error: 'Invalid organizationId.', code: 'INVALID_UUID' }, { status: 422 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
    }

    const { supabase, response } = createSupabaseRouteClient(req);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const requesterAuthId = authData.user?.id;
    if (!requesterAuthId) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : authError?.message || 'Unauthorized.';
      return applySupabaseCookies(NextResponse.json({ error: message }, { status: 401 }), response);
    }

    const { data: requesterMembership, error: requesterMembershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('auth_user_id', requesterAuthId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (requesterMembershipError || !requesterMembership) {
      return applySupabaseCookies(NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 }), response);
    }

    const requesterRole = String(requesterMembership.role ?? '').trim().toLowerCase();
    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      return applySupabaseCookies(NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 }), response);
    }

    const existingAuthUserId = await findAuthUserIdByEmail(email);
    let membershipOrgIds: string[] = [];
    let hasMembershipInThisOrg = false;
    let hasMembershipInOtherOrg = false;

    if (existingAuthUserId) {
      const { data: membershipRows, error: membershipRowsError } = await supabaseAdmin
        .from('organization_memberships')
        .select('organization_id')
        .eq('auth_user_id', existingAuthUserId);
      if (membershipRowsError) {
        return applySupabaseCookies(
          NextResponse.json({ error: membershipRowsError.message }, { status: 400 }),
          response
        );
      }
      membershipOrgIds = (membershipRows ?? []).map((row: { organization_id?: string }) => String(row.organization_id ?? ''));
      hasMembershipInThisOrg = membershipOrgIds.includes(organizationId);
      hasMembershipInOtherOrg = membershipOrgIds.some((id) => id !== organizationId);
    }

    const { data: existingEmailRows, error: existingEmailError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`real_email.eq.${email},email.eq.${email}`)
      .limit(1);

    if (existingEmailError) {
      return applySupabaseCookies(NextResponse.json({ error: existingEmailError.message }, { status: 400 }), response);
    }

    const { data: pendingInviteRows, error: pendingInviteError } = await supabaseAdmin
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .eq('status', 'pending')
      .limit(1);

    if (pendingInviteError) {
      return applySupabaseCookies(NextResponse.json({ error: pendingInviteError.message }, { status: 400 }), response);
    }

    const alreadyMember = hasMembershipInThisOrg;

    return applySupabaseCookies(
      NextResponse.json({
        email,
        authExists: Boolean(existingAuthUserId),
        authUserId: existingAuthUserId,
        hasMembershipInThisOrg,
        hasMembershipInOtherOrg,
        membershipOrgIds,
        existsInAuth: Boolean(existingAuthUserId),
        existsInOrg: (existingEmailRows ?? []).length > 0,
        hasPendingInvite: (pendingInviteRows ?? []).length > 0,
        alreadyMember: alreadyMember || (existingEmailRows ?? []).length > 0,
      }),
      response
    );
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message || 'Unknown error.' }, { status: 500 });
  }
}
