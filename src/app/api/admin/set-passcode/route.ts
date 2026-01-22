import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
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

    const { supabase, response } = createSupabaseRouteClient(req);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const requesterAuthId = sessionData.session?.user?.id;
    if (!requesterAuthId) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : sessionError?.message || 'Unauthorized.';
      return applySupabaseCookies(NextResponse.json({ error: message }, { status: 401 }), response);
    }

    const { data: requesterRow, error: requesterError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', requesterAuthId)
      .maybeSingle();

    if (requesterError || !requesterRow) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Requester profile not found.' }, { status: 403 }),
        response
      );
    }

    const requester = normalizeUserRow(requesterRow);
    const requesterRole = requester.role;
    if (requester.organizationId !== organizationId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Organization mismatch.' }, { status: 403 }),
        response
      );
    }

    let resolvedAuthId = authUserId as string | undefined;
    if (!resolvedAuthId && email) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) {
        return applySupabaseCookies(
          NextResponse.json({ error: listErr.message }, { status: 500 }),
          response
        );
      }

      const user = list.users.find(
        (u) => (u.email || '').toLowerCase() === String(email).toLowerCase()
      );
      if (!user) {
        return applySupabaseCookies(
          NextResponse.json({ error: 'Auth user not found.' }, { status: 404 }),
          response
        );
      }
      resolvedAuthId = user.id;
    }

    if (!resolvedAuthId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Auth user not found.' }, { status: 404 }),
        response
      );
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id,organization_id')
      .eq('auth_user_id', resolvedAuthId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
        response
      );
    }

    if (targetUser.organization_id !== organizationId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target not in this organization.' }, { status: 403 }),
        response
      );
    }

    const { data: targetRow, error: targetRowError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_user_id', resolvedAuthId)
      .maybeSingle();

    if (targetRowError || !targetRow) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
        response
      );
    }

    const target = normalizeUserRow(targetRow);

    if (requesterRole === 'MANAGER' && target.role === 'ADMIN') {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Managers cannot reset admin PINs.' }, { status: 403 }),
        response
      );
    }

    if (requesterRole !== 'ADMIN' && requesterRole !== 'MANAGER') {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 }),
        response
      );
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(resolvedAuthId, {
      password: pinValue,
    });
    if (updErr) {
      return applySupabaseCookies(
        NextResponse.json({ error: updErr.message }, { status: 500 }),
        response
      );
    }

    const pinResult = await supabaseAdmin
      .from('users')
      .update({ pin_code: pinValue })
      .eq('auth_user_id', resolvedAuthId);

    if (pinResult.error) {
      if (pinResult.error.message?.toLowerCase().includes('pin_code')) {
        return applySupabaseCookies(
          NextResponse.json(
            { error: 'pin_code column missing. Run /debug/db and apply SQL fixes.' },
            { status: 400 }
          ),
          response
        );
      }
      return applySupabaseCookies(
        NextResponse.json({ error: pinResult.error.message }, { status: 400 }),
        response
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ ok: true, userId: resolvedAuthId }),
      response
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error.' }, { status: 500 });
  }
}
