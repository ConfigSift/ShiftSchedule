import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { splitFullName } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RespondPayload = {
  invitationId: string;
  action: 'accept' | 'decline';
};

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as RespondPayload;
    const invitationId = String(payload.invitationId ?? '').trim();
    const action = payload.action;

    if (!invitationId || (action !== 'accept' && action !== 'decline')) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const { supabase } = createSupabaseRouteClient(req);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (!authUser) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in.'
          : authError?.message || 'Unauthorized.';
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const authUserId = authUser.id;
    const authEmail = String(authUser.email ?? '').trim().toLowerCase();
    if (!authEmail) {
      return NextResponse.json({ error: 'Email missing.' }, { status: 400 });
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('organization_invitations')
      .select('id, organization_id, email, role, status')
      .eq('id', invitationId)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    }

    const inviteEmail = String(invite.email ?? '').trim().toLowerCase();
    if (inviteEmail !== authEmail) {
      return NextResponse.json({ error: 'Not authorized for this invitation.' }, { status: 403 });
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation is no longer pending.' }, { status: 400 });
    }

    if (action === 'decline') {
      const { error: declineError } = await supabaseAdmin
        .from('organization_invitations')
        .update({ status: 'declined' })
        .eq('id', invitationId);
      if (declineError) {
        return NextResponse.json({ error: declineError.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, status: 'declined' });
    }

    const membershipRole = String(invite.role ?? 'employee').trim().toLowerCase() || 'employee';
    const { error: membershipError } = await supabaseAdmin
      .from('organization_memberships')
      .upsert(
        {
          organization_id: invite.organization_id,
          auth_user_id: authUserId,
          role: membershipRole,
        },
        { onConflict: 'organization_id,auth_user_id' }
      );
    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('organization_id', invite.organization_id)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (existingProfileError) {
      return NextResponse.json({ error: existingProfileError.message }, { status: 400 });
    }

    if (!existingProfile) {
      const userMetadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
      const fullNameRaw = String(userMetadata.full_name ?? userMetadata.name ?? '').trim();
      const firstNameRaw = String(userMetadata.first_name ?? '').trim();
      const lastNameRaw = String(userMetadata.last_name ?? '').trim();
      const fullName =
        fullNameRaw
        || [firstNameRaw, lastNameRaw].filter(Boolean).join(' ')
        || authEmail;
      const phone = String(authUser.phone ?? userMetadata.phone ?? '').trim();

      // NOTE: per-org profile; do not copy employee_number/pay across restaurants
      const insertPayload: Record<string, unknown> = {
        auth_user_id: authUserId,
        organization_id: invite.organization_id,
        full_name: fullName,
        email: authEmail,
        real_email: authEmail,
        role: membershipRole,
      };
      if (phone) {
        insertPayload.phone = phone;
      }

      const insertResult = await supabaseAdmin.from('users').insert(insertPayload);
      if (insertResult.error) {
        const message = insertResult.error.message?.toLowerCase() ?? '';
        if (
          message.includes('full_name')
          || message.includes('first_name')
          || message.includes('last_name')
        ) {
          const { firstName, lastName } = splitFullName(fullName);
          const legacyPayload: Record<string, unknown> = {
            auth_user_id: authUserId,
            organization_id: invite.organization_id,
            first_name: firstName,
            last_name: lastName,
            email: authEmail,
            real_email: authEmail,
            role: membershipRole,
          };
          if (phone) {
            legacyPayload.phone = phone;
          }
          const legacyResult = await supabaseAdmin.from('users').insert(legacyPayload);
          if (legacyResult.error) {
            return NextResponse.json({ error: legacyResult.error.message }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: insertResult.error.message }, { status: 400 });
        }
      }
    }

    const { error: acceptError } = await supabaseAdmin
      .from('organization_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitationId);
    if (acceptError) {
      return NextResponse.json({ error: acceptError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, status: 'accepted' });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message ?? 'Unknown error.' }, { status: 500 });
  }
}
