import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole } from '@/utils/role';

export async function POST(req: Request) {
  try {
    const { email, authUserId, passcode, organizationId } = await req.json();

    if ((!email && !authUserId) || !passcode || !organizationId) {
      return NextResponse.json(
        { error: 'email or auth_user_id, passcode, and organizationId are required.' },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(passcode)) {
      return NextResponse.json({ error: 'Passcode must be exactly 6 digits.' }, { status: 400 });
    }

    const supabaseServer = await createSupabaseServerClient();
    const { data: sessionData } = await supabaseServer.auth.getSession();
    const requesterAuthId = sessionData.session?.user?.id;
    if (!requesterAuthId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: requester, error: requesterError } = await supabaseServer
      .from('users')
      .select('id,organization_id,account_type,role')
      .eq('auth_user_id', requesterAuthId)
      .maybeSingle();

    if (requesterError || !requester) {
      return NextResponse.json({ error: 'Requester profile not found.' }, { status: 403 });
    }

    const requesterRole = getUserRole(requester.account_type ?? requester.role);
    if (requesterRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can reset passcodes.' }, { status: 403 });
    }

    if (requester.organization_id !== organizationId) {
      return NextResponse.json({ error: 'Organization mismatch.' }, { status: 403 });
    }

    let resolvedAuthId = authUserId as string | undefined;
    if (!resolvedAuthId && email) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

      const user = list.users.find(
        (u) => (u.email || '').toLowerCase() === String(email).toLowerCase()
      );
      if (!user) return NextResponse.json({ error: 'Auth user not found.' }, { status: 404 });
      resolvedAuthId = user.id;
    }

    if (!resolvedAuthId) {
      return NextResponse.json({ error: 'Auth user not found.' }, { status: 404 });
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id,organization_id')
      .eq('auth_user_id', resolvedAuthId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
    }

    if (targetUser.organization_id !== organizationId) {
      return NextResponse.json({ error: 'Target not in this organization.' }, { status: 403 });
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(resolvedAuthId, {
      password: passcode,
    });
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, userId: resolvedAuthId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error.' }, { status: 500 });
  }
}
