import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isManagerRole } from '@/utils/role';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DeletePayload = {
  userId: string;
  organizationId: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as DeletePayload;

  if (!payload.userId || !payload.organizationId) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;

  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    return applySupabaseCookies(NextResponse.json({ error: message }, { status: 401 }), response);
  }

  const { data: requesterMembership, error: requesterMembershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (requesterMembershipError || !requesterMembership) {
    return applySupabaseCookies(
      NextResponse.json({ error: "You don't have permission for that action." }, { status: 403 }),
      response
    );
  }

  const requesterRole = String(requesterMembership.role ?? '').trim().toUpperCase();
  if (!isManagerRole(requesterRole)) {
    return applySupabaseCookies(
      NextResponse.json({ error: "You don't have permission for that action." }, { status: 403 }),
      response
    );
  }

  const { data: targetRow, error: targetError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', payload.userId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (targetError || !targetRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
      response
    );
  }

  const target = normalizeUserRow(targetRow);

  if (target.authUserId === authUserId) {
    return applySupabaseCookies(
      NextResponse.json({ error: "You can't delete your own account." }, { status: 403 }),
      response
    );
  }

  const targetRole = target.role;
  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: "You don't have permission for that action." }, { status: 403 }),
      response
    );
  }

  try {
    const { error: membershipDeleteError } = await supabaseAdmin
      .from('organization_memberships')
      .delete()
      .eq('organization_id', payload.organizationId)
      .eq('auth_user_id', target.authUserId ?? '');

    if (membershipDeleteError) {
      return applySupabaseCookies(
        NextResponse.json({ error: membershipDeleteError.message }, { status: 400 }),
        response
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('organization_id', payload.organizationId)
      .eq('auth_user_id', target.authUserId ?? '');

    if (deleteError) {
      return applySupabaseCookies(
        NextResponse.json({ error: deleteError.message }, { status: 400 }),
        response
      );
    }

    const inviteEmail = String(target.realEmail ?? target.email ?? '').trim().toLowerCase();
    if (inviteEmail) {
      await supabaseAdmin
        .from('organization_invitations')
        .delete()
        .eq('organization_id', payload.organizationId)
        .eq('email', inviteEmail)
        .eq('status', 'pending');
    }
  } catch {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Unable to delete user. Check for related shifts or constraints.' },
        { status: 400 }
      ),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ ok: true }), response);
}
