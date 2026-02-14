import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  restaurant_code: string;
};

export async function GET(req: NextRequest) {
  try {
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

    const authEmail = String(authUser.email ?? '').trim().toLowerCase();
    if (!authEmail) {
      return NextResponse.json({ error: 'Email missing.' }, { status: 400 });
    }

    const { data: invites, error: inviteError } = await supabaseAdmin
      .from('organization_invitations')
      .select('id, organization_id, email, role, status, created_at, expires_at')
      .eq('status', 'pending')
      .eq('email', authEmail);

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const inviteRows = (invites || []) as InvitationRow[];
    const organizationIds = Array.from(new Set(inviteRows.map((row) => row.organization_id)));
    let orgMap = new Map<string, { name: string; restaurant_code: string }>();
    if (organizationIds.length > 0) {
      const { data: orgs, error: orgError } = await supabaseAdmin
        .from('organizations')
        .select('id,name,restaurant_code')
        .in('id', organizationIds);
      if (!orgError && orgs) {
        orgMap = new Map(
          (orgs as OrganizationRow[]).map((org) => [org.id, { name: org.name, restaurant_code: org.restaurant_code }])
        );
      }
    }

    const mapped = inviteRows.map((invite) => {
      const org = orgMap.get(invite.organization_id);
      return {
        id: invite.id,
        organization_id: invite.organization_id,
        organization_name: org?.name ?? '',
        restaurant_code: org?.restaurant_code ?? '',
        email: invite.email,
        role: invite.role,
        status: invite.status,
        created_at: invite.created_at,
        expires_at: invite.expires_at,
      };
    });

    return NextResponse.json({ invitations: mapped });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message ?? 'Unknown error.' }, { status: 500 });
  }
}
