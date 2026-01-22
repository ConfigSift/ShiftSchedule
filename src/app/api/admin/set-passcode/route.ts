import { NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole } from '@/utils/role';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email, authUserId, passcode, pinCode, organizationId } = await req.json();
    const pinValue = pinCode ?? passcode;

    if ((!email && !authUserId) || !pinValue || !organizationId) {
      return NextResponse.json(
        { error: 'email or auth_user_id, PIN, and organizationId are required.' },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(pinValue)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
    }

    const supabaseServer = await createSupabaseRouteHandlerClient();
    const { data: sessionData, error: sessionError } = await supabaseServer.auth.getSession();
    const requesterAuthId = sessionData.session?.user?.id;
    if (!requesterAuthId) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : sessionError?.message || 'Unauthorized.';
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const { data: requesterRow, error: requesterError } = await supabaseServer
      .from('users')
      .select('*')
      .eq('auth_user_id', requesterAuthId)
      .maybeSingle();

    if (requesterError || !requesterRow) {
      return NextResponse.json({ error: 'Requester profile not found.' }, { status: 403 });
    }

    const requester = normalizeUserRow(requesterRow);
    const requesterRole = requester.role;
    if (requester.organizationId !== organizationId) {
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

    const { data: targetRow, error: targetRowError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_user_id', resolvedAuthId)
      .maybeSingle();

    if (targetRowError || !targetRow) {
      return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
    }

    const target = normalizeUserRow(targetRow);

    if (requesterRole === 'MANAGER' && target.role === 'ADMIN') {
      return NextResponse.json({ error: 'Managers cannot reset admin PINs.' }, { status: 403 });
    }

    if (requesterRole !== 'ADMIN' && requesterRole !== 'MANAGER') {
      return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(resolvedAuthId, {
      password: pinValue,
    });
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    const pinResult = await supabaseAdmin
      .from('users')
      .update({ pin_code: pinValue })
      .eq('auth_user_id', resolvedAuthId);

    if (pinResult.error) {
      if (pinResult.error.message?.toLowerCase().includes('pin_code')) {
        return NextResponse.json(
          { error: 'pin_code column missing. Run /debug/db and apply SQL fixes.' },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: pinResult.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: resolvedAuthId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error.' }, { status: 500 });
  }
}
