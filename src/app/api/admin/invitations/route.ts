import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get('organization_id') ?? '';

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization is required.' }, { status: 400 });
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

    const { data: invites, error: inviteError } = await supabaseAdmin
      .from('organization_invitations')
      .select('id,email,role,status,created_at,expires_at')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (inviteError) {
      return applySupabaseCookies(
        NextResponse.json({ error: inviteError.message }, { status: 400 }),
        response
      );
    }

    return applySupabaseCookies(NextResponse.json({ invites: invites ?? [] }), response);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error.' }, { status: 500 });
  }
}
