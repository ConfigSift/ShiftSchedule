import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const invitationId = body?.invitationId;

    if (!invitationId || typeof invitationId !== 'string') {
      return NextResponse.json({ error: 'invitationId is required.' }, { status: 400 });
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

    // Fetch the invitation to get the organization_id
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('organization_invitations')
      .select('id, organization_id, status')
      .eq('id', invitationId)
      .maybeSingle();

    if (inviteError) {
      return applySupabaseCookies(
        NextResponse.json({ error: inviteError.message }, { status: 400 }),
        response
      );
    }

    if (!invitation) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Invitation not found.' }, { status: 400 }),
        response
      );
    }

    if (invitation.status !== 'pending') {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Invitation is not pending.' }, { status: 400 }),
        response
      );
    }

    // Check if requester is admin/manager for this organization
    const { data: requesterMembership, error: requesterMembershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('auth_user_id', requesterAuthId)
      .eq('organization_id', invitation.organization_id)
      .maybeSingle();

    if (requesterMembershipError || !requesterMembership) {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    const requesterRole = String(requesterMembership.role ?? '').trim().toLowerCase();
    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    // Revoke the invitation
    const { error: updateError } = await supabaseAdmin
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId)
      .eq('status', 'pending');

    if (updateError) {
      return applySupabaseCookies(
        NextResponse.json({ error: updateError.message }, { status: 400 }),
        response
      );
    }

    return applySupabaseCookies(NextResponse.json({ ok: true }), response);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message ?? 'Unknown error.' }, { status: 500 });
  }
}
