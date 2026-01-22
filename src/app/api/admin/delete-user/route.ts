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
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const authUserId = sessionData.session?.user?.id;

  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : sessionError?.message || 'Unauthorized.';
    return applySupabaseCookies(NextResponse.json({ error: message }, { status: 401 }), response);
  }

  const { data: requesterRow, error: requesterError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Requester profile not found.' }, { status: 403 }),
      response
    );
  }

  const requester = normalizeUserRow(requesterRow);
  const requesterRole = requester.role;
  if (!isManagerRole(requesterRole)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 }),
      response
    );
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Organization mismatch.' }, { status: 403 }),
      response
    );
  }

  const { data: targetRow, error: targetError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', payload.userId)
    .maybeSingle();

  if (targetError || !targetRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
      response
    );
  }

  const target = normalizeUserRow(targetRow);

  if (target.organizationId !== payload.organizationId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Target not in this organization.' }, { status: 403 }),
      response
    );
  }

  if (target.authUserId === authUserId) {
    return applySupabaseCookies(
      NextResponse.json({ error: "You can't delete your own account." }, { status: 403 }),
      response
    );
  }

  const targetRole = target.role;
  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers cannot delete admins.' }, { status: 403 }),
      response
    );
  }

  try {
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', payload.userId);

    if (deleteError) {
      return applySupabaseCookies(
        NextResponse.json({ error: deleteError.message }, { status: 400 }),
        response
      );
    }

    if (target.authUserId) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(target.authUserId);
      if (authDeleteError) {
        return applySupabaseCookies(
          NextResponse.json({ error: authDeleteError.message }, { status: 400 }),
          response
        );
      }
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

  return applySupabaseCookies(NextResponse.json({ success: true }), response);
}
